const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BACKEND_URL ||
  "https://stock-webapp-vs3h.onrender.com";

export const runtime = "nodejs";

async function proxyRequest(request: Request) {
  try {
    const url = new URL(request.url);
    const prefix = "/api/backend/";
    const pathname = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : "";
    const targetPath = pathname.replace(/^\/+/, "");
    const target = new URL(`${BACKEND_URL.replace(/\/$/, "")}/${targetPath}`);
    target.search = url.search;

    const headers = new Headers(request.headers);
    headers.delete("host");

    const init: RequestInit = {
      method: request.method,
      headers,
      redirect: "manual",
    };

    if (!["GET", "HEAD"].includes(request.method)) {
      init.body = await request.text();
    }

    const response = await fetch(target, init);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("transfer-encoding");

    return new Response(await response.arrayBuffer(), {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proxy request failed";
    console.error("[backend proxy]", message);
    return new Response(
      JSON.stringify({
        detail: `Backend proxy could not reach ${BACKEND_URL}. ${message}`,
      }),
      {
        status: 503,
      headers: { "content-type": "application/json" },
      }
    );
  }
}
export async function GET(request: Request) {
  return proxyRequest(request);
}

export async function POST(request: Request) {
  return proxyRequest(request);
}

export async function PUT(request: Request) {
  return proxyRequest(request);
}

export async function PATCH(request: Request) {
  return proxyRequest(request);
}

export async function DELETE(request: Request) {
  return proxyRequest(request);
}

export async function OPTIONS(request: Request) {
  return proxyRequest(request);
}
