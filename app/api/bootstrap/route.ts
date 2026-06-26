const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BACKEND_URL ||
  "https://stock-webapp-vs3h.onrender.com";

export const runtime = "nodejs";

async function jsonFromResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T;
}

export async function GET() {
  try {
    const loginResponse = await fetch(`${BACKEND_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "admin",
        password: "admin123",
        username: "admin",
        role: "admin",
      }),
    });
    const loginJson = await jsonFromResponse<{
      access_token: string;
      role?: string;
      user_name?: string;
      branch_name?: string;
    }>(loginResponse);
    const token = loginJson.access_token;
    if (!token) {
      throw new Error("Missing admin access token");
    }
    const headers = { Authorization: `Bearer ${token}` };
    const [inventory, overview, moves] = await Promise.all([
      fetch(`${BACKEND_URL}/inventory?limit=1000`, { headers }).then((response) =>
        jsonFromResponse<{ items: unknown[] }>(response)
      ),
      fetch(`${BACKEND_URL}/inventory/overview`, { headers }).then((response) =>
        jsonFromResponse<Record<string, unknown>>(response)
      ),
      fetch(`${BACKEND_URL}/moves?limit=300`, { headers }).then((response) =>
        jsonFromResponse<{ moves: unknown[] }>(response)
      ),
    ]);
    return Response.json({
      token,
      role: loginJson.role || "admin",
      user_name: loginJson.user_name || "Admin",
      branch_name: loginJson.branch_name || "All branches",
      inventory: Array.isArray(inventory.items) ? inventory.items : [],
      overview,
      moves: Array.isArray(moves.moves) ? moves.moves : [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bootstrap request failed";
    return Response.json({ detail: message }, { status: 503 });
  }
}
