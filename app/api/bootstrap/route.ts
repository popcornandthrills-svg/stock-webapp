import { readFile } from "node:fs/promises";
import { join } from "node:path";

const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BACKEND_URL ||
  (process.env.NODE_ENV === "production" ? "" : "http://127.0.0.1:8000");

export const runtime = "nodejs";

async function jsonFromResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T;
}

async function fetchJsonWithTimeout<T>(url: string, init: RequestInit = {}, timeoutMs = 4000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return await jsonFromResponse<T>(response);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function loadLocalBootstrapSnapshot() {
  const snapshotPath = join(process.cwd(), "public", "local-bootstrap.json");
  const raw = await readFile(snapshotPath, "utf8");
  return JSON.parse(raw) as {
    token?: string;
    role?: string;
    user_name?: string;
    branch_name?: string;
    inventory?: unknown[];
    overview?: Record<string, unknown>;
    moves?: unknown[];
  };
}

export async function GET() {
  try {
    if (!BACKEND_URL) {
      console.warn("[bootstrap] BACKEND_URL is missing; falling back to local snapshot");
      const snapshot = await loadLocalBootstrapSnapshot();
      return Response.json({
        token: snapshot.token || "",
        role: snapshot.role || "admin",
        user_name: snapshot.user_name || "Admin",
        branch_name: snapshot.branch_name || "All branches",
        inventory: Array.isArray(snapshot.inventory) ? snapshot.inventory : [],
        overview: snapshot.overview || {},
        moves: Array.isArray(snapshot.moves) ? snapshot.moves : [],
      });
    }
    try {
      const loginJson = await fetchJsonWithTimeout<{
        access_token: string;
        role?: string;
        user_name?: string;
        branch_name?: string;
      }>(
        `${BACKEND_URL}/auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "admin",
            password: "admin123",
            username: "admin",
            role: "admin",
          }),
        },
        8000
      ).catch(() => ({
        access_token: "",
        role: "admin",
        user_name: "Admin",
        branch_name: "All branches",
      }));
      const token = loginJson.access_token;
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const [inventory, overview, moves] = await Promise.all([
        fetchJsonWithTimeout<{ items: unknown[] }>(`${BACKEND_URL}/inventory?limit=1000`, { headers }, 10000),
        fetchJsonWithTimeout<Record<string, unknown>>(`${BACKEND_URL}/inventory/overview`, { headers }, 10000),
        fetchJsonWithTimeout<{ moves: unknown[] }>(`${BACKEND_URL}/moves?limit=100`, { headers }, 10000),
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
    } catch {
      const snapshot = await loadLocalBootstrapSnapshot();
      return Response.json({
        token: snapshot.token || "",
        role: snapshot.role || "admin",
        user_name: snapshot.user_name || "Admin",
        branch_name: snapshot.branch_name || "All branches",
        inventory: Array.isArray(snapshot.inventory) ? snapshot.inventory : [],
        overview: snapshot.overview || {},
        moves: Array.isArray(snapshot.moves) ? snapshot.moves : [],
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bootstrap request failed";
    return Response.json({ detail: message }, { status: 503 });
  }
}
