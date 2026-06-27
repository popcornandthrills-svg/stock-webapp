"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { useParams, useRouter } from "next/navigation";
import { AppLayout } from "../../components/AppLayout";

const API_URL = "/api/backend";
const LOCAL_AUDIT_KEY = "goldprince.auditHistory";
const LOCAL_INVENTORY_KEY = "goldprince.inventoryRows";
const LOCAL_MOVES_KEY = "goldprince.movesRows";
const AUTH_STORAGE_KEYS = {
  token: "goldprince.token",
  role: "goldprince.role",
  userName: "goldprince.userName",
  branchName: "goldprince.branchName",
};

type AnyRecord = Record<string, any>;

type InventoryItem = {
  art_no?: string;
  item_name?: string;
  category?: string;
  available_qty?: number;
  wholesale?: number;
  description?: string;
  branch?: string;
  by?: Record<string, number>;
  created_at?: string;
  updated_at?: string;
};

type MoveRow = {
  created_at?: string;
  mtype?: string;
  type?: string;
  qty?: number;
  quantity?: number;
  from_p?: string;
  from_branch?: string;
  to_p?: string;
  to_branch?: string;
  note?: string;
  art_no?: string;
};

type AuditRow = {
  id?: number;
  event_type?: string;
  role?: string;
  actor_name?: string;
  status?: string;
  note?: string;
  created_at?: string;
  branch_name?: string;
};

function apiUrl(path: string) {
  return `${API_URL}${path}`;
}

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" ? (value as AnyRecord) : {};
}

function getValue(source: AnyRecord, ...keys: string[]) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && String(source[key]).trim() !== "") return source[key];
  }
  const lowerMap = Object.keys(source).reduce<Record<string, any>>((acc, key) => {
    acc[key.toLowerCase()] = source[key];
    return acc;
  }, {});
  for (const key of keys) {
    const value = lowerMap[key.toLowerCase()];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function deepFindValue(input: unknown, ...keys: string[]) {
  const visited = new Set<any>();
  const stack: unknown[] = [input];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);
    const record = current as AnyRecord;
    const direct = getValue(record, ...keys);
    if (direct !== undefined) return direct;
    for (const value of Object.values(record)) {
      if (value && typeof value === "object") stack.push(value);
    }
  }
  return undefined;
}

function normalizeItem(...sources: unknown[]): InventoryItem {
  const merged = Object.assign({}, ...sources.map(asRecord));
  return {
    art_no: String(deepFindValue(merged, "art_no", "ART_NO", "Art No", "Art Number") || ""),
    item_name: String(deepFindValue(merged, "item_name", "ITEM_NAME", "Item Name", "Item") || ""),
    category: String(deepFindValue(merged, "category", "CATEGORY", "Category") || ""),
    available_qty: Number(deepFindValue(merged, "available_qty", "AVAILABLE_QTY", "qty", "QTY", "total", "TOTAL") || 0),
    wholesale: Number(deepFindValue(merged, "wholesale", "WHOLESALE", "Wholesale", "wholesale_price", "WHOLESALE_PRICE") || 0),
    description: String(deepFindValue(merged, "description", "DESCRIPTION", "Description") || ""),
    branch: String(deepFindValue(merged, "branch", "BRANCH", "Branch") || ""),
    by: asRecord(deepFindValue(merged, "by", "BY", "branch_qty", "branchQty") || {}),
  };
}

function matchesArtNo(value: unknown, artNo: string) {
  return String(value || "").trim().toUpperCase() === String(artNo || "").trim().toUpperCase();
}

