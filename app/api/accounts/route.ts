import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

type AccountRecord = {
  username: string;
  password: string;
  role: "admin" | "manager" | "staff";
  branch_name: string;
};

const dataDir = path.join(process.cwd(), "data");
const accountsFile = path.join(dataDir, "accounts.json");

function defaultAdmin(): AccountRecord {
  return { username: "admin", password: "admin123", role: "admin", branch_name: "All branches" };
}

function normalizeUsername(value: string) {
  return String(value || "").trim().toLowerCase();
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin") || request.headers.get("referer") || "";
  if (!origin) return process.env.NODE_ENV !== "production";
  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    if (originUrl.host === requestUrl.host) return true;
    const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    return localHosts.has(originUrl.hostname) && localHosts.has(requestUrl.hostname);
  } catch {
    return false;
  }
}

function sanitizeAccounts(value: unknown): AccountRecord[] {
  if (!Array.isArray(value)) return [defaultAdmin()];
  const cleaned = value
    .filter((account) =>
      Boolean(account)
      && typeof account === "object"
      && typeof (account as AccountRecord).username === "string"
      && typeof (account as AccountRecord).password === "string"
      && typeof (account as AccountRecord).branch_name === "string"
    )
    .map((account) => ({
      username: String((account as AccountRecord).username || "").trim(),
      password: String((account as AccountRecord).password || ""),
      role: ((): "admin" | "manager" | "staff" => {
        const normalized = String((account as AccountRecord).role || "staff").trim().toLowerCase();
        if (normalized === "admin") return "admin";
        if (normalized === "manager") return "manager";
        return "staff";
      })(),
      branch_name: String((account as AccountRecord).branch_name || "All branches").trim() || "All branches",
    }))
    .filter((account) => account.username);

  const withoutAdmin = cleaned.filter((account) => normalizeUsername(account.username) !== "admin");
  return [defaultAdmin(), ...withoutAdmin];
}

async function ensureSeededAccounts() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    const raw = await fs.readFile(accountsFile, "utf8");
    return sanitizeAccounts(JSON.parse(raw) as unknown);
  } catch {
    const seeded = [defaultAdmin()];
    await fs.writeFile(accountsFile, JSON.stringify(seeded, null, 2), "utf8");
    return seeded;
  }
}

async function writeAccounts(accounts: AccountRecord[]) {
  await fs.mkdir(dataDir, { recursive: true });
  const next = sanitizeAccounts(accounts);
  await fs.writeFile(accountsFile, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function GET(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ detail: "Forbidden" }, { status: 403 });
  }
  const accounts = await ensureSeededAccounts();
  return Response.json({ accounts });
}

export async function PUT(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ detail: "Forbidden" }, { status: 403 });
  }
  const payload = (await request.json().catch(() => ({}))) as { accounts?: unknown };
  const accounts = sanitizeAccounts(payload.accounts);
  const saved = await writeAccounts(accounts);
  return Response.json({ accounts: saved });
}