function parseAuditMoveRow(row: AnyRecord, artNo: string): MoveRow | null {
  const note = String(row.note || "");
  const event = String(row.event_type || "");
  const art = String(artNo || "").trim().toUpperCase();
  const relevant = /transfer|stock movement|branch transfer|branch_transfer|move|inventory/i.test(note) || /transfer|move|stock|inventory/i.test(event);
  if (!note.toUpperCase().includes(art) || !relevant) return null;
  const fromMatch = note.match(/\bfrom\s+([A-Z0-9 ._-]+?)(?:\s+to\b|\s+\||\s+qty\b|\s+note\b|$)/i);
  const toMatch = note.match(/\bto\s+([A-Z0-9 ._-]+?)(?:\s+\||\s+qty\b|\s+note\b|$)/i);
  const qtyMatch = note.match(/\bqty[:\s]+(\d+(?:\.\d+)?)/i) || note.match(/\bquantity[:\s]+(\d+(?:\.\d+)?)/i);
  return {
    created_at: String(row.created_at || ""),
    mtype: /branch transfer/i.test(note) ? "branch_transfer" : /inventory/i.test(note) ? "inventory" : "transfer",
    qty: qtyMatch ? Number(qtyMatch[1]) : 0,
    from_p: fromMatch ? fromMatch[1].trim() : "",
    to_p: toMatch ? toMatch[1].trim() : "",
    note,
    art_no: String(artNo || ""),
  };
}

function normalizeBranchQty(item: InventoryItem) {
  const by = item.by || {};
  const entries = Object.entries(by)
    .filter(([, qty]) => Number(qty) > 0)
    .map(([branch, qty]) => `${branch} ${qty}`);
  if (entries.length) return entries.join(" | ");
  if (item.branch) return `${item.branch} ${item.available_qty ?? 0}`;
  return "-";
}

function formatCurrency(value: number) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value?: string) {
  return String(value || "").slice(0, 10) || "-";
}

function readLocalAuditHistory(): AuditRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_AUDIT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as AuditRow[]) : [];
  } catch {
    return [];
  }
}

function readLocalRecordArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function readStoredToken(key: string) {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeStoredValue(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage issues
  }
}

function downloadTextFile(filename: string, content: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    window.clearTimeout(timer);
  });
}

function excelSafeDate(value?: string) {
  const raw = String(value || "").trim();
  if (!raw || raw === "-") return "";
  const normalized = raw.slice(0, 10);
  const parsed = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? normalized : parsed;
}

function applyProfessionalExcelLayout(sheet: any, options: { title?: string; subtitle?: string; freezeRow?: number; filterRange?: string; widths?: Array<{ wch: number }> } = {}) {
  if (options.title) {
    sheet.A1 = { t: "s", v: options.title };
    if (options.subtitle) {
      sheet.A2 = { t: "s", v: options.subtitle };
    }
  }
  if (options.freezeRow) {
    sheet["!freeze"] = {
      xSplit: 0,
      ySplit: options.freezeRow,
      topLeftCell: `A${options.freezeRow + 1}`,
      activePane: "bottomLeft",
      state: "frozen",
    };
  }
  if (options.filterRange) {
    sheet["!autofilter"] = { ref: options.filterRange };
  }
  if (options.widths) {
    sheet["!cols"] = options.widths;
  }
}

export default function ArtNumberDetailsPage() {
  const params = useParams<{ artNo: string }>();
  const router = useRouter();
  const artNo = decodeURIComponent(String(params?.artNo || "")).trim();
  const [token, setToken] = useState("");
  const [role, setRole] = useState("");
  const [userName, setUserName] = useState("");
  const [branchName, setBranchName] = useState("");
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [moves, setMoves] = useState<MoveRow[]>([]);
  const [history, setHistory] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const bootstrapCacheRef = useRef<{ inventory: AnyRecord[]; moves: AnyRecord[]; audit: AnyRecord[] }>({
    inventory: [],
    moves: [],
    audit: [],
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/bootstrap", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await response.text());
        }
        return response.json() as Promise<{ token?: string; role?: string; user_name?: string; branch_name?: string }>;
      })
      .then((bundle) => {
        if (cancelled) return;
        setToken(bundle.token || "");
        setRole(bundle.role || "admin");
        setUserName(bundle.user_name || "Admin");
        setBranchName(bundle.branch_name || "All branches");
      })
      .catch(() => {
        if (!cancelled) setError("Unable to initialize admin session");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!artNo || !token) return;
    let cancelled = false;
    let refreshTimer: number | null = null;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const storedInventoryRows = readLocalRecordArray<AnyRecord>(LOCAL_INVENTORY_KEY);
        const storedMoveRows = readLocalRecordArray<AnyRecord>(LOCAL_MOVES_KEY);
        const storedAuditRows = readLocalAuditHistory() as AnyRecord[];
        const bootstrapResponse = await fetch("/api/bootstrap", { cache: "no-store" }).catch(() => null);
        const bootstrapJson = bootstrapResponse?.ok ? await bootstrapResponse.json().catch(() => ({})) : {};
        bootstrapCacheRef.current = {
          inventory: Array.isArray(bootstrapJson?.inventory) && bootstrapJson.inventory.length ? bootstrapJson.inventory : storedInventoryRows,
          moves: Array.isArray(bootstrapJson?.moves) && bootstrapJson.moves.length ? bootstrapJson.moves : storedMoveRows,
          audit: Array.isArray(bootstrapJson?.audit) && bootstrapJson.audit.length ? bootstrapJson.audit : storedAuditRows,
        };

        const [itemRes, historyRes, lookupRes, inventoryRes, movesRes, auditRes] = await Promise.all([
          fetchWithTimeout(apiUrl(`/inventory/item-by-art/${encodeURIComponent(artNo)}`), {
            cache: "no-store",
            headers: { Authorization: `Bearer ${token}` },
          }, 8000),
          fetchWithTimeout(apiUrl(`/inventory/item-history/${encodeURIComponent(artNo)}`), {
            cache: "no-store",
            headers: { Authorization: `Bearer ${token}` },
          }, 8000),
          fetchWithTimeout(apiUrl(`/stock/lookup?lookup=${encodeURIComponent(artNo)}`), {
            cache: "no-store",
            headers: { Authorization: `Bearer ${token}` },
          }, 8000),
          fetchWithTimeout(apiUrl(`/inventory?limit=1000&search=${encodeURIComponent(artNo)}`), {
            cache: "no-store",
            headers: { Authorization: `Bearer ${token}` },
          }, 8000),
          fetchWithTimeout(apiUrl(`/moves?limit=1000&art_no=${encodeURIComponent(artNo)}`), {
            // Ask the backend for this art number directly so older movements are not lost
            // when the global recent-moves slice is shorter than the item's history.
            // The backend still returns branch-scoped results based on the admin token.
            cache: "no-store",
            headers: { Authorization: `Bearer ${token}` },
          }, 8000),
          fetchWithTimeout(apiUrl(`/audit-logs?limit=300`), {
            cache: "no-store",
            headers: { Authorization: `Bearer ${token}` },
          }, 8000).catch(() => new Response(JSON.stringify({ items: [] }), { status: 200 })),
        ]);

        const [itemJson, historyJson, lookupJson, inventoryJson, movesJson, auditJson] = await Promise.all([
          itemRes.json().catch(() => ({})),
          historyRes.json().catch(() => ({})),
          lookupRes.json().catch(() => ({})),
          inventoryRes.json().catch(() => ({})),
          movesRes.json().catch(() => ({})),
          auditRes.json().catch(() => ({})),
        ]);

        if (cancelled) return;

        const inventoryRows = Array.isArray(inventoryJson?.items)
          ? inventoryJson.items
          : Array.isArray(inventoryJson?.data)
            ? inventoryJson.data
            : Array.isArray(inventoryJson)
              ? inventoryJson
              : [];
        const bootstrapInventoryRows = bootstrapCacheRef.current.inventory;
        const bootstrapMoveRows = bootstrapCacheRef.current.moves;
        const bootstrapAuditRows = bootstrapCacheRef.current.audit;

        const inventoryMatch =
          inventoryRows.find((row: AnyRecord) => String(deepFindValue(row, "art_no", "ART_NO", "Art No", "Art Number") || "").trim().toUpperCase() === artNo.toUpperCase()) ||
          bootstrapInventoryRows.find((row: AnyRecord) => String(deepFindValue(row, "art_no", "ART_NO", "Art No", "Art Number") || "").trim().toUpperCase() === artNo.toUpperCase()) ||
          {};

        const historyMoveRows = Array.isArray((historyJson as AnyRecord)?.moves) ? (historyJson as AnyRecord).moves : [];
        const rows = Array.isArray(movesJson?.moves) && movesJson.moves.length
          ? movesJson.moves
          : historyMoveRows.length
            ? historyMoveRows
            : bootstrapMoveRows;
        const auditRows = Array.isArray((auditJson as AnyRecord)?.items) && (auditJson as AnyRecord).items.length
          ? (auditJson as AnyRecord).items
          : bootstrapAuditRows;
        const moveRows = rows.filter((row: MoveRow) => matchesArtNo(deepFindValue(row, "art_no", "ART_NO", "Art No", "lookup"), artNo));
        const auditMoveRows = auditRows
          .map((row: AnyRecord) => parseAuditMoveRow(row, artNo))
          .filter((row): row is MoveRow => Boolean(row));
        const combinedMoves = [...moveRows, ...auditMoveRows].filter((row, index, self) => {
          const key = `${String(row.created_at || "")}|${String(row.mtype || row.type || "")}|${String(row.qty ?? row.quantity ?? 0)}|${String(row.from_p || row.from_branch || "")}|${String(row.to_p || row.to_branch || "")}|${String(row.note || "")}`;
          return index === self.findIndex((item) => {
            const itemKey = `${String(item.created_at || "")}|${String(item.mtype || item.type || "")}|${String(item.qty ?? item.quantity ?? 0)}|${String(item.from_p || item.from_branch || "")}|${String(item.to_p || item.to_branch || "")}|${String(item.note || "")}`;
            return itemKey === key;
          });
        });
        const lookupItem = asRecord(lookupJson?.item || lookupJson);
        const bootstrapLookupItem = asRecord(
          bootstrapInventoryRows.find((row: AnyRecord) => String(deepFindValue(row, "art_no", "ART_NO", "Art No", "Art Number") || "").trim().toUpperCase() === artNo.toUpperCase()) ||
            bootstrapMoveRows.find((row: AnyRecord) => matchesArtNo(deepFindValue(row, "art_no", "ART_NO", "Art No", "lookup"), artNo)) ||
            {}
        );
        const fallbackMove = moveRows[0] || auditMoveRows[0] || rows[0] || {};
        const bootstrapFallbackMove = bootstrapMoveRows.find((row: AnyRecord) => matchesArtNo(deepFindValue(row, "art_no", "ART_NO", "Art No", "lookup"), artNo)) || {};
        const storedFallbackMove = storedMoveRows.find((row: AnyRecord) => matchesArtNo(deepFindValue(row, "art_no", "ART_NO", "Art No", "lookup"), artNo)) || {};
        const storedLookupItem = asRecord(
          storedInventoryRows.find((row: AnyRecord) => String(deepFindValue(row, "art_no", "ART_NO", "Art No", "Art Number") || "").trim().toUpperCase() === artNo.toUpperCase()) || {}
        );
        const source = normalizeItem(
          inventoryMatch,
          bootstrapLookupItem,
          storedLookupItem,
          itemJson,
          lookupJson,
          lookupItem,
          fallbackMove,
          bootstrapFallbackMove,
          storedFallbackMove
        );
        const moveBackfillName = String(deepFindValue(fallbackMove, "item_name", "Item Name", "item") || "");
        const moveBackfillCategory = String(deepFindValue(fallbackMove, "category", "Category") || "");
        const moveBackfillBranch = String(deepFindValue(fallbackMove, "branch", "BRANCH") || "");
        const moveBackfillQty =
          Number(deepFindValue(fallbackMove, "qty", "QTY", "quantity", "QUANTITY") || 0) ||
          Number(deepFindValue(bootstrapFallbackMove, "qty", "QTY", "quantity", "QUANTITY") || 0) ||
          Number(deepFindValue(storedFallbackMove, "qty", "QTY", "quantity", "QUANTITY") || 0) ||
          Number(deepFindValue(lookupJson, "available_qty", "AVAILABLE_QTY", "qty", "QTY") || 0);
        const moveBackfillArtNo = String(deepFindValue(fallbackMove, "art_no", "ART_NO", "lookup") || artNo);

        setItem({
          ...source,
          art_no: source.art_no || moveBackfillArtNo || artNo,
          item_name:
            source.item_name ||
            moveBackfillName ||
            String(deepFindValue(bootstrapLookupItem, "item_name", "Item Name", "item") || "") ||
            String(deepFindValue(storedLookupItem, "item_name", "Item Name", "item") || "") ||
            String(deepFindValue(lookupJson, "item_name", "Item Name", "item") || deepFindValue(itemJson, "item_name", "Item Name", "item") || ""),
          category:
            source.category ||
            moveBackfillCategory ||
            String(deepFindValue(bootstrapLookupItem, "category", "Category") || "") ||
            String(deepFindValue(storedLookupItem, "category", "Category") || "") ||
            String(deepFindValue(lookupJson, "category", "Category") || deepFindValue(itemJson, "category", "Category") || ""),
          available_qty:
            Number(
              deepFindValue(lookupJson, "available_qty", "AVAILABLE_QTY", "qty", "QTY") ??
                deepFindValue(inventoryMatch, "available_qty", "AVAILABLE_QTY", "qty", "QTY") ??
                deepFindValue(bootstrapLookupItem, "available_qty", "AVAILABLE_QTY", "qty", "QTY") ??
                deepFindValue(storedLookupItem, "available_qty", "AVAILABLE_QTY", "qty", "QTY") ??
                moveBackfillQty ??
                source.available_qty ??
                0
            ),
          wholesale: Number(deepFindValue(lookupJson, "wholesale", "WHOLESALE", "Wholesale", "wholesale_price") || source.wholesale || 0),
          branch: String(deepFindValue(lookupJson, "branch", "BRANCH") || moveBackfillBranch || source.branch || ""),
          description:
            source.description ||
            String(deepFindValue(bootstrapLookupItem, "description", "Description") || "") ||
            String(deepFindValue(storedLookupItem, "description", "Description") || "") ||
            String(deepFindValue(lookupJson, "description", "Description") || deepFindValue(itemJson, "description", "Description") || ""),
          by: asRecord(deepFindValue(lookupJson, "by", "BY", "branch_qty", "branchQty") || deepFindValue(itemJson, "by", "BY", "branch_qty", "branchQty") || source.by || {}),
        });
        if (!source.art_no && !inventoryMatch && !lookupItem && !combinedMoves.length) {
          setError(`ART NO ${artNo} was not found in the live backend data source.`);
        }
        setMoves(combinedMoves.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))));
        const historyRows = Array.isArray((historyJson as AnyRecord)?.history) ? (historyJson as AnyRecord).history : [];
        const localHistory = readLocalAuditHistory();
        const combined = [...historyRows, ...localHistory]
          .filter((row, index, self) => {
            const key = `${row.id || ""}|${row.created_at || ""}|${row.event_type || ""}|${row.note || ""}`;
            return index === self.findIndex((item) => `${item.id || ""}|${item.created_at || ""}|${item.event_type || ""}|${item.note || ""}` === key);
          })
          .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
        setHistory(combined);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load art number details");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const scheduleRefresh = () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      refreshTimer = window.setTimeout(() => {
        void load();
      }, 5000);
    };
    scheduleRefresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void load();
        scheduleRefresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
    };
  }, [artNo, token]);

  const detailedHistoryRows = useMemo(() => {
    return history.map((row) => {
      const note = String(row.note || "");
      const event = String(row.event_type || "");
      const changeType = /BATCH NO/i.test(note)
        ? "Batch Change"
        : /DESIGN NO/i.test(note)
          ? "Design Change"
          : /stock movement/i.test(note) || /move|transfer|stock/i.test(event)
            ? "Stock Movement"
            : event || "Inventory Change";

      return {
        ...row,
        changeType,
      };
    });
  }, [history]);

  const changeActors = useMemo(() => {
    const inventoryChanges = detailedHistoryRows.filter((row) => String(row.event_type || "").toLowerCase() === "inventory_item_upsert");
    const createdRow = [...inventoryChanges]
      .filter((row) => /created/i.test(String(row.note || "")))
      .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")))[0];
    const updatedRow = [...inventoryChanges]
      .filter((row) => /updated/i.test(String(row.note || "")))
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
    const latestRow = [...inventoryChanges].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
    return {
      createdBy: createdRow?.actor_name || latestRow?.actor_name || "-",
      createdRole: createdRow?.role || latestRow?.role || "-",
      createdBranch: createdRow?.branch_name || latestRow?.branch_name || "-",
      updatedBy: updatedRow?.actor_name || latestRow?.actor_name || "-",
      updatedRole: updatedRow?.role || latestRow?.role || "-",
      updatedBranch: updatedRow?.branch_name || latestRow?.branch_name || "-",
      lastChangeAt: updatedRow?.created_at || latestRow?.created_at || "-",
    };
  }, [detailedHistoryRows]);

  const detailsRows = useMemo(
    () => [
      ["Art No", item?.art_no || artNo || "-"],
      ["Item Name", item?.item_name || "-"],
      ["Category", item?.category || "-"],
      ["Available Qty", String(item?.available_qty ?? 0)],
      ["Branch Qty", normalizeBranchQty(item || {})],
      ["Wholesale", formatCurrency(Number(item?.wholesale || 0))],
      ["Description", item?.description || "-"],
      ...(role === "admin"
        ? [
            ["Created By", `${changeActors.createdBy} (${changeActors.createdRole})`],
            ["Created Branch", changeActors.createdBranch],
            ["Updated By", `${changeActors.updatedBy} (${changeActors.updatedRole})`],
            ["Updated Branch", changeActors.updatedBranch],
            ["Last Change At", formatDate(changeActors.lastChangeAt)],
          ]
        : []),
      ["Created At", formatDate(item?.created_at)],
      ["Last Updated", formatDate(item?.updated_at)],
    ],
    [artNo, changeActors, item, role]
  );

  const changeSummary = useMemo(() => {
    const relevant = history.filter((row) => {
      const note = String(row.note || "").toUpperCase();
      const event = String(row.event_type || "").toLowerCase();
      return note.includes(artNo.toUpperCase()) && event.startsWith("inventory");
    });
    const batchChanges = relevant.filter((row) => /BATCH NO/i.test(String(row.note || ""))).length;
    const designChanges = relevant.filter((row) => /DESIGN NO/i.test(String(row.note || ""))).length;
    const stockMovements = relevant.filter((row) => /stock movement/i.test(String(row.note || "")) || /Qty:/i.test(String(row.note || "")) && /Branch:/i.test(String(row.note || ""))).length;
    return {
      total: relevant.length,
      batchChanges,
      designChanges,
      stockMovements,
    };
  }, [artNo, history]);

  function downloadAsCsv() {
    if (!item) return;
    const rows = [
      ["Field", "Value"],
      ...detailsRows,
      [],
      ["Date", "Type", "Qty", "From", "To", "Note"],
      ...moves.map((row) => [
        formatDate(row.created_at),
        row.mtype || row.type || "-",
        String(row.qty ?? row.quantity ?? 0),
        row.from_p || row.from_branch || "-",
        row.to_p || row.to_branch || "-",
        row.note || "-",
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`)
          .join(",")
      )
      .join("\n");
    return csv;
  }

  function downloadAsExcel() {
    if (!item) return;
    void import("xlsx-js-style").then((XLSX) => {
      const detailsRowsPlain = detailsRows.map(([field, value]) => [field, value]);
      const movesRowsPlain = moves.map((row) => [
        formatDate(row.created_at),
        row.mtype || row.type || "-",
        row.qty ?? row.quantity ?? 0,
        row.from_p || row.from_branch || "-",
        row.to_p || row.to_branch || "-",
        row.note || "-",
      ]);
      const workbook = XLSX.utils.book_new();
      const combinedRows = [
        ["Field", "Value"],
        ...detailsRowsPlain,
        [],
        ["Date", "Type", "Qty", "From", "To", "Note"],
        ...movesRowsPlain,
      ];
      const sheet = XLSX.utils.aoa_to_sheet(combinedRows);
      const headerFill = { fgColor: { rgb: "1F4E78" } };
      const headerFont = { bold: true, color: { rgb: "FFFFFF" } };
      const bodyBorder = {
        top: { style: "thin", color: { rgb: "B8C2CC" } },
        bottom: { style: "thin", color: { rgb: "B8C2CC" } },
        left: { style: "thin", color: { rgb: "B8C2CC" } },
        right: { style: "thin", color: { rgb: "B8C2CC" } },
      };
      const sheetRange = XLSX.utils.decode_range(sheet["!ref"] || "A1:B2");
      for (let row = sheetRange.s.r; row <= sheetRange.e.r; row++) {
        for (let col = sheetRange.s.c; col <= sheetRange.e.c; col++) {
          const ref = XLSX.utils.encode_cell({ r: row, c: col });
          if (!sheet[ref]) continue;
          const isTableHeader = row === 0 || row === 9;
          sheet[ref].s = {
            border: bodyBorder,
            fill: isTableHeader ? headerFill : undefined,
            font: isTableHeader ? headerFont : undefined,
            alignment: { vertical: "center", horizontal: isTableHeader ? "center" : "left", wrapText: true },
          };
        }
      }
      sheet["!cols"] = [{ wch: 18 }, { wch: 40 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 28 }];
      XLSX.utils.book_append_sheet(workbook, sheet, "Item Details");
      XLSX.writeFile(workbook, `${item?.art_no || artNo}_details.xlsx`, { compression: true });
    });
  }

  function downloadAsPdf() {
    if (!item) return;
    void (async () => {
      const pdf = await PDFDocument.create();
      const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const page = pdf.addPage([842, 595]);
      const { height } = page.getSize();
      const marginX = 20;
      const marginTop = 24;
      const rowHeight = 16;
      const titleY = height - marginTop;
      const subtitleY = titleY - 18;
      const startY = subtitleY - 18;
      const detailColWidths = [180, 250];
      const moveColWidths = [90, 100, 50, 100, 100, 80];
      const moveHeaders = ["Date", "Type", "Qty", "From", "To", "Note"];
      const drawCell = (x: number, y: number, w: number, text: string, header = false) => {
        page.drawRectangle({
          x,
          y: y - rowHeight,
          width: w,
          height: rowHeight,
          borderColor: rgb(0.72, 0.76, 0.8),
          borderWidth: 0.6,
          color: header ? rgb(0.12, 0.31, 0.47) : undefined,
        });
        page.drawText(text, {
          x: x + 3,
          y: y - 11,
          size: header ? 8 : 7,
          font: header ? fontBold : fontRegular,
          color: header ? rgb(1, 1, 1) : rgb(0.1, 0.12, 0.15),
        });
      };
      page.drawText(`${item?.art_no || artNo}_details`, { x: marginX, y: titleY, size: 16, font: fontBold, color: rgb(0.08, 0.12, 0.17) });
      page.drawText(`Generated on ${new Date().toLocaleString()}`, { x: marginX, y: subtitleY, size: 8.5, font: fontRegular, color: rgb(0.35, 0.4, 0.45) });
      let y = startY;
      let x = marginX;
      drawCell(x, y, detailColWidths[0], "Field", true);
      x += detailColWidths[0];
      drawCell(x, y, detailColWidths[1], "Value", true);
      y -= rowHeight;
      detailsRows.forEach(([label, value]) => {
        x = marginX;
        drawCell(x, y, detailColWidths[0], String(label));
        x += detailColWidths[0];
        drawCell(x, y, detailColWidths[1], String(value));
        y -= rowHeight;
      });
      y -= 10;
      page.drawText("Stock Movement Section", { x: marginX, y: y - 6, size: 13, font: fontBold, color: rgb(0.08, 0.12, 0.17) });
      y -= 14;
      x = marginX;
      moveHeaders.forEach((header, idx) => {
        drawCell(x, y, moveColWidths[idx], header, true);
        x += moveColWidths[idx];
      });
      y -= rowHeight;
      moves.slice(0, 20).forEach((row) => {
        x = marginX;
        const values = [
          formatDate(row.created_at),
          row.mtype || row.type || "-",
          String(row.qty ?? row.quantity ?? 0),
          row.from_p || row.from_branch || "-",
          row.to_p || row.to_branch || "-",
          row.note || "-",
        ];
        values.forEach((value, idx) => {
          drawCell(x, y, moveColWidths[idx], String(value));
          x += moveColWidths[idx];
        });
        y -= rowHeight;
      });
      const bytes = await pdf.save();
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${item?.art_no || artNo}_details.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    })();
  }

  return (
    <AppLayout
      activeTab="inventory"
      userName={userName || "Guest"}
      branchName={branchName || "All branches"}
      role={role || "staff"}
      status="Opened art number details"
      onNavigate={(tab) => router.push(`/?tab=${tab}`)}
    >
      <section className="art-number-content">
        <section className="panel art-number-page-panel">
          <div className="art-minimal-head">
            <div>
              <div className="section-title">Art number details</div>
              <div className="art-minimal-artno">{artNo || "Art No"}</div>
            </div>
              <div className="art-page-actions">
              <button
                className="classic-btn"
                type="button"
                onClick={() => {
                  router.replace("/?tab=inventory", { scroll: false });
                }}
              >
                Close
              </button>
              <button
                className="classic-btn"
                type="button"
                onClick={() => {
                  downloadAsPdf();
                }}
              >
                Download PDF
              </button>
              <button
                className="classic-btn"
                type="button"
                onClick={() => {
                  downloadAsExcel();
                }}
              >
                Download Excel
              </button>
            </div>
          </div>

          {loading ? <div className="art-minimal-status">Loading details...</div> : null}
          {error ? <div className="art-minimal-error">{error}</div> : null}

          {!loading && (item || moves.length || history.length) ? (
            <>
              <div className="art-details-table art-details-table--minimal">
                {detailsRows.map(([label, value]) => (
                  <div className="art-detail-row" key={label}>
                    <div className="art-detail-label">{label}</div>
                    <div className="art-detail-value">{value}</div>
                  </div>
                ))}
              </div>

              <div className="section-title" style={{ marginTop: 14 }}>
                Stock Movement Section
              </div>
              <div className="table-wrap art-movement-wrap">
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Qty</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moves.length ? (
                      moves.map((row, index) => (
                        <tr
                          key={`${row.created_at || "no-date"}-${row.mtype || row.type || "no-type"}-${row.qty ?? row.quantity ?? "no-qty"}-${index}`}
                        >
                          <td>{formatDate(row.created_at)}</td>
                          <td>{row.mtype || row.type || "-"}</td>
                          <td>{row.qty ?? row.quantity ?? 0}</td>
                          <td>{row.from_p || row.from_branch || "-"}</td>
                          <td>{row.to_p || row.to_branch || "-"}</td>
                          <td>{row.note || "-"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6}>No stock movement rows</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {role === "admin" ? (
                <>
                  <div className="section-title" style={{ marginTop: 14 }}>
                    Admin Change History
                  </div>
                  <div className="table-wrap art-movement-wrap">
                    <table className="inventory-table">
                      <thead>
                        <tr>
                          <th>Change Type</th>
                          <th>Time</th>
                          <th>Actor</th>
                          <th>Role</th>
                          <th>Branch</th>
                          <th>Event</th>
                          <th>Status</th>
                          <th>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailedHistoryRows.length ? (
                          detailedHistoryRows.map((row) => (
                            <tr key={`${row.id || row.created_at || row.event_type || row.note}`}>
                              <td>{row.changeType}</td>
                              <td>{String(row.created_at || "").replace("T", " ").slice(0, 16) || "-"}</td>
                              <td>{row.actor_name || "-"}</td>
                              <td>{row.role || "-"}</td>
                              <td>{row.branch_name || "-"}</td>
                              <td>{row.event_type || "-"}</td>
                              <td>{row.status || "-"}</td>
                              <td>{row.note || "-"}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={8}>No inventory change history found</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </>
          ) : !loading ? (
            <div className="art-minimal-status">No details or stock movement rows found for this art number.</div>
          ) : null}
        </section>
      </section>
    </AppLayout>
  );
}
