"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { AppLayout } from "./components/AppLayout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LoginModule } from "./components/LoginModule";

type LoginResponse = {
  access_token: string;
  role: string;
  user_name: string;
  branch_name: string;
  expires_at: string;
};

type LocalAccount = {
  username: string;
  password: string;
  role: "admin" | "manager" | "staff";
  branch_name: string;
};

type InventoryRow = {
  id?: number;
  created_at?: string;
  art_no: string;
  batch_no?: string;
  design_no?: string;
  item_name: string;
  category?: string;
  weight?: string | number;
  reorder_level?: number;
  wholesale?: number;
  retail?: number;
  total?: number;
  available_qty?: number;
  branch?: string;
  by?: Record<string, number>;
  description?: string;
};

type MoveRow = {
  id?: number;
  mtype?: string;
  qty?: number;
  quantity?: number;
  note?: string;
  created_at?: string;
  art_no?: string;
  category?: string;
  item_name?: string;
  from_p?: string;
  from_branch?: string;
  to_p?: string;
  to_branch?: string;
};

type PendingTransferRow = {
  id: number;
  lookup: string;
  art_no?: string;
  from_branch: string;
  to_branch: string;
  qty: number;
  note: string;
  transfer_date: string;
};

type Analytics = {
  inventory?: {
    skus?: number;
    units?: number;
    wholesale?: number;
    retail?: number;
    low?: InventoryRow[];
  };
  sales?: {
    sales_units?: number;
    sales_entries?: number;
    sales_value?: number;
    top_moving?: Array<{ art_no?: string; item_name?: string; sold_qty?: number; available?: number }>;
    top_overstock?: Array<{ art_no?: string; item_name?: string; available?: number; sold?: number; sold30?: number; score?: number }>;
  };
};

type InventoryOverview = {
  branch?: string;
  skus?: number;
  units?: number;
  wholesale?: number;
  retail?: number;
  low_stock?: Array<{
    id?: number;
    art_no?: string;
    item_name?: string;
    available_qty?: number;
    reorder_level?: number;
  }>;
};

type InventoryUploadRow = {
  row_no: number;
  art_no: string;
  batch_no: string;
  design_no: string;
  item_name: string;
  category: string;
  quantity: string;
  branch: string;
  description: string;
  isNewArt?: boolean;
  hasError?: boolean;
  errorText?: string;
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

const API_URL = "/api/backend";
const branchOptions = ["H.O", "GPH", "GPC", "GPF", "GPS", "MGP", "AMARAVATHI", "KALIMATA", "NAVISHKA"];
const tabs = ["inventory", "inventory-upload", "stock-movement", "moves", "admin-panel"] as const;
type AppTab = (typeof tabs)[number];
const inventoryColumns = ["H.O", "GPH", "GPC", "GPF", "MGP", "GPS", "AMARAVATHI", "KALIMATA", "NAVISHKA"];
const STORAGE_KEYS = {
  token: "goldprince.token",
  inventoryRows: "goldprince.inventoryRows",
  inventoryOverview: "goldprince.inventoryOverview",
  movesRows: "goldprince.movesRows",
  status: "goldprince.status",
  userName: "goldprince.userName",
  branchName: "goldprince.branchName",
  role: "goldprince.role",
  auditHistory: "goldprince.auditHistory",
  pendingTransfers: "goldprince.pendingTransfers",
};

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function apiUrl(path: string) {
  return `${API_URL}${path}`;
}

function readStoredJson<T>(key: string, fallback: T, validator?: (value: unknown) => value is T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (validator && !validator(parsed)) {
      window.localStorage.removeItem(key);
      return fallback;
    }
    return parsed as T;
  } catch {
    window.localStorage.removeItem(key);
    return fallback;
  }
}

function isRecordArray(value: unknown): value is Array<Record<string, any>> {
  return Array.isArray(value);
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isInventoryRowArray(value: unknown): value is InventoryRow[] {
  return Array.isArray(value) && value.every((row) => Boolean(row) && typeof row === "object");
}

function isMoveRowArray(value: unknown): value is MoveRow[] {
  return Array.isArray(value) && value.every((row) => Boolean(row) && typeof row === "object");
}

function isAuditRowArray(value: unknown): value is AuditRow[] {
  return Array.isArray(value) && value.every((row) => Boolean(row) && typeof row === "object");
}

function isLowStockRowArray(value: unknown): value is NonNullable<InventoryOverview["low_stock"]> {
  return Array.isArray(value) && value.every((row) => Boolean(row) && typeof row === "object");
}

function toInventoryRowArray(value: unknown): InventoryRow[] {
  return isInventoryRowArray(value) ? value : [];
}

function toMoveRowArray(value: unknown): MoveRow[] {
  return isMoveRowArray(value) ? value : [];
}

function toAuditRowArray(value: unknown): AuditRow[] {
  return isAuditRowArray(value) ? value : [];
}

function isPendingTransferRowArray(value: unknown): value is PendingTransferRow[] {
  return Array.isArray(value)
    && value.every((row) =>
      Boolean(row)
      && typeof row === "object"
      && typeof (row as PendingTransferRow).id === "number"
      && typeof (row as PendingTransferRow).lookup === "string"
      && typeof (row as PendingTransferRow).from_branch === "string"
      && typeof (row as PendingTransferRow).to_branch === "string"
      && typeof (row as PendingTransferRow).qty === "number"
      && typeof (row as PendingTransferRow).note === "string"
      && typeof (row as PendingTransferRow).transfer_date === "string"
    );
}

function normalizePendingTransfer(row: PendingTransferRow) {
  return {
    ...row,
    lookup: String(row.lookup || "").trim(),
    from_branch: String(row.from_branch || "").trim(),
    to_branch: String(row.to_branch || "").trim(),
    qty: Number(row.qty || 0),
    note: String(row.note || "").trim(),
    transfer_date: String(row.transfer_date || "").trim(),
  };
}

function mergePendingTransfers(rows: PendingTransferRow[]) {
  const merged: PendingTransferRow[] = [];
  for (const rawRow of rows) {
    const row = normalizePendingTransfer(rawRow);
    if (!row.lookup || !row.from_branch || !row.to_branch || !Number.isFinite(row.qty) || row.qty <= 0) continue;
    const existing = merged.find(
      (item) =>
        String(item.lookup).toUpperCase() === row.lookup.toUpperCase()
        && String(item.from_branch).toUpperCase() === row.from_branch.toUpperCase()
        && String(item.to_branch).toUpperCase() === row.to_branch.toUpperCase()
        && String(item.note).toUpperCase() === row.note.toUpperCase()
    );
    if (existing) {
      existing.qty += row.qty;
      if (!existing.transfer_date && row.transfer_date) existing.transfer_date = row.transfer_date;
    } else {
      merged.push({ ...row, id: row.id || Date.now() + Math.floor(Math.random() * 1000) });
    }
  }
  return merged;
}

function isLocalAccountArray(value: unknown): value is LocalAccount[] {
  return Array.isArray(value)
    && value.every((account) =>
      Boolean(account)
      && typeof account === "object"
      && typeof (account as LocalAccount).username === "string"
      && typeof (account as LocalAccount).password === "string"
      && ["admin", "manager", "staff"].includes(String((account as LocalAccount).role || "").toLowerCase())
      && typeof (account as LocalAccount).branch_name === "string"
    );
}

function normalizeAccountName(value: string) {
  return String(value || "").trim().toLowerCase();
}

function defaultAdminAccount(): LocalAccount {
  return { username: "admin", password: "admin123", role: "admin", branch_name: "All branches" };
}

function writeStoredJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage quota or access issues
  }
}

function readStoredSessionJson<T>(key: string, fallback: T, validator?: (value: unknown) => value is T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (validator && !validator(parsed)) {
      window.sessionStorage.removeItem(key);
      return fallback;
    }
    return parsed as T;
  } catch {
    window.sessionStorage.removeItem(key);
    return fallback;
  }
}

function writeStoredSessionJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage quota or access issues
  }
}

function excelSafeDate(value?: string) {
  const raw = String(value || "").trim();
  if (!raw || raw === "-") return "";
  const normalized = raw.slice(0, 10);
  const parsed = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? normalized : parsed;
}

function applyProfessionalExcelLayout(
  sheet: any,
  options: { title?: string; subtitle?: string; freezeRow?: number; filterRange?: string; widths?: Array<{ wch: number }> } = {}
) {
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

function describeUnknownError(value: unknown) {
  if (value instanceof Error) return `${value.message}\n${value.stack || ""}`.trim();
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    if (typeof Event !== "undefined" && value instanceof Event) {
      const eventName = value.type || value.constructor?.name || "browser event";
      return `Unexpected ${eventName}`;
    }
    const maybeEvent = value as { type?: unknown; message?: unknown; name?: unknown };
    if (typeof maybeEvent.type === "string" && typeof maybeEvent.message !== "string" && typeof maybeEvent.name !== "string") {
      return `Unexpected ${maybeEvent.type || "browser"} event`;
    }
    if (typeof maybeEvent.message === "string" && maybeEvent.message.trim()) return maybeEvent.message;
    if (typeof maybeEvent.name === "string" && maybeEvent.name.trim()) return maybeEvent.name;
    try {
      return JSON.stringify(value);
    } catch {
      return Object.prototype.toString.call(value);
    }
  }
  return "";
}

async function api<T>(path: string, token?: string, init?: RequestInit) {
  const response = await fetch(apiUrl(path), {
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(response.status, text || `Request failed: ${response.status}`);
  }
  const text = await response.text();
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

function decodePrice(token: string) {
  const txt = String(token || "").trim();
  if (txt.length < 3) return 0;
  const middle = txt.slice(1, -1);
  const digits = middle.replace(/\D/g, "");
  if (!digits) return 0;
  return Number.parseInt(digits.split("").reverse().join(""), 10);
}

function parseSalesLoad(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split(",").map((part) => part.trim());
      if (parts.length < 4) {
        throw new Error(`Line ${index + 1} must have ART NO, ITEM NAME, PRICE, QUANTITY`);
      }
      const [art_no, item_name, price, quantity] = parts;
      return {
        row_no: index + 1,
        art_no,
        item_name,
        price: Number(price),
        quantity: Number(quantity),
      };
    });
}

function normalizeSalesRows(rows: Array<Record<string, any>>) {
  return rows
    .map((row, index) => {
      const get = (...keys: string[]) => {
        for (const key of keys) {
          const value = row[key];
          if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
        }
        return "";
      };
      return {
        row_no: index + 1,
        art_no: get("ART NO", "ART_NO", "art_no", "Art No", "Art Number", "Barcode"),
        item_name: get("ITEM NAME", "ITEM_NAME", "item_name", "Item Name", "Item", "Product Name"),
        price: Number(get("PRICE", "price", "Wholesale Price", "WHOLESALE PRICE", "Rate", "MRP") || 0),
        quantity: Number(get("QUANTITY", "quantity", "Qty", "QTY", "Quantity Sold") || 0),
      };
    })
    .filter((row) => row.art_no || row.item_name || row.price || row.quantity);
}

const inventoryUploadRequiredColumns = [
  { label: "ART NO", aliases: ["ART NO", "ART_NO", "Art No", "Art Number"] },
  { label: "Batch No", aliases: ["Batch No", "BATCH NO", "Batch_No", "BATCH_NO"] },
  { label: "Design No", aliases: ["Design No", "DESIGN NO", "Design_No", "DESIGN_NO"] },
  { label: "Item Name", aliases: ["Item Name", "ITEM NAME", "ITEM_NAME", "Item"] },
  { label: "Category", aliases: ["Category", "CATEGORY"] },
  { label: "Quantity", aliases: ["Quantity", "QUANTITY", "Qty", "QTY", "Available QTY", "AVAILABLE QTY"] },
  { label: "Branch", aliases: ["Branch", "BRANCH", "Branch Name", "BRANCH NAME"] },
  { label: "Description", aliases: ["Description", "DESCRIPTION", "Desc", "DESC"] },
] as const;

function inventoryUploadMissingColumns(headers: string[]) {
  const normalized = headers.map((value) => normalizeHeaderKey(value));
  return inventoryUploadRequiredColumns
    .filter((column) => !column.aliases.some((alias) => normalized.includes(normalizeHeaderKey(alias))))
    .map((column) => column.label);
}

function isMissingInventoryValue(value: unknown) {
  const text = String(value ?? "").trim();
  return !text || text === "0";
}

function normalizeHeaderKey(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/[\s_-]+/g, "");
}

function parseInventoryUploadRow(row: Record<string, any>, rowNo: number): InventoryUploadRow {
  const normalizedRow = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeHeaderKey(key), value]));
  const get = (...keys: string[]) => {
    for (const key of keys) {
      const value = normalizedRow[normalizeHeaderKey(key)];
      if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
    }
    return "";
  };
  const art_no = get("ART NO", "ART_NO", "art_no", "Art No", "Art Number").trim().toUpperCase();
  const batch_no = get("Batch No", "BATCH NO", "batch_no", "BATCH_NO");
  const design_no = get("Design No", "DESIGN NO", "design_no", "DESIGN_NO");
  const item_name = get("Item Name", "ITEM NAME", "ITEM_NAME", "item_name", "Item");
  const category = get("Category", "CATEGORY", "category") || "None";
  const quantity = get("Quantity", "QUANTITY", "Qty", "QTY", "quantity", "Available QTY", "AVAILABLE QTY");
  const branch = get("Branch", "BRANCH", "branch") || "H.O";
  const description = get("Description", "DESCRIPTION", "description", "Desc", "DESC");
  const hasError =
    isMissingInventoryValue(art_no) ||
    isMissingInventoryValue(batch_no) ||
    isMissingInventoryValue(design_no) ||
    isMissingInventoryValue(item_name) ||
    isMissingInventoryValue(category) ||
    isMissingInventoryValue(quantity) ||
    Number(quantity) < 0 ||
    isMissingInventoryValue(branch) ||
    isMissingInventoryValue(description);
  return {
    row_no: rowNo,
    art_no,
    batch_no,
    design_no,
    item_name,
    category,
    quantity,
    branch,
    description,
    isNewArt: false,
    hasError,
    errorText: hasError ? "All required columns must be filled" : "",
  };
}

function normalizeBranchName(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

export default function Home() {
  const router = useRouter();
  const [token, setToken] = useState(() => (typeof window === "undefined" ? "" : readStoredJson(STORAGE_KEYS.token, "")));
  const [role, setRole] = useState(() => (typeof window === "undefined" ? "" : readStoredJson(STORAGE_KEYS.role, "")));
  const [userName, setUserName] = useState(() => (typeof window === "undefined" ? "" : readStoredJson(STORAGE_KEYS.userName, "")));
  const [branchName, setBranchName] = useState(() => (typeof window === "undefined" ? "" : readStoredJson(STORAGE_KEYS.branchName, "")));
  const [accounts, setAccounts] = useState<LocalAccount[]>([]);
  const [adminNewUsername, setAdminNewUsername] = useState("");
  const [adminNewPassword, setAdminNewPassword] = useState("");
  const [showAdminNewPassword, setShowAdminNewPassword] = useState(false);
  const [adminNewRole, setAdminNewRole] = useState<LocalAccount["role"]>("staff");
  const [adminNewBranch, setAdminNewBranch] = useState("All branches");
  const [editingAccountUsername, setEditingAccountUsername] = useState("");
  const [editingPassword, setEditingPassword] = useState("");
  const [showEditingPassword, setShowEditingPassword] = useState(false);
  const [editingRole, setEditingRole] = useState<LocalAccount["role"]>("staff");
  const [editingBranch, setEditingBranch] = useState("All branches");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>("inventory");
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryBranch, setInventoryBranch] = useState("All");
  const [branchSortColumn, setBranchSortColumn] = useState("");
  const [branchSortDirection, setBranchSortDirection] = useState<"high" | "low">("high");
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([]);
  const [artNoSuggestionRows, setArtNoSuggestionRows] = useState<Array<{ art_no: string; item_name?: string; branch?: string }>>([]);
  const [artNoFormLookup, setArtNoFormLookup] = useState<InventoryRow | null>(null);
  const [inventoryUploadFileName, setInventoryUploadFileName] = useState("");
  const [inventoryUploadFile, setInventoryUploadFile] = useState<File | null>(null);
  const [inventoryUploadRows, setInventoryUploadRows] = useState<InventoryUploadRow[]>([]);
  const [inventoryUploadLoading, setInventoryUploadLoading] = useState(false);
  const [inventoryUploadPopup, setInventoryUploadPopup] = useState<{ title: string; message: string } | null>(null);
  const [inventoryOverview, setInventoryOverview] = useState<InventoryOverview>({});
  const [movesRows, setMovesRows] = useState<MoveRow[]>([]);
  const [auditHistory, setAuditHistory] = useState<AuditRow[]>([]);
  const [movesBranch, setMovesBranch] = useState("All");
  const [movesArtNo, setMovesArtNo] = useState("");
  const [movesDateFrom, setMovesDateFrom] = useState("");
  const [movesDateTo, setMovesDateTo] = useState("");
  const [movesLimit, setMovesLimit] = useState(100);
  const [movesSearch, setMovesSearch] = useState("");
  const [movesSearchMode, setMovesSearchMode] = useState<"all" | "art_no">("all");
  const [movesSortKey, setMovesSortKey] = useState<"date" | "art_no" | "type" | "from" | "to" | "qty" | "category" | "item">("date");
  const [movesSortAsc, setMovesSortAsc] = useState(true);
  const [movesExpanded, setMovesExpanded] = useState(false);
  const [movementLookup, setMovementLookup] = useState("");
  const [movementFrom, setMovementFrom] = useState("H.O");
  const [movementTo, setMovementTo] = useState("GPH");
  const [movementQty, setMovementQty] = useState("");
  const [movementQtyRejected, setMovementQtyRejected] = useState(false);
  const [movementDate, setMovementDate] = useState("");
  const [movementNote, setMovementNote] = useState("");
  const [movementError, setMovementError] = useState("");
  const [movementPopup, setMovementPopup] = useState<{ title: string; message: string; confirm?: boolean } | null>(null);
  const [transferSuccessPopup, setTransferSuccessPopup] = useState<{ title: string; message: string } | null>(null);
  const [inventorySuccessPopup, setInventorySuccessPopup] = useState<{ title: string; message: string } | null>(null);
  const [inventoryPopup, setInventoryPopup] = useState<{ title: string; message: string; confirm?: boolean } | null>(null);
  const [pendingInventoryPayload, setPendingInventoryPayload] = useState<any>(null);
  const [pendingInventoryExists, setPendingInventoryExists] = useState(false);
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransferRow[]>([]);
  const [selectedPendingIds, setSelectedPendingIds] = useState<Set<number>>(() => new Set());
  const [bulkStockFileName, setBulkStockFileName] = useState("");
  const [bulkStockText, setBulkStockText] = useState("");
  const [bulkStockPreview, setBulkStockPreview] = useState<Array<{ item_name: string; art_no: string; wholesale: string; quantity: string; missingArt?: boolean }>>([]);
  const [bulkStockFrom, setBulkStockFrom] = useState("H.O");
  const [bulkStockTo, setBulkStockTo] = useState("GPH");
  const [bulkStockLoading, setBulkStockLoading] = useState(false);
  const [bulkStockPopup, setBulkStockPopup] = useState<{ title: string; message: string; confirm?: boolean } | null>(null);
  const [scanText, setScanText] = useState("");
  const [scanStatus, setScanStatus] = useState("No scan yet");
  const [addDate, setAddDate] = useState("");
  const [sortKey, setSortKey] = useState<
    "sr" | "date" | "art_no" | "batch_no" | "design_no" | "item_name" | "category" | "qty" | "wholesale" | "description"
  >("sr");
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedInventoryIds, setSelectedInventoryIds] = useState<Set<number>>(() => new Set());
  const [inventoryMenuOpen, setInventoryMenuOpen] = useState(false);
  const [inventoryHighlightBranch, setInventoryHighlightBranch] = useState("");
  const [inventoryHighlightArtNo, setInventoryHighlightArtNo] = useState("");
  const [inventoryHighlightExpiresAt, setInventoryHighlightExpiresAt] = useState<number | null>(null);
  const [selectedArtNo, setSelectedArtNo] = useState("");
  const [selectedItemDetail, setSelectedItemDetail] = useState<any>(null);
  const [artDetailsOpen, setArtDetailsOpen] = useState(false);
  const [barcodeScan, setBarcodeScan] = useState("");
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [barcodeScanTarget, setBarcodeScanTarget] = useState<"add-item" | "stock-transfer">("add-item");
  const [hydrated, setHydrated] = useState(false);
  const barcodeSvgRef = useRef<SVGSVGElement | null>(null);
  const inventorySearchRef = useRef<HTMLInputElement | null>(null);
  const movementQtyRef = useRef<HTMLInputElement | null>(null);
  const bulkStockPopupTimerRef = useRef<number | null>(null);
  const inventoryUploadPopupTimerRef = useRef<number | null>(null);
  const inventoryHighlightTimerRef = useRef<number | null>(null);
  const transferSuccessPopupTimerRef = useRef<number | null>(null);
  const inventorySuccessPopupTimerRef = useRef<number | null>(null);
  const refreshInFlightRef = useRef(false);
  const pageSize = 20;

  const normalizeTab = (value: string | null | undefined): AppTab => {
    return tabs.includes(value as AppTab) ? (value as AppTab) : "inventory";
  };

  const handleNavigate = (tab: string) => {
    const nextTab = normalizeTab(tab);
    setActiveTab(nextTab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", nextTab);
      router.replace(`${url.pathname}?${url.searchParams.toString()}`, { scroll: false });
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextTab = normalizeTab(new URL(window.location.href).searchParams.get("tab"));
    setActiveTab(nextTab);
  }, []);
  const [itemForm, setItemForm] = useState({
    art_no: "",
    batch_no: "",
    design_no: "",
    item_name: "",
    wholesale: "",
    description: "",
    category: "None",
    quantity: "0",
    branch: "H.O",
  });

  useEffect(() => {
    if (movementDate) return;
    setMovementDate(new Date().toISOString().slice(0, 10));
  }, [movementDate]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    loadBootstrapBundle()
      .then((bundle) => {
        if (cancelled) return;
        setToken(bundle.token || "");
        setRole(bundle.role || "admin");
        setUserName(bundle.user_name || "Admin");
        setBranchName(bundle.branch_name || "All branches");
        setInventoryRows(toInventoryRowArray(bundle.inventory || []));
        setInventoryOverview(isPlainObject(bundle.overview) ? bundle.overview : {});
        setMovesRows(toMoveRowArray(bundle.moves || []));
        setStatus("");
      })
      .catch(() => {
        if (!cancelled) setError("Unable to initialize admin session");
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    setArtNoSuggestionRows(
      inventoryRows
        .map((row) => ({
          art_no: String(row.art_no || "").trim(),
          item_name: String(row.item_name || "").trim(),
          branch: String(row.branch || "").trim(),
        }))
        .filter((row) => row.art_no)
    );
  }, [hydrated, inventoryRows]);

  useEffect(() => {
    if (!hydrated) return;
    void loadAccounts();
  }, [hydrated]);

  useEffect(() => {
    if (role === "admin") return;
    if (activeTab === "admin-panel") {
      setActiveTab("inventory");
    }
  }, [activeTab, role]);

  useEffect(() => {
    writeStoredJson(STORAGE_KEYS.token, token);
  }, [token]);

  useEffect(() => {
    writeStoredJson(STORAGE_KEYS.role, role);
  }, [role]);

  useEffect(() => {
    writeStoredJson(STORAGE_KEYS.userName, userName);
  }, [userName]);

  useEffect(() => {
    writeStoredJson(STORAGE_KEYS.branchName, branchName);
  }, [branchName]);

  useEffect(() => {
    writeStoredJson(STORAGE_KEYS.status, status);
  }, [status]);

  useEffect(() => {
    writeStoredJson(STORAGE_KEYS.inventoryRows, inventoryRows);
  }, [inventoryRows]);

  useEffect(() => {
    writeStoredJson(STORAGE_KEYS.inventoryOverview, inventoryOverview);
  }, [inventoryOverview]);

  useEffect(() => {
    writeStoredJson(STORAGE_KEYS.movesRows, movesRows);
  }, [movesRows]);

  useEffect(() => {
    writeStoredJson(STORAGE_KEYS.auditHistory, auditHistory);
  }, [auditHistory]);

  useEffect(() => {
    if (!hydrated) return;
    const restored = readStoredSessionJson<PendingTransferRow[]>(STORAGE_KEYS.pendingTransfers, [], isPendingTransferRowArray);
    const merged = mergePendingTransfers(restored);
    if (merged.length && pendingTransfers.length === 0) {
      setPendingTransfers(merged);
    }
  }, [hydrated, pendingTransfers.length]);

  useEffect(() => {
    if (!hydrated) return;
    writeStoredSessionJson(STORAGE_KEYS.pendingTransfers, mergePendingTransfers(pendingTransfers));
  }, [hydrated, pendingTransfers]);

  function branchIdForName(branchName: string) {
    const normalized = String(branchName || "").trim().toUpperCase();
    const index = branchOptions.findIndex((branch) => branch.trim().toUpperCase() === normalized);
    return index >= 0 ? index + 1 : 1;
  }

  function projectInventoryRowToAddItem(row: InventoryRow) {
    setItemForm((prev) => ({
      ...prev,
      art_no: String(row.art_no || ""),
      batch_no: String(row.batch_no || ""),
      design_no: String(row.design_no || ""),
      item_name: String(row.item_name || ""),
      category: String(row.category || prev.category || "None"),
      wholesale: String(row.wholesale ?? prev.wholesale ?? ""),
      description: String(row.description || prev.description || ""),
      quantity: String(row.available_qty ?? row.total ?? prev.quantity ?? ""),
      branch: String(row.branch || prev.branch || "H.O"),
    }));
  }

  useEffect(() => {
    const nextWholesale = String(decodePrice(itemForm.batch_no));
    setItemForm((prev) => (prev.wholesale === nextWholesale ? prev : { ...prev, wholesale: nextWholesale }));
  }, [itemForm.batch_no]);

  const branchList = useMemo(() => ["All", ...branchOptions], []);

  const visibleRows = useMemo(() => {
    const term = inventorySearch.trim().toUpperCase();
    const rows = [...inventoryRows].filter((row) => {
      if (!term) return true;
      return [
        row.art_no,
        row.batch_no,
        row.design_no,
        row.item_name,
        row.category,
        row.description,
        row.branch,
        String(row.created_at || "").slice(0, 10),
        row.wholesale,
        row.available_qty ?? row.total,
        ...(row.by ? Object.entries(row.by).map(([branch, qty]) => `${branch} ${qty}`) : []),
      ].some((value) => String(value ?? "").toUpperCase().includes(term));
    });
    const getValue = (row: InventoryRow, index: number) => {
      if (sortKey === "sr") return index + 1;
      if (sortKey === "date") return String(row.created_at || "");
      if (sortKey === "art_no") return String(row.art_no || "");
      if (sortKey === "batch_no") return String(row.batch_no || "");
      if (sortKey === "design_no") return String(row.design_no || "");
      if (sortKey === "item_name") return String(row.item_name || "");
      if (sortKey === "category") return String(row.category || "");
      if (sortKey === "qty") return Number(row.available_qty ?? row.total ?? 0);
      if (sortKey === "description") return String(row.description || "");
      return Number(row.wholesale ?? 0);
    };
    rows.sort((a, b) => {
      const ai = inventoryRows.indexOf(a);
      const bi = inventoryRows.indexOf(b);
      const branchColumn = String(branchSortColumn || "").trim().toUpperCase();
      const branchValueA =
        branchColumn === "AVAILABLE"
          ? Number(a.available_qty ?? a.total ?? 0)
          : branchColumn
            ? Number(a.by?.[branchColumn] ?? 0)
            : null;
      const branchValueB =
        branchColumn === "AVAILABLE"
          ? Number(b.available_qty ?? b.total ?? 0)
          : branchColumn
            ? Number(b.by?.[branchColumn] ?? 0)
            : null;
      const va = branchColumn ? branchValueA : getValue(a, ai);
      const vb = branchColumn ? branchValueB : getValue(b, bi);
      const descending = branchColumn ? branchSortDirection === "high" : !sortAsc;
      if (typeof va === "number" && typeof vb === "number") return descending ? vb - va : va - vb;
      return descending ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb));
    });
    return rows;
  }, [inventoryRows, inventorySearch, sortKey, sortAsc, branchSortColumn, branchSortDirection]);

  const selectedInventoryRows = useMemo(
    () => inventoryRows.filter((row) => row.id != null && selectedInventoryIds.has(row.id)),
    [inventoryRows, selectedInventoryIds]
  );
  const visibleSelectionState = useMemo(() => {
    const visibleSelectableRows = visibleRows.filter((row) => row.id != null);
    const selectedCount = visibleSelectableRows.filter((row) => row.id != null && selectedInventoryIds.has(row.id)).length;
    const allSelected = visibleSelectableRows.length > 0 && selectedCount === visibleSelectableRows.length;
    const someSelected = selectedCount > 0 && !allSelected;
    return { allSelected, someSelected };
  }, [visibleRows, selectedInventoryIds]);
  const filteredMovesRows = useMemo(() => {
    const artFilter = (movesArtNo || selectedArtNo || "").trim().toUpperCase();
    const searchFilter = movesSearch.trim().toUpperCase();
    const fromDate = movesDateFrom ? new Date(`${movesDateFrom}T00:00:00`) : null;
    const toDate = movesDateTo ? new Date(`${movesDateTo}T23:59:59.999`) : null;
    const branchFilter = String(movesBranch || "").trim().toUpperCase();
    return movesRows.filter((row) => {
      const rowArt = String(row.art_no || "").trim().toUpperCase();
      const rowDate = row.created_at ? new Date(row.created_at) : null;
      const rowDateText = String(row.created_at || "").slice(0, 10).toUpperCase();
      const rowFrom = String(row.from_p || row.from_branch || "").trim().toUpperCase();
      const rowTo = String(row.to_p || row.to_branch || "").trim().toUpperCase();
      const matchesArt = !artFilter || rowArt.includes(artFilter);
      const matchesBranch = !branchFilter || branchFilter === "ALL" || rowFrom === branchFilter || rowTo === branchFilter;
      const matchesSearch =
        !searchFilter ||
        (movesSearchMode === "art_no"
          ? [row.art_no].some((value) => String(value || "").toUpperCase().includes(searchFilter))
          : [row.art_no, row.category, row.item_name, row.mtype, row.from_p, row.to_p, row.note, rowDateText, rowFrom, rowTo].some((value) =>
              String(value || "").toUpperCase().includes(searchFilter)
            ));
      const matchesFrom = !fromDate || (rowDate ? rowDate >= fromDate : false);
      const matchesTo = !toDate || (rowDate ? rowDate <= toDate : false);
      return matchesArt && matchesBranch && matchesSearch && matchesFrom && matchesTo;
    });
  }, [movesRows, selectedArtNo, movesArtNo, movesSearch, movesSearchMode, movesDateFrom, movesDateTo, movesBranch]);
  const groupedMovesRows = useMemo(() => {
    const groups = new Map<string, MoveRow[]>();
    filteredMovesRows.forEach((row) => {
      const dateKey = String(row.created_at || "").slice(0, 10) || "-";
      const artKey = String(row.art_no || "").trim().toUpperCase() || "-";
      const key = `${dateKey}__${artKey}`;
      const list = groups.get(key) || [];
      list.push(row);
      groups.set(key, list);
    });
    const grouped = Array.from(groups.entries()).map(([key, rows]) => {
      const [date, artNo] = key.split("__");
      const head = rows[0] || {};
      return {
        key,
        date,
        artNo,
        rows,
        category: String(head.category || "-"),
        itemName: String(head.item_name || "-"),
        totalQty: rows.reduce((sum, row) => sum + Number(row.qty ?? row.quantity ?? 0), 0),
      };
    });
    const sortValue = (row: { date: string; artNo: string; rows: MoveRow[]; category: string; itemName: string; totalQty: number }) => {
      const head = row.rows[0] || {};
      switch (movesSortKey) {
        case "art_no":
          return row.artNo;
        case "type":
          return String(head.mtype || "");
        case "from":
          return String(head.from_p || head.from_branch || "");
        case "to":
          return String(head.to_p || head.to_branch || "");
        case "qty":
          return row.totalQty;
        case "category":
          return row.category;
        case "item":
          return row.itemName;
        case "date":
        default:
          return row.date;
      }
    };
    grouped.sort((a, b) => {
      const va = sortValue(a);
      const vb = sortValue(b);
      if (typeof va === "number" && typeof vb === "number") {
        return movesSortAsc ? va - vb : vb - va;
      }
      return movesSortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return grouped;
  }, [filteredMovesRows, movesSortKey, movesSortAsc]);

  const totalPages = Math.max(1, Math.ceil(inventoryRows.length / pageSize));
  const allVisibleSelected =
    visibleRows.length > 0 &&
    visibleRows.every((row) => row.id != null && selectedInventoryIds.has(row.id));
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const isInventoryUploadTab = activeTab === "inventory-upload";

  async function loadBootstrapBundle() {
    const response = await fetch("/api/bootstrap", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return (await response.json()) as {
      token: string;
      role?: string;
      user_name?: string;
      branch_name?: string;
      inventory?: InventoryRow[];
      overview?: InventoryOverview;
      moves?: MoveRow[];
    };
  }

  async function refreshAll() {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const bundle = await loadBootstrapBundle();
      const nextInventoryRows = toInventoryRowArray(bundle.inventory || []);
      const nextInventoryOverview = isPlainObject(bundle.overview) ? bundle.overview : {};
      const nextMovesRows = toMoveRowArray(bundle.moves || []);
      setToken(bundle.token || "");
      setRole(bundle.role || "admin");
      setUserName(bundle.user_name || "Admin");
      setBranchName(bundle.branch_name || "All branches");
      setInventoryRows((current) => (nextInventoryRows.length ? nextInventoryRows : current));
      setInventoryOverview((current) =>
        Object.keys(nextInventoryOverview).length ? nextInventoryOverview : current
      );
      setMovesRows((current) => (nextMovesRows.length ? nextMovesRows : current));
      setError("");
    } finally {
      refreshInFlightRef.current = false;
    }
  }

  function appendLocalAuditHistory(payload: any, action: "created" | "updated") {
    const artNo = String(payload.art_no || "").trim().toUpperCase();
    const actor = String(userName || (String(role || "").toLowerCase() === "admin" ? "Admin" : "User") || "").trim() || "Unknown";
    const branch = String(payload.branch || branchName || "H.O").trim() || "H.O";
    const quantity = Number(payload.quantity || 0);
    const row: AuditRow = {
      id: Date.now(),
      event_type: "inventory_item_upsert",
      role: String(role || "admin"),
      actor_name: actor,
      status: "Success",
      created_at: new Date().toISOString(),
      branch_name: branch,
      note: `ART NO ${artNo} ${action} by ${actor} | Batch No: ${String(payload.batch_no || "").trim()} | Design No: ${String(payload.design_no || "").trim()} | Item: ${String(payload.item_name || "").trim()} | Qty: ${quantity} | Branch: ${branch}`,
    };
    setAuditHistory((current) => [row, ...current].slice(0, 500));
  }

  async function openArtDetails(artNo: string) {
    const nextArt = artNo.trim();
    if (!nextArt) return;
    try {
      const [item, lookup] = await Promise.all([
        api<any>(`/inventory/item-by-art/${encodeURIComponent(nextArt)}`, token),
        api<any>(`/stock/lookup?lookup=${encodeURIComponent(nextArt)}`, token),
      ]);
      const source = item || lookup?.item || {};
      const branch = lookup?.branch || branchName || "All branches";
      const available = lookup?.item?.available_qty ?? source.available_qty ?? source.total ?? 0;
      const wholesale = source.wholesale ?? 0;
      const relatedMoves = movesRows.filter((row) => String(row.art_no || "").toUpperCase() === nextArt.toUpperCase());
      setItemForm((prev) => ({
        ...prev,
        art_no: String(source.art_no || nextArt),
        batch_no: String(source.batch_no || ""),
        design_no: String(source.design_no || ""),
        item_name: String(source.item_name || ""),
        category: String(source.category || prev.category || "None"),
        wholesale: String(source.wholesale ?? 0),
      }));
      setSelectedArtNo(nextArt);
      setSelectedItemDetail({
        item: {
          ...source,
          art_no: String(source.art_no || nextArt),
          batch_no: String(source.batch_no || "-"),
          category: String(source.category || "-"),
          item_name: String(source.item_name || "-"),
          available_qty: Number(available || 0),
          wholesale: Number(wholesale || 0),
          weight: String(source.weight || lookup?.item?.weight || ""),
        },
        lookup: lookup?.item || null,
        branch,
        movementRows: relatedMoves,
      });
      setArtDetailsOpen(true);
      setStatus(`Opened details for ${nextArt}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load item details");
    }
  }

  function closeArtDetails() {
    setArtDetailsOpen(false);
    setSelectedArtNo("");
    setSelectedItemDetail(null);
  }

  useEffect(() => {
    if (!token) return;
  }, [token]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = String(event.key || "").toLowerCase();
      if (key === "f5") {
        event.preventDefault();
        refreshAll().catch((err) => setError(err instanceof Error ? err.message : "Refresh failed"));
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === "f") {
        event.preventDefault();
        inventorySearchRef.current?.focus();
        inventorySearchRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [inventorySearch, inventoryBranch, movesBranch, movesLimit, token]);

  useEffect(() => {
    if (!inventoryMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.(".inventory-menu") || target?.closest?.(".menu-btn") || target?.closest?.(".candybox-btn")) return;
      setInventoryMenuOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [inventoryMenuOpen]);

  function enqueueTransfer() {
    const lookup = movementLookup.trim();
    if (!lookup) {
      const message = "Enter an ART NO before adding to pending queue";
      setMovementPopup({ title: "Warning", message });
      setMovementError(message);
      setMovementQtyRejected(true);
      return;
    }
    if (movementFrom === movementTo) {
      const message = `From ${movementFrom} and To ${movementTo} cannot be same`;
      setMovementPopup({ title: "Warning", message });
      setMovementError(message);
      setMovementQtyRejected(true);
      return;
    }
    const availableQty = getBranchAvailableQty(movementLookupRecord, movementFrom);
    const pendingQtyFromBranch = pendingTransfers
      .filter(
        (row) =>
          String(row.lookup || "").trim().toUpperCase() === lookup.toUpperCase() &&
          String(row.from_branch || "").trim().toUpperCase() === movementFrom.trim().toUpperCase()
      )
      .reduce((sum, row) => sum + Number(row.qty || 0), 0);
    const qtyValue = Number(movementQty);
    if (!Number.isFinite(qtyValue) || qtyValue <= 0) {
      const message = "Enter a valid Quantity";
      setMovementPopup({ title: "Warning", message });
      setMovementError(message);
      setMovementQtyRejected(true);
      return;
    }
    const totalRequestedQty = pendingQtyFromBranch + qtyValue;
    if (availableQty <= 0) {
      const message = `Branch ${movementFrom} does not have any qty for ${lookup}`;
      setMovementPopup({ title: "Warning", message });
      setMovementError(message);
      setMovementQtyRejected(true);
      return;
    }
    if (totalRequestedQty > availableQty) {
      const message =
        pendingQtyFromBranch > 0
          ? `Only ${availableQty} Qty available in ${movementFrom} for ${lookup}. You already have ${pendingQtyFromBranch} Qty pending from this branch.`
          : `Only ${availableQty} Qty available in ${movementFrom} for ${lookup}`;
      setMovementPopup({ title: "Warning", message });
      setMovementError(message);
      setMovementQtyRejected(true);
      return;
    }
    setMovementError("");
    setMovementQtyRejected(false);
    setPendingTransfers((current) => mergePendingTransfers([
      ...current,
      {
        id: Date.now() + Math.floor(Math.random() * 1000),
        lookup,
        from_branch: movementFrom,
        to_branch: movementTo,
        qty: qtyValue,
        note: movementNote.trim(),
        transfer_date: movementDate,
      },
    ]));
    setStatus(`Added ${lookup} to pending queue`);
    setMovementQty("");
  }

  function clearPendingQueue() {
    setPendingTransfers([]);
    setSelectedPendingIds(new Set());
    setMovementError("");
    setStatus("Pending queue cleared");
  }

  function removeSelectedPending() {
    if (!selectedPendingIds.size) return;
    setPendingTransfers((current) => current.filter((row) => !selectedPendingIds.has(row.id)));
    setSelectedPendingIds(new Set());
    setStatus("Removed selected pending rows");
  }

  function openBulkStockFilePicker() {
    const input = document.querySelector<HTMLInputElement>(".bulk-stock-panel input[type='file']");
    input?.click();
  }

  function openInventoryUploadPage() {
    setActiveTab("inventory-upload");
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(".inventory-upload-panel input[type='file']");
      input?.click();
    }, 0);
  }

  function showBulkStockPopupTemporarily(title: string, message: string) {
    setBulkStockPopup({ title, message });
    if (bulkStockPopupTimerRef.current) {
      window.clearTimeout(bulkStockPopupTimerRef.current);
    }
    bulkStockPopupTimerRef.current = window.setTimeout(() => {
      setBulkStockPopup((current) => (current?.title === title && current?.message === message ? null : current));
      bulkStockPopupTimerRef.current = null;
    }, 3000);
  }

  function showInventoryUploadPopupTemporarily(title: string, message: string) {
    setInventoryUploadPopup({ title, message });
    if (inventoryUploadPopupTimerRef.current) {
      window.clearTimeout(inventoryUploadPopupTimerRef.current);
    }
    inventoryUploadPopupTimerRef.current = window.setTimeout(() => {
      setInventoryUploadPopup((current) => (current?.title === title && current?.message === message ? null : current));
      inventoryUploadPopupTimerRef.current = null;
    }, 3000);
  }

  function openInventoryUploadPicker() {
    const input = document.querySelector<HTMLInputElement>(".inventory-upload-panel input[type='file']");
    input?.click();
  }

  function clearInventoryUploadSelection() {
    setInventoryUploadFileName("");
    setInventoryUploadFile(null);
    setInventoryUploadRows([]);
    const input = document.querySelector<HTMLInputElement>(".inventory-upload-panel input[type='file']");
    if (input) input.value = "";
  }

  async function loadInventoryUploadFile(fileOverride?: File | null) {
    const file = fileOverride ?? inventoryUploadFile;
    if (!file) {
      showInventoryUploadPopupTemporarily("No File", "Choose an inventory Excel file before loading.");
      return;
    }
    setError("");
    setInventoryUploadPopup(null);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) {
        setInventoryUploadRows([]);
        setInventoryUploadPopup({ title: "Invalid Inventory File", message: "The uploaded file has no usable worksheet." });
        return;
      }
      const sheet = workbook.Sheets[firstSheet];
      const headers = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, blankrows: false }) as any[][];
      const firstRow = Array.isArray(headers[0]) ? headers[0].map((cell) => String(cell ?? "").trim()) : [];
      const missingColumns = inventoryUploadMissingColumns(firstRow);
      if (missingColumns.length) {
        setInventoryUploadRows([]);
        setInventoryUploadPopup({
          title: "Invalid Inventory File",
          message: `Missing required columns: ${missingColumns.join(", ")}. Add all required columns before uploading again.`,
        });
        return;
      }
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
      const artSet = new Set(inventoryRows.map((row) => String(row.art_no || "").trim().toUpperCase()).filter(Boolean));
      const rows = json.map((row, index) => {
        const parsed = parseInventoryUploadRow(row, index + 2);
        parsed.isNewArt = Boolean(parsed.art_no) && !artSet.has(parsed.art_no);
        if (normalizedRole === "staff") {
          const uploadBranch = normalizeBranchName(parsed.branch);
          const loginBranch = normalizeBranchName(branchName);
          if (loginBranch && loginBranch !== "ALL BRANCHES" && uploadBranch && uploadBranch !== loginBranch) {
            parsed.hasError = true;
            parsed.errorText = `Branch mismatch. Staff login branch is ${branchName}; row branch is ${parsed.branch}.`;
          }
        }
        return parsed;
      });
      const staffBranchMismatches =
        normalizedRole === "staff"
          ? Array.from(
              new Set(
                rows
                  .filter((row) => String(row.errorText || "").toLowerCase().includes("branch mismatch"))
                  .map((row) => String(row.branch || "").trim())
                  .filter(Boolean)
              )
            )
          : [];
      const invalidRows = rows.filter((row) => row.hasError);
      const sortedRows = [
        ...rows.filter((row) => row.isNewArt && !row.hasError),
        ...rows.filter((row) => !row.isNewArt && !row.hasError),
        ...rows.filter((row) => row.hasError),
      ];
      if (invalidRows.length) {
        setInventoryUploadRows(sortedRows);
        if (staffBranchMismatches.length) {
          setInventoryUploadPopup({
            title: "Branch Mismatch",
            message: `Rows from these branches were not accepted for your login branch (${branchName}): ${staffBranchMismatches.join(", ")}. Please correct the Branch column and upload again.`,
          });
          return;
        }
        setInventoryUploadPopup({
          title: "Invalid Inventory File",
          message: `Some rows contain empty or zero values in required columns. ${invalidRows.slice(0, 5).map((row) => `Row ${row.row_no}`).join(" | ")}${invalidRows.length > 5 ? " | ..." : ""}`,
        });
        return;
      }
      setInventoryUploadRows(sortedRows);
      setStatus(`Loaded ${rows.length} inventory rows from ${file.name}`);
      setInventoryUploadPopup({
        title: "Inventory Loaded",
        message: `Loaded ${rows.length} rows from ${file.name}. Review the preview below before uploading.`,
      });
    } catch {
      setInventoryUploadRows([]);
      setInventoryUploadPopup({
        title: "Invalid Inventory File",
        message: "Please upload a valid Excel file with the required columns.",
      });
    }
  }

  async function uploadInventoryRows() {
    if (!inventoryUploadRows.length) {
      showInventoryUploadPopupTemporarily("No Rows", "Choose a valid inventory Excel file before uploading.");
      return;
    }
    if (inventoryUploadRows.some((row) => row.hasError)) {
      const staffBranchMismatches = Array.from(
        new Set(
          inventoryUploadRows
            .filter((row) => String(row.errorText || "").toLowerCase().includes("branch mismatch"))
            .map((row) => String(row.branch || "").trim())
            .filter(Boolean)
        )
      );
      if (normalizedRole === "staff" && staffBranchMismatches.length) {
        showInventoryUploadPopupTemporarily(
          "Branch Mismatch",
          `Rows from these branches are not accepted for your login branch (${branchName}): ${staffBranchMismatches.join(", ")}. Please correct the Branch column before uploading.`,
        );
        return;
      }
      showInventoryUploadPopupTemporarily("Fix Missing Values", "Some rows are still missing required values. Please correct the red rows and upload again.");
      return;
    }
    setInventoryUploadLoading(true);
    setError("");
    try {
      let created = 0;
      let updated = 0;
      for (const row of inventoryUploadRows) {
        const payload = {
          art_no: row.art_no,
          batch_no: row.batch_no,
          design_no: row.design_no,
          item_name: row.item_name,
          category: row.category,
          branch: row.branch,
          branch_id: branchIdForName(row.branch),
          desc: row.description,
          quantity: Number(row.quantity || 0),
          reorder_level: 0,
          reorder: 0,
        };
        const existingRow = inventoryRows.find((item) => String(item.art_no || "").trim().toUpperCase() === row.art_no);
        if (existingRow) updated += 1;
        else created += 1;
        await commitInventoryItem(payload);
      }
      showInventoryUploadPopupTemporarily(
        "Inventory Uploaded",
        `Processed ${inventoryUploadRows.length} rows. Added ${created} new ART NO${created === 1 ? "" : "s"} and updated ${updated} existing row${updated === 1 ? "" : "s"}.`,
      );
      clearInventoryUploadSelection();
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inventory upload failed");
    } finally {
      setInventoryUploadLoading(false);
    }
  }

  function addBulkStockToPendingQueue() {
    if (!bulkStockPreview.length) {
      showBulkStockPopupTemporarily("No Bulk Rows", "Choose a valid bulk stock file before adding rows to the pending queue.");
      return;
    }
    const missingRows = bulkStockPreview
      .map((row, index) => (row.missingArt ? `Row ${index + 2}: ART NO ${row.art_no || "-"}` : ""))
      .filter(Boolean);
    const rowsToQueue = bulkStockPreview.filter((row) => !row.missingArt);
    const confirmMessage = missingRows.length
      ? `Add ${rowsToQueue.length} valid row${rowsToQueue.length === 1 ? "" : "s"} to the pending queue? ${missingRows.slice(0, 3).join(" | ")}${missingRows.length > 3 ? " | ..." : ""}`
      : `Add ${rowsToQueue.length} row${rowsToQueue.length === 1 ? "" : "s"} to the pending queue?`;
    setBulkStockPopup({
      title: rowsToQueue.length ? "Confirm Add" : "ART NO Not Found",
      message: rowsToQueue.length
        ? confirmMessage
        : "All highlighted rows were skipped because their ART NO is not found in inventory.",
      confirm: rowsToQueue.length > 0,
    });
  }

  function confirmAddBulkStockToPendingQueue() {
    const queuedAt = new Date().toISOString().slice(0, 10);
    const rowsToQueue = bulkStockPreview.filter((row) => !row.missingArt);
    const skippedRows = bulkStockPreview
      .map((row, index) => (row.missingArt ? `Row ${index + 2}: ART NO ${row.art_no || "-"}` : ""))
      .filter(Boolean);
    if (!rowsToQueue.length) {
      showBulkStockPopupTemporarily("ART NO Not Found", "All highlighted rows were skipped because their ART NO is not found in inventory.");
      return;
    }
    setBulkStockPopup(null);
    setPendingTransfers((current) => mergePendingTransfers([
      ...current,
      ...rowsToQueue.map((row) => ({
        id: Date.now() + Math.floor(Math.random() * 1000) + Math.floor(Math.random() * 10000),
        lookup: row.art_no.trim(),
        art_no: row.art_no.trim(),
        from_branch: bulkStockFrom,
        to_branch: bulkStockTo,
        qty: Number(row.quantity) || 0,
        note: `Bulk stock file: ${bulkStockFileName || "selected file"}`,
        transfer_date: queuedAt,
      })),
    ]));
    setStatus(`Added ${rowsToQueue.length} bulk row${rowsToQueue.length === 1 ? "" : "s"} to pending queue`);
    showBulkStockPopupTemporarily(
      "Added to Pending Queue",
      skippedRows.length
        ? `Added ${rowsToQueue.length} rows to pending queue. Skipped ${skippedRows.length} highlighted row${skippedRows.length === 1 ? "" : "s"} because their ART NO is missing in inventory. ${skippedRows.slice(0, 5).join(" | ")}${skippedRows.length > 5 ? " | ..." : ""}`
        : `Added ${rowsToQueue.length} rows to pending queue.`,
    );
    setBulkStockFileName("");
    setBulkStockText("");
    setBulkStockPreview([]);
    const bulkInput = document.querySelector<HTMLInputElement>(".bulk-stock-panel input[type='file']");
    if (bulkInput) bulkInput.value = "";
  }

  function closeInventoryMenu() {
    setInventoryMenuOpen(false);
  }

  function clearStockTransferInputs() {
    setMovementLookup("");
    setMovementQty("");
    setMovementQtyRejected(false);
    setMovementError("");
    setMovementNote("");
    setBulkStockFileName("");
    setBulkStockText("");
    setBulkStockPreview([]);
    const bulkInput = document.querySelector<HTMLInputElement>(".bulk-stock-panel input[type='file']");
    if (bulkInput) bulkInput.value = "";
  }

  function applyTransferToInventoryRow(row: InventoryRow, transfer: { from_branch: string; to_branch: string; qty: number }) {
    const nextBy = { ...(row.by || {}) };
    const fromQty = Number(nextBy[transfer.from_branch] ?? 0) - Number(transfer.qty || 0);
    const toQty = Number(nextBy[transfer.to_branch] ?? 0) + Number(transfer.qty || 0);
    nextBy[transfer.from_branch] = Math.max(0, fromQty);
    nextBy[transfer.to_branch] = Math.max(0, toQty);
    const availableQty = Object.values(nextBy).reduce((sum, qty) => sum + Number(qty || 0), 0);
    return {
      ...row,
      available_qty: availableQty,
      total: availableQty,
      by: nextBy,
    };
  }

  function clearSavedData() {
    if (typeof window !== "undefined") {
      Object.values(STORAGE_KEYS).forEach((key) => window.localStorage.removeItem(key));
      window.sessionStorage.removeItem(STORAGE_KEYS.pendingTransfers);
    }
    setToken("");
    setRole("");
    setUserName("");
    setBranchName("");
    setStatus("Saved data cleared");
    setInventoryRows([]);
    setInventoryOverview({});
    setMovesRows([]);
    setPendingTransfers([]);
    setSelectedPendingIds(new Set());
    setError("");
  }

  async function transferPendingQueue() {
    if (!pendingTransfers.length) {
      setMovementError("No pending transfers to submit");
      return;
    }
    const totalQty = pendingTransfers.reduce((sum, row) => sum + Number(row.qty || 0), 0);
    const confirmMessage = `Transfer ${pendingTransfers.length} queued row${pendingTransfers.length === 1 ? "" : "s"} with total quantity ${totalQty}?`;
    setMovementPopup({ title: "Confirm Transfer", message: confirmMessage, confirm: true });
    return;
  }

  async function commitPendingQueueTransfer() {
    setMovementPopup(null);
    setLoading(true);
    setError("");
    try {
      const queuedRows = pendingTransfers
        .map((row) => normalizePendingTransfer(row))
        .filter((row) => row.lookup && row.from_branch && row.to_branch && Number.isFinite(row.qty) && row.qty > 0);

      if (!queuedRows.length) {
        setMovementError("No valid pending rows to transfer. Add a fresh row and try again.");
        setMovementQtyRejected(true);
        setStatus("Transfer skipped: no valid queued rows");
        return;
      }

      const committedAt = new Date().toISOString();
      const committedMoves: MoveRow[] = [];
      setStatus(`Transferring ${queuedRows.length} queued row${queuedRows.length === 1 ? "" : "s"}...`);

      const transferOneRow = async (row: PendingTransferRow) => {
        const payload = {
          lookup: row.lookup,
          art_no: row.lookup,
          from_branch: row.from_branch,
          branch: row.from_branch,
          note: row.note,
          transfers: [
            {
              from_branch: row.from_branch,
              to_branch: row.to_branch,
              qty: row.qty,
            },
          ],
        };
        const result = await api<{
          move?: MoveRow;
          moves?: MoveRow[];
        }>(
          "/stock/transfers",
          token,
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
        );
        return { row, result };
      };

      setInventoryRows((current) =>
        current.map((row) => {
          const currentArt = String(row.art_no || "").trim().toUpperCase();
          const matches = queuedRows.filter((pending) => String(pending.lookup || "").trim().toUpperCase() === currentArt);
          if (!matches.length) return row;
          return matches.reduce(
            (nextRow, match) =>
              applyTransferToInventoryRow(nextRow, {
                from_branch: match.from_branch,
                to_branch: match.to_branch,
                qty: match.qty,
              }),
            row
          );
        })
      );
      if (queuedRows.length) {
        const optimisticMoves = queuedRows.map((row) => ({
          id: Date.now() + Math.floor(Math.random() * 1000),
          created_at: row.transfer_date ? `${row.transfer_date}T00:00:00` : committedAt,
          art_no: row.lookup,
          category: inventoryRows.find((item) => String(item.art_no || "").trim().toUpperCase() === String(row.lookup || "").trim().toUpperCase())?.category,
          item_name: inventoryRows.find((item) => String(item.art_no || "").trim().toUpperCase() === String(row.lookup || "").trim().toUpperCase())?.item_name,
          mtype: "transfer",
          qty: row.qty,
          from_p: row.from_branch,
          from_branch: row.from_branch,
          to_p: row.to_branch,
          to_branch: row.to_branch,
          note: row.note,
        }));
        setMovesRows((current) => [...optimisticMoves, ...current]);
      }
      setPendingTransfers((current) => current.filter((row) => !queuedRows.some((pending) => pending.id === row.id)));
      setSelectedPendingIds((current) => {
        const next = new Set(current);
        queuedRows.forEach((row) => next.delete(row.id));
        return next;
      });
      setMovementError("");
      window.sessionStorage.removeItem(STORAGE_KEYS.pendingTransfers);
      setMovesExpanded(true);
      showTransferSuccessPopup(`Transferred ${queuedRows.length} queued row${queuedRows.length === 1 ? "" : "s"}. The pending queue is now clear.`);
      const refreshedArtNo = selectedArtNo.trim();
      if (refreshedArtNo) {
        setSelectedItemDetail((current) =>
          current
            ? {
                ...current,
                movementRows: [
                  ...committedMoves,
                  ...(current.movementRows || []),
                ],
              }
            : current
        );
        void openArtDetails(refreshedArtNo).catch(() => {
          // Keep the optimistic projection visible if the backend refresh is slow.
        });
      }

      void (async () => {
        const results = await Promise.allSettled(queuedRows.map((row) => transferOneRow(row)));
        const failedRows: Array<{ row: PendingTransferRow; reason: string }> = [];
        const successfulRows: PendingTransferRow[] = [];
        results.forEach((outcome, index) => {
          const row = queuedRows[index];
          if (!row) return;
          if (outcome.status === "fulfilled") {
            successfulRows.push(row);
            return;
          }
          const reason = outcome.reason instanceof ApiError
            ? outcome.reason.message
            : outcome.reason instanceof Error
              ? outcome.reason.message
              : "Transfer failed";
          failedRows.push({ row, reason });
        });
        const successCount = successfulRows.length;
        if (failedRows.length) {
          const preview = failedRows.slice(0, 3).map(({ row, reason }) => `${row.lookup} (${reason})`).join(" | ");
          setStatus(`Transferred ${successCount} row${successCount === 1 ? "" : "s"}; ${failedRows.length} failed: ${preview}`);
        } else {
          setStatus(`Transferred ${successCount} queued row${successCount === 1 ? "" : "s"}`);
        }
      })().catch((err) => {
        const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Transfer failed";
        setError(message);
        setStatus(`Transfer failed: ${message}`);
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Transfer failed";
      setMovementError(message);
      setMovementQtyRejected(true);
      setError(message);
      setStatus(`Transfer failed: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  function dismissMovementPopup() {
    setMovementPopup(null);
  }

  function showTransferSuccessPopup(message: string) {
    setTransferSuccessPopup({ title: "Transfer Complete", message });
    if (transferSuccessPopupTimerRef.current) {
      window.clearTimeout(transferSuccessPopupTimerRef.current);
    }
    transferSuccessPopupTimerRef.current = window.setTimeout(() => {
      setTransferSuccessPopup((current) => (current?.message === message ? null : current));
      transferSuccessPopupTimerRef.current = null;
    }, 20000);
  }

  function dismissTransferSuccessPopup() {
    if (transferSuccessPopupTimerRef.current) {
      window.clearTimeout(transferSuccessPopupTimerRef.current);
      transferSuccessPopupTimerRef.current = null;
    }
    setTransferSuccessPopup(null);
  }

  function parseBulkStockCsv(content: string) {
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) return [];
    const header = lines[0].split(",").map((cell) => cell.trim().toLowerCase());
    const getIndex = (names: string[]) => header.findIndex((cell) => names.includes(cell));
    const itemIndex = getIndex(["item name", "item_name", "item"]);
    const artIndex = getIndex(["art no", "art_no", "art number"]);
    const wholesaleIndex = getIndex(["wholesale", "wholesale price", "wholesale_price"]);
    const qtyIndex = getIndex(["quantity", "qty"]);
    return lines.slice(1).map((line) => {
      const cells = line.split(",").map((cell) => cell.trim());
      return {
        item_name: cells[itemIndex] || "",
        art_no: cells[artIndex] || "",
        wholesale: cells[wholesaleIndex] || "",
      quantity: cells[qtyIndex] || "",
    };
    }).filter((row) => row.item_name || row.art_no || row.wholesale || row.quantity);
  }

  function bulkStockMissingColumns(headers: string[]) {
    const normalized = headers.map((cell) => String(cell || "").trim().toLowerCase());
    const has = (variants: string[]) => variants.some((name) => normalized.includes(name));
    const missing: string[] = [];
    if (!has(["item name", "item_name", "item"])) missing.push("Item Name");
    if (!has(["art no", "art_no", "art number"])) missing.push("ART NO");
    if (!has(["wholesale", "wholesale price", "wholesale_price"])) missing.push("Wholesale Price");
    if (!has(["quantity", "qty"])) missing.push("Quantity");
    return missing;
  }

  function bulkStockRequiredColumnHelp(missingColumns: string[]) {
    return missingColumns
      .map((column) => {
        if (column === "Item Name") return "Add `Item Name` or rename your `Item` column to `Item Name`.";
        if (column === "ART NO") return "Add `ART NO`.";
        if (column === "Wholesale Price") return "Add `Wholesale Price` or rename `WHOLESALE` to `Wholesale Price`.";
        if (column === "Quantity") return "Add `Quantity` or `Qty`.";
        return `Add ${column}.`;
      })
      .join(" ");
  }

  function bulkStockRowValidationIssues(rows: Array<Record<string, any>>) {
    const issues: string[] = [];
    rows.forEach((row, index) => {
      const rowNo = index + 2;
      const itemName = String(row["ITEM NAME"] ?? row["ITEM_NAME"] ?? row["item_name"] ?? row["Item Name"] ?? row["Item"] ?? "").trim();
      const artNo = String(row["ART NO"] ?? row["ART_NO"] ?? row["art_no"] ?? row["Art No"] ?? row["Art Number"] ?? "").trim();
      const wholesale = String(row["WHOLESALE"] ?? row["WHOLESALE PRICE"] ?? row["wholesale"] ?? row["wholesale_price"] ?? row["Wholesale Price"] ?? "").trim();
      const quantity = String(row["QUANTITY"] ?? row["QTY"] ?? row["quantity"] ?? row["qty"] ?? "").trim();
      const missing: string[] = [];
      if (!itemName || itemName === "0") missing.push("Item Name");
      if (!artNo || artNo === "0") missing.push("ART NO");
      if (!wholesale || wholesale === "0") missing.push("Wholesale Price");
      if (!quantity || quantity === "0") missing.push("Quantity");
      if (missing.length) {
        issues.push(`Row ${rowNo}: ${missing.join(", ")} empty or 0`);
      }
    });
    return issues;
  }

  function inventoryArtSet() {
    return new Set(
      inventoryRows
        .map((row) => String(row.art_no || "").trim().toUpperCase())
        .filter(Boolean)
    );
  }

  async function handleBulkFilePick(file: File | null) {
    if (!file) return;
    setBulkStockFileName(file.name);
    setError("");
    setBulkStockPopup(null);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) {
        setBulkStockPreview([]);
        return;
      }
      const sheet = workbook.Sheets[firstSheet];
      const headers = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, blankrows: false }) as any[][];
      const firstRow = Array.isArray(headers[0]) ? headers[0].map((cell) => String(cell ?? "").trim()) : [];
      const missingColumns = bulkStockMissingColumns(firstRow);
      if (missingColumns.length) {
        setBulkStockPreview([]);
        setBulkStockPopup({
          title: "Invalid Bulk Stock File",
          message: `Missing required columns: ${missingColumns.join(", ")}. ${bulkStockRequiredColumnHelp(missingColumns)}`,
        });
        setStatus(`Bulk stock file rejected: ${file.name}`);
        return;
      }
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
      const rowIssues = bulkStockRowValidationIssues(json);
      if (rowIssues.length) {
        setBulkStockPreview([]);
        setBulkStockPopup({
          title: "Invalid Bulk Stock File",
          message: `Some rows have empty or 0 values in required columns. ${rowIssues.slice(0, 5).join(" | ")}${rowIssues.length > 5 ? " | ..." : ""}`,
        });
        setStatus(`Bulk stock file rejected: ${file.name}`);
        return;
      }
      const artSet = inventoryArtSet();
      setBulkStockPreview(
        json
          .map((row, index) => {
            const get = (...keys: string[]) => {
              for (const key of keys) {
                const value = row[key];
                if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
              }
              return "";
            };
            return {
              item_name: get("ITEM NAME", "ITEM_NAME", "item_name", "Item Name", "Item"),
              art_no: get("ART NO", "ART_NO", "art_no", "Art No", "Art Number"),
              wholesale: get("WHOLESALE", "WHOLESALE PRICE", "wholesale", "wholesale_price", "Wholesale Price"),
              quantity: get("QUANTITY", "QTY", "quantity", "qty"),
              missingArt: !artSet.has(get("ART NO", "ART_NO", "art_no", "Art No", "Art Number").trim().toUpperCase()),
            };
          })
          .filter((row) => row.item_name || row.art_no || row.wholesale || row.quantity)
      );
      setStatus(`Loaded ${json.length} bulk stock rows from ${file.name}`);
    } catch {
      const text = await file.text();
      setBulkStockText(text);
      const rows = parseBulkStockCsv(text);
      if (!rows.length) {
        setBulkStockPreview([]);
        setBulkStockPopup({
          title: "Invalid Bulk Stock File",
          message: "Missing required CSV headers: Item Name, ART NO, Wholesale Price, Quantity. Add the missing headers to the first row, then upload again.",
        });
        setStatus(`Bulk stock file rejected: ${file.name}`);
        return;
      }
      const rowIssues = rows
        .map((row, index) => {
          const rowNo = index + 2;
          const missing: string[] = [];
          if (!String(row.item_name || "").trim() || String(row.item_name || "").trim() === "0") missing.push("Item Name");
          if (!String(row.art_no || "").trim() || String(row.art_no || "").trim() === "0") missing.push("ART NO");
          if (!String(row.wholesale || "").trim() || String(row.wholesale || "").trim() === "0") missing.push("Wholesale Price");
          if (!String(row.quantity || "").trim() || String(row.quantity || "").trim() === "0") missing.push("Quantity");
          return missing.length ? `Row ${rowNo}: ${missing.join(", ")} empty or 0` : "";
        })
        .filter(Boolean);
      if (rowIssues.length) {
        setBulkStockPreview([]);
        setBulkStockPopup({
          title: "Invalid Bulk Stock File",
          message: `Some rows have empty or 0 values in required columns. ${rowIssues.slice(0, 5).join(" | ")}${rowIssues.length > 5 ? " | ..." : ""}`,
        });
        setStatus(`Bulk stock file rejected: ${file.name}`);
        return;
      }
      const artSet = inventoryArtSet();
      const missingArtRows = rows
        .map((row, index) => {
          const artNo = String(row.art_no || "").trim().toUpperCase();
          return artNo && !artSet.has(artNo) ? `Row ${index + 2}: ART NO ${artNo} not found in inventory` : "";
        })
        .filter(Boolean);
      if (missingArtRows.length) {
        setBulkStockPopup({
          title: "ART NO Not Found",
          message: `Some rows contain ART NO values that are not in inventory. ${missingArtRows.slice(0, 5).join(" | ")}${missingArtRows.length > 5 ? " | ..." : ""}`,
        });
      }
      setBulkStockPreview(rows);
      setStatus(`Loaded CSV rows from ${file.name}`);
    }
  }

  async function loadBulkStockFile() {
    if (!bulkStockPreview.length) {
      setBulkStockPopup({
        title: "No Bulk Rows",
        message: "Choose a valid bulk stock file before loading.",
      });
      return;
    }
    setBulkStockPopup(null);
    setBulkStockLoading(true);
    try {
      await api(
        "/stock/bulk-load",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            branch: bulkStockTo,
            from_branch: bulkStockFrom,
            to_branch: bulkStockTo,
            rows: bulkStockPreview,
          }),
        },
      );
      setStatus(`Bulk stock file loaded: ${bulkStockPreview.length} rows`);
      await refreshAll();
      setBulkStockPopup({
        title: "Bulk Stock Loaded",
        message: `Loaded ${bulkStockPreview.length} rows successfully. The Moves table and inventory have been refreshed.`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk stock load failed");
    } finally {
      setBulkStockLoading(false);
    }
  }

  function toggleSort(nextKey: typeof sortKey) {
    setPage(1);
    if (sortKey === nextKey) {
      setSortAsc((value) => !value);
      return;
    }
    setSortKey(nextKey);
    setSortAsc(true);
  }

  function toggleMovesSort(nextKey: typeof movesSortKey) {
    if (movesSortKey === nextKey) {
      setMovesSortAsc((value) => !value);
      return;
    }
    setMovesSortKey(nextKey);
    setMovesSortAsc(true);
  }

  function SortHeader({ label, sortKeyName }: { label: string; sortKeyName: typeof sortKey }) {
    return (
      <span
        className="sort-head"
        role="button"
        tabIndex={0}
        onClick={() => toggleSort(sortKeyName)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleSort(sortKeyName);
          }
        }}
      >
        {label}
      </span>
    );
  }

  function HeadSort({
    label,
    onClick,
  }: {
    label: string;
    onClick: () => void;
  }) {
    return (
      <span className="sort-head" role="button" tabIndex={0} onClick={onClick} onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}>
        {label}
      </span>
    );
  }

  function toggleInventorySelection(row: InventoryRow) {
    const rowId = row.id;
    if (rowId == null) return;
    projectInventoryRowToAddItem(row);
    setStatus(`Projected ${String(row.art_no || "").trim() || "item"} into Add Item`);
    setSelectedInventoryIds((current) => {
      const next = new Set(current);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }

  function selectAllVisibleInventory() {
    setSelectedInventoryIds((current) => {
      const next = new Set(current);
      visibleRows.forEach((row) => {
        if (row.id != null) next.add(row.id);
      });
      return next;
    });
    setInventoryMenuOpen(false);
  }

  function toggleVisibleInventorySelection() {
    if (visibleSelectionState.allSelected) {
      unselectAllInventory();
      return;
    }
    selectAllVisibleInventory();
  }

  function unselectAllInventory() {
    setSelectedInventoryIds(new Set());
    setInventoryMenuOpen(false);
  }

  async function deleteSelectedInventory() {
    if (selectedInventoryIds.size === 0) return;
    setLoading(true);
    setError("");
    try {
      const ids = selectedInventoryRows.map((row) => row.id).filter((id): id is number => id != null);
      if (!ids.length) return;
      for (const itemId of ids) {
        await api(`/inventory/items/${itemId}`, token, {
          method: "DELETE",
        });
      }
      setInventoryRows((current) => current.filter((row) => !row.id || !selectedInventoryIds.has(row.id)));
      setSelectedInventoryIds(new Set());
      setStatus(`Deleted ${ids.length} inventory item${ids.length === 1 ? "" : "s"}`);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setLoading(false);
    }
  }

  function downloadSelectedInventoryAsExcel() {
    if (selectedInventoryRows.length === 0) return;
    void import("xlsx").then((XLSX) => {
      const rows = selectedInventoryRows.map((row, index) => ({
        "SR NO": index + 1,
        DATE: excelSafeDate(row.created_at),
        "ART NO": row.art_no || "-",
        "Batch No": row.batch_no || "-",
        "Design No": row.design_no || "-",
        Item: row.item_name || "-",
        Category: row.category || "-",
        "Available QTY": row.available_qty ?? row.total ?? 0,
        ...Object.fromEntries(inventoryColumns.map((col) => [col, row.by?.[col] ?? 0])),
        WHOLESALE: Number(row.wholesale ?? 0),
        DESCRIPTION: row.description || "-",
      }));
      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.json_to_sheet(rows);
      sheet["!cols"] = [
        { wch: 8 },
        { wch: 12 },
        { wch: 16 },
        { wch: 14 },
        { wch: 14 },
        { wch: 20 },
        { wch: 18 },
        { wch: 14 },
        ...inventoryColumns.map(() => ({ wch: 12 })),
        { wch: 14 },
        { wch: 28 },
      ];
      XLSX.utils.book_append_sheet(workbook, sheet, "Inventory Selection");
      XLSX.writeFile(workbook, "inventory-selection.xlsx", { compression: true });
      setInventoryMenuOpen(false);
    });
  }

  function downloadSelectedInventoryAsPdf() {
    if (selectedInventoryRows.length === 0) return;
    void (async () => {
      const pdf = await PDFDocument.create();
      const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const pageSize: [number, number] = [1190, 842];
      let page = pdf.addPage(pageSize);
      const { width, height } = page.getSize();
      const marginX = 20;
      const marginTop = 28;
      const marginBottom = 24;
      const rowHeight = 15;
      const titleY = height - marginTop;
      const subtitleY = titleY - 18;
      const tableTop = subtitleY - 18;
      const headers = [
        "SR NO",
        "DATE",
        "ART NO",
        "Batch No",
        "Design No",
        "Item",
        "Category",
        "Available QTY",
        ...inventoryColumns,
        "WHOLESALE",
        "DESCRIPTION",
      ];
      const rows = selectedInventoryRows.map((row, index) => [
        String(index + 1),
        String(row.created_at || "").slice(0, 10) || "-",
        row.art_no || "-",
        row.batch_no || "-",
        row.design_no || "-",
        row.item_name || "-",
        row.category || "-",
        String(row.available_qty ?? row.total ?? 0),
        ...inventoryColumns.map((col) => String(row.by?.[col] ?? 0)),
        Number(row.wholesale ?? 0).toFixed(2),
        row.description || "-",
      ]);
      const baseColWidths = [34, 58, 72, 56, 56, 88, 96, 62, ...inventoryColumns.map(() => 44), 72, 120];
      const usableWidth = width - marginX * 2;
      const baseTotal = baseColWidths.reduce((sum, value) => sum + value, 0);
      const scale = Math.min(1, usableWidth / baseTotal);
      const colWidths = baseColWidths.map((value) => Math.max(30, Math.floor(value * scale)));
      const headerFill = rgb(0.12, 0.31, 0.47);
      const borderColor = rgb(0.72, 0.76, 0.8);
      const fitCellText = (text: string, font: any, size: number, maxWidth: number) => {
        const value = String(text ?? "");
        if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
        let candidate = value;
        while (candidate.length > 1 && font.widthOfTextAtSize(`${candidate}…`, size) > maxWidth) {
          candidate = candidate.slice(0, -1);
        }
        return `${candidate}…`;
      };
      const drawCell = (x: number, y: number, w: number, text: string, header = false) => {
        const font = header ? fontBold : fontRegular;
        const size = header ? 6.4 : 6.2;
        const fittedText = fitCellText(text, font, size, Math.max(0, w - 6));
        page.drawRectangle({
          x,
          y: y - rowHeight,
          width: w,
          height: rowHeight,
          borderColor,
          borderWidth: 0.6,
          color: header ? headerFill : undefined,
        });
        page.drawText(fittedText, {
          x: x + 2.5,
          y: y - 10.2,
          size,
          font,
          color: header ? rgb(1, 1, 1) : rgb(0.1, 0.12, 0.15),
          maxWidth: Math.max(0, w - 6),
          lineHeight: 1,
          opacity: 1,
        });
      };
      const drawPageHeader = () => {
        page.drawText("Inventory Selection", {
          x: marginX,
          y: titleY,
          size: 16,
          font: fontBold,
          color: rgb(0.08, 0.12, 0.17),
        });
        page.drawText(`Generated on ${new Date().toLocaleString()}`, {
          x: marginX,
          y: subtitleY,
          size: 8.5,
          font: fontRegular,
          color: rgb(0.35, 0.4, 0.45),
        });
      };
      const drawTableHeader = (y: number) => {
        let x = marginX;
        headers.forEach((header, idx) => {
          drawCell(x, y, colWidths[idx], header, true);
          x += colWidths[idx];
        });
      };
      drawPageHeader();
      let y = tableTop;
      drawTableHeader(y);
      y -= rowHeight;
      rows.forEach((row) => {
        if (y < marginBottom + rowHeight) {
          page = pdf.addPage(pageSize);
          drawPageHeader();
          y = tableTop;
          drawTableHeader(y);
          y -= rowHeight;
        }
        let x = marginX;
        row.forEach((cell, idx) => {
          drawCell(x, y, colWidths[idx], String(cell), false);
          x += colWidths[idx];
        });
        y -= rowHeight;
      });
      const bytes = await pdf.save();
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "inventory-selection.pdf";
      link.click();
      URL.revokeObjectURL(url);
      setInventoryMenuOpen(false);
    })();
  }

  async function submitInventoryItem() {
    setLoading(true);
    setError("");
    try {
      const submittedArtNo = String(itemForm.art_no || "").trim().toUpperCase();
      const matchedRow =
        (artNoFormLookup && String(artNoFormLookup.art_no || "").trim().toUpperCase() === submittedArtNo
          ? artNoFormLookup
          : inventoryRows.find((row) => String(row.art_no || "").trim().toUpperCase() === submittedArtNo) || null);
      const payload = {
        art_no: String(itemForm.art_no || "").trim(),
        batch_no: String(itemForm.batch_no || "").trim(),
        design_no: String(itemForm.design_no || "").trim(),
        item_name: String(itemForm.item_name || "").trim(),
        category: String(itemForm.category || "").trim(),
        branch: String(itemForm.branch || "").trim(),
        branch_id: branchIdForName(itemForm.branch),
        desc: String(itemForm.description || "").trim(),
        quantity: Number(itemForm.quantity || 0),
        reorder_level: 0,
        reorder: 0,
      };
      if (String(role || "").trim().toLowerCase() === "staff" && !matchedRow) {
        setInventoryPopup({
          title: "Admin Access Required",
          message: "Staff can only add stock for ART NOs already available in H.O. This is a new ART NO, so admin access is required.",
          confirm: false,
        });
        setLoading(false);
        return;
      }
      if (matchedRow) {
        const normalizedIncoming = {
          batch_no: String(payload.batch_no || "").trim(),
          design_no: String(payload.design_no || "").trim(),
          item_name: String(payload.item_name || "").trim(),
          category: String(payload.category || "").trim(),
          description: String(payload.desc || "").trim(),
          branch: String(payload.branch || "").trim(),
        };
        const normalizedKnown = {
          batch_no: String(matchedRow.batch_no || "").trim(),
          design_no: String(matchedRow.design_no || "").trim(),
          item_name: String(matchedRow.item_name || "").trim(),
          category: String(matchedRow.category || "").trim(),
          description: String(matchedRow.description || "").trim(),
          branch: String(matchedRow.branch || "").trim(),
        };
        const dataMismatch = Object.entries(normalizedKnown).some(([key, value]) => value && normalizedIncoming[key as keyof typeof normalizedIncoming] !== value);
        if (dataMismatch) {
          projectInventoryRowToAddItem(matchedRow);
          setInventoryPopup({
            title: "Details Matched",
            message: `Entered details were corrected to the saved ART NO record for ${submittedArtNo}. Please review and submit again if needed.`,
            confirm: false,
          });
          setLoading(false);
          return;
        }
      }
      if (matchedRow && Number(payload.quantity || 0) > 0) {
        setPendingInventoryPayload(payload);
        setInventoryPopup({
          title: "Warning",
          message: `Update will add ${payload.quantity} Qty to ${payload.branch} for ART NO ${payload.art_no}. It will not replace the current stock. Continue?`,
          confirm: true,
        });
        setLoading(false);
        return;
      }
      await commitInventoryItem(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Item save failed");
    } finally {
      setLoading(false);
    }
  }

  function handleAddItemArtNoBlur() {
    const artNo = String(itemForm.art_no || "").trim().toUpperCase();
    if (!artNo) return;
    const exists = artNoSuggestionRows.some((row) => String(row.art_no || "").trim().toUpperCase() === artNo);
    if (normalizedRole === "staff" && !exists) {
      setInventoryPopup({
        title: "Admin Access Required",
        message: "This ART NO does not exist in inventory. Staff can only use ART NOs already available in any branch.",
        confirm: false,
      });
    }
  }

  async function lookupAddItemArtNo(nextArtNo: string) {
    const artNo = String(nextArtNo || "").trim();
    if (!artNo) {
      setArtNoFormLookup(null);
      return;
    }
    const result = inventoryRows.find((row) => String(row.art_no || "").trim().toUpperCase() === artNo.toUpperCase()) || null;
    setArtNoFormLookup(result);
    if (!result && normalizedRole === "staff") {
      setInventoryPopup({
        title: "Admin Access Required",
        message: "This ART NO does not exist in inventory. Staff can only use ART NOs already available in any branch.",
        confirm: false,
      });
    }
  }

  function applyInventoryPayloadLocally(payload: any) {
    const normalizedArtNo = String(payload.art_no || "").trim().toUpperCase();
    const branchName = String(payload.branch || "H.O").trim() || "H.O";
    const quantity = Math.max(0, Number(payload.quantity || 0));
    setInventoryHighlightBranch(branchName);
    setInventoryHighlightArtNo(normalizedArtNo);
    setInventoryHighlightExpiresAt(Date.now() + 20000);
    setInventoryRows((current) => {
      const existingIndex = current.findIndex((row) => String(row.art_no || "").trim().toUpperCase() === normalizedArtNo);
      const existingRow = existingIndex >= 0 ? current[existingIndex] : null;
      const branchQty = existingRow ? Number(existingRow.by?.[branchName] ?? 0) : 0;
      const nextRow: InventoryRow = existingRow ? {
        ...existingRow,
        batch_no: String(payload.batch_no || existingRow.batch_no || "").trim(),
        design_no: String(payload.design_no || existingRow.design_no || "").trim(),
        item_name: String(payload.item_name || existingRow.item_name || "").trim(),
        category: String(payload.category || existingRow.category || "").trim(),
        branch: branchName,
        description: String(payload.desc || existingRow.description || "").trim(),
        available_qty: Number(existingRow.available_qty ?? existingRow.total ?? 0) + quantity,
        total: Number(existingRow.total ?? existingRow.available_qty ?? 0) + quantity,
        by: {
          ...(existingRow.by || {}),
          [branchName]: branchQty + quantity,
        },
        reorder_level: Number(payload.reorder_level ?? existingRow.reorder_level ?? 0),
        wholesale: Number(payload.wholesale ?? existingRow.wholesale ?? decodePrice(String(payload.batch_no || existingRow.batch_no || ""))),
        retail: Number(payload.retail ?? existingRow.retail ?? decodePrice(String(payload.design_no || existingRow.design_no || ""))),
      } : {
        id: Date.now(),
        created_at: new Date().toISOString(),
        art_no: normalizedArtNo,
        batch_no: String(payload.batch_no || "").trim(),
        design_no: String(payload.design_no || "").trim(),
        item_name: String(payload.item_name || "").trim(),
        category: String(payload.category || "").trim(),
        branch: branchName,
        description: String(payload.desc || "").trim(),
        available_qty: quantity,
        total: quantity,
        by: { [branchName]: quantity },
        reorder_level: Number(payload.reorder_level ?? 0),
        wholesale: Number(payload.wholesale ?? decodePrice(String(payload.batch_no || ""))),
        retail: Number(payload.retail ?? decodePrice(String(payload.design_no || ""))),
      };
      if (existingIndex >= 0) {
        const next = [...current];
        next[existingIndex] = nextRow;
        return next;
      }
      return [nextRow, ...current];
    });
  }

  async function commitInventoryItem(payload: any) {
    const normalizedArtNo = String(payload.art_no || "").trim().toUpperCase();
    const branchName = String(payload.branch || "H.O").trim() || "H.O";
    if (token.startsWith("local-")) {
      applyInventoryPayloadLocally(payload);
      appendLocalAuditHistory(payload, inventoryRows.some((row) => String(row.art_no || "").trim().toUpperCase() === normalizedArtNo) ? "updated" : "created");
      setStatus(`Item saved locally for ${branchName}.`);
      await refreshAll().catch(() => {
        // Keep the locally edited row visible even if the backend refresh is unavailable.
      });
      return;
    }
    setStatus(`Saving ${normalizedArtNo} to backend for ${branchName}...`);
    try {
      try {
        await api("/inventory/items", token, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } catch (createErr) {
        await api("/inventory/items", token, {
          method: "PUT",
          body: JSON.stringify(payload),
        }).catch(() => {
          throw createErr;
        });
      }
      applyInventoryPayloadLocally(payload);
      appendLocalAuditHistory(payload, inventoryRows.some((row) => String(row.art_no || "").trim().toUpperCase() === normalizedArtNo) ? "updated" : "created");
      setStatus(`Item saved to backend for ${branchName}.`);
      await refreshAll().catch(() => {
        // Keep the saved row visible even if a refresh is slow or temporarily fails.
      });
      setInventorySuccessPopup({
        title: "Saved",
        message: `ART NO ${normalizedArtNo} was saved successfully.`,
      });
      if (inventorySuccessPopupTimerRef.current) {
        window.clearTimeout(inventorySuccessPopupTimerRef.current);
      }
      inventorySuccessPopupTimerRef.current = window.setTimeout(() => {
        setInventorySuccessPopup(null);
        inventorySuccessPopupTimerRef.current = null;
      }, 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Item save failed");
    }
  }

  function dismissInventoryPopup() {
    setInventoryPopup(null);
    setPendingInventoryPayload(null);
  }

  function dismissInventorySuccessPopup() {
    if (inventorySuccessPopupTimerRef.current) {
      window.clearTimeout(inventorySuccessPopupTimerRef.current);
      inventorySuccessPopupTimerRef.current = null;
    }
    setInventorySuccessPopup(null);
  }

  async function confirmInventoryPopup() {
    const payload = pendingInventoryPayload;
    dismissInventoryPopup();
    if (!payload) return;
    setError("");
    try {
      await commitInventoryItem(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Item save failed");
    }
  }

  async function handleScan(target: "add-item" | "stock-transfer" = "add-item") {
    setBarcodeScanTarget(target);
    setBarcodeModalOpen(true);
    window.setTimeout(() => {
      const input = document.getElementById("barcode-scan-input") as HTMLInputElement | null;
      input?.focus();
      input?.select();
    }, 50);
  }

  function clearAddItemScan() {
    setScanStatus("No scan yet");
    setBarcodeScan("");
    setArtNoFormLookup(null);
    setItemForm({
      art_no: "",
      batch_no: "",
      design_no: "",
      item_name: "",
      wholesale: "",
      description: "",
      category: "None",
      quantity: "0",
      branch: "H.O",
    });
  }

  function resetProjectedAddItemFields() {
    setArtNoFormLookup(null);
    setItemForm((prev) => ({
      ...prev,
      art_no: "",
      batch_no: "",
      design_no: "",
      item_name: "",
      wholesale: "",
      description: "",
      category: "None",
      quantity: "0",
      branch: "H.O",
    }));
  }

  function parseBarcodeScan(value: string) {
    const parts = String(value || "")
      .trim()
      .split("-")
      .map((part) => part.trim())
      .filter(Boolean);
    return {
      art_no: parts[0] || "",
      batch_no: parts[1] || "",
      design_no: parts[2] || "",
    };
  }

  async function submitLogout() {
    setToken("");
    setRole("");
    setUserName("");
    setBranchName("");
    setStatus("Session cleared");
  }

  async function submitLogin(payload: { username: string; password: string; branch?: string; role?: string }) {
    setLoginLoading(true);
    setError("");
    try {
      const sourceAccounts = accounts.length ? accounts : await loadAccounts();
      if (!accounts.length) setAccounts(sourceAccounts);
      const account = sourceAccounts.find((item) => normalizeAccountName(item.username) === normalizeAccountName(payload.username));
      if (!account || account.password !== payload.password) {
        throw new Error("Invalid username or password");
      }

      if (normalizeAccountName(account.username) === "admin") {
        const result = await api<LoginResponse>("/auth/login", undefined, {
          method: "POST",
          body: JSON.stringify({ mode: "admin", password: payload.password, username: payload.username, role: "admin" }),
        });
        setToken(result.access_token);
        setRole(result.role);
        setUserName(result.user_name);
        setBranchName(result.branch_name || "All branches");
        setActiveTab("admin-panel");
        setStatus(`Signed in as ${result.user_name}`);
        return result;
      }

      const loginRole = String(account.role || payload.role || "staff").trim().toLowerCase();
      const branchName = String(payload.branch || account.branch_name || "").trim() || "H.O";
      const result = await api<LoginResponse>("/auth/login", undefined, {
        method: "POST",
        body: JSON.stringify({
          mode: "shop_manager",
          branch: branchName,
          password: payload.password,
          username: payload.username,
          role: loginRole,
        }),
      });
      setToken(result.access_token);
      setRole(loginRole);
      setUserName(result.user_name);
      setBranchName(loginRole === "manager" ? "All branches" : (result.branch_name || branchName));
      setActiveTab("inventory");
      setStatus(`Signed in as ${result.user_name}`);
      return { ...result, role: loginRole };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setLoginLoading(false);
    }
  }

  async function loadAccounts() {
    try {
      const response = await fetch("/api/accounts", { cache: "no-store" });
      if (!response.ok) throw new Error(`Failed to load accounts (${response.status})`);
      const data = (await response.json()) as { accounts?: LocalAccount[] };
      const nextAccounts = Array.isArray(data.accounts) ? data.accounts : [defaultAdminAccount()];
      setAccounts(nextAccounts);
      return nextAccounts;
    } catch {
      const fallback = [defaultAdminAccount()];
      setAccounts(fallback);
      return fallback;
    }
  }

  async function saveAccounts(nextAccounts: LocalAccount[]) {
    const response = await fetch("/api/accounts", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accounts: nextAccounts }),
    });
    if (!response.ok) {
      throw new Error(`Failed to save accounts (${response.status})`);
    }
    const data = (await response.json()) as { accounts?: LocalAccount[] };
    const saved = Array.isArray(data.accounts) ? data.accounts : nextAccounts;
    setAccounts(saved);
    return saved;
  }

  async function createAccount(nextAccount: LocalAccount) {
    const normalized = normalizeAccountName(nextAccount.username);
    if (!normalized) {
      setError("Username is required");
      return;
    }
    if (!nextAccount.password.trim()) {
      setError("Password is required");
      return;
    }
    if (accounts.some((account) => normalizeAccountName(account.username) === normalized)) {
      setError("That username already exists");
      return;
    }
    const nextAccounts = [
      ...accounts,
      {
        username: nextAccount.username.trim(),
        password: nextAccount.password,
        role: nextAccount.role,
        branch_name: nextAccount.branch_name || "All branches",
      },
    ];
    await saveAccounts(nextAccounts);
    setStatus(`Created account ${nextAccount.username.trim()}`);
  }

  function beginEditAccount(account: LocalAccount) {
    if (normalizeAccountName(account.username) === "admin") {
      setError("Default admin password cannot be changed");
      return;
    }
    setEditingAccountUsername(account.username);
    setEditingPassword(account.password);
    setEditingRole(account.role || "staff");
    setEditingBranch(account.branch_name || "All branches");
  }

  async function saveEditedAccount() {
    const normalized = normalizeAccountName(editingAccountUsername);
    if (!normalized) {
      setError("Select an account to edit");
      return;
    }
    if (normalized === "admin") {
      setError("Default admin password cannot be changed");
      return;
    }
    if (!editingPassword.trim()) {
      setError("Password is required");
      return;
    }
    const nextAccounts = accounts.map((account) => {
      if (normalizeAccountName(account.username) !== normalized) return account;
      return {
        ...account,
        password: editingPassword,
        role: editingRole,
        branch_name: editingBranch || "All branches",
      };
    });
    await saveAccounts(nextAccounts);
    setStatus(`Updated login ${editingAccountUsername}`);
  }

  async function resetPassword(username: string) {
    const nextPassword = window.prompt(`Reset password for ${username}`, "");
    if (nextPassword === null) return;
    if (!nextPassword.trim()) {
      setError("Password is required");
      return;
    }
    if (normalizeAccountName(username) === "admin") {
      setError("Default admin password cannot be changed");
      return;
    }
    const nextAccounts = accounts.map((account) =>
      normalizeAccountName(account.username) === normalizeAccountName(username)
        ? { ...account, password: nextPassword.trim() }
        : account
    );
    await saveAccounts(nextAccounts);
    setStatus(`Password reset for ${username}`);
  }

  async function deleteAccount(username: string) {
    const normalized = normalizeAccountName(username);
    if (!normalized || normalized === "admin") {
      setError("Default admin account cannot be removed");
      return;
    }
    const nextAccounts = accounts.filter((account) => normalizeAccountName(account.username) !== normalized);
    await saveAccounts(nextAccounts);
    if (normalizeAccountName(editingAccountUsername) === normalized) {
      setEditingAccountUsername("");
      setEditingPassword("");
      setEditingBranch("All branches");
    }
    setStatus(`Deleted login ${username}`);
  }

  const summary = {
    ...inventoryOverview,
    skus: Number(inventoryOverview.skus ?? 0),
    units: Number(inventoryOverview.units ?? 0),
    wholesale: Number(inventoryOverview.wholesale ?? 0),
    retail: Number(inventoryOverview.retail ?? 0),
    low_stock: isLowStockRowArray(inventoryOverview.low_stock) ? inventoryOverview.low_stock : [],
  };
  const detailItem = selectedItemDetail?.item || null;
  const detailLookup = selectedItemDetail?.lookup || null;
  const labelRecord = (detailItem || detailLookup || inventoryRows.find((row) => row.art_no?.toUpperCase() === selectedArtNo.toUpperCase()) || null) as InventoryRow | null;
  const normalizedRole = String(role || "").trim().toLowerCase();
  const normalizedHighlightBranch = String(inventoryHighlightBranch || "").trim().toUpperCase();
  const barcodeValue = labelRecord ? `${labelRecord.art_no || ""}-${labelRecord.batch_no || ""}-${labelRecord.design_no || ""}` : "";
  const productWeight = String(labelRecord?.weight ?? detailLookup?.weight ?? "");
  const movementLookupRecord = useMemo(
    () => inventoryRows.find((row) => String(row.art_no || "").trim().toUpperCase() === movementLookup.trim().toUpperCase()) || null,
    [inventoryRows, movementLookup]
  );
  const artNoSuggestions = useMemo(() => {
    const seen = new Set<string>();
    return artNoSuggestionRows
      .map((row) => String(row.art_no || "").trim())
      .filter((artNo) => artNo && !seen.has(artNo.toUpperCase()) && seen.add(artNo.toUpperCase()))
      .slice(0, 200);
  }, [artNoSuggestionRows]);
  const movementArtSuggestions = useMemo(() => {
    const seen = new Set<string>();
    return inventoryRows
      .map((row) => ({
        art_no: String(row.art_no || "").trim(),
        item_name: String(row.item_name || "").trim(),
      }))
      .filter((row) => row.art_no && !seen.has(row.art_no.toUpperCase()) && seen.add(row.art_no.toUpperCase()))
      .slice(0, 50);
  }, [inventoryRows]);

  function getBranchAvailableQty(record: InventoryRow | null, branch: string) {
    if (!record || !branch) return 0;
    const branchQty = Number(record.by?.[branch] ?? 0);
    if (branchQty > 0) return branchQty;
    const recordBranch = String(record.branch || "").trim().toUpperCase();
    if (recordBranch && recordBranch === branch.trim().toUpperCase()) {
      return Number(record.available_qty ?? record.total ?? 0);
    }
    return 0;
  }

  function getTotalAvailableQty(record: InventoryRow | null) {
    if (!record) return 0;
    const branchTotal = Object.values(record.by || {}).reduce((sum, qty) => sum + Number(qty || 0), 0);
    if (branchTotal > 0) return branchTotal;
    return Number(record.available_qty ?? record.total ?? 0);
  }

  const movementFromQty = getBranchAvailableQty(movementLookupRecord, movementFrom);
  const movementFromInvalid = Boolean(movementLookup.trim()) && Boolean(movementLookupRecord) && movementFromQty <= 0;
  const movementQtyNumber = Number(movementQty);
  const movementQtyInvalid =
    movementQtyRejected ||
    movementFromInvalid ||
    (Boolean(movementLookup.trim()) && Boolean(movementLookupRecord) && movementQtyNumber > movementFromQty);

  useEffect(() => {
    if (!movementQtyInvalid) return;
    movementQtyRef.current?.focus();
    movementQtyRef.current?.select();
  }, [movementQtyInvalid]);

  useEffect(() => {
    if (!movementQtyRejected) return;
    if (movementQtyNumber <= 0) return;
    if (movementLookupRecord && movementFromQty <= 0) return;
    if (movementLookupRecord && movementQtyNumber > movementFromQty) return;
    setMovementQtyRejected(false);
    setMovementError("");
  }, [movementQtyRejected, movementQtyNumber, movementLookupRecord, movementFromQty]);

  useEffect(() => {
    if (!inventoryHighlightBranch && !inventoryHighlightArtNo) return undefined;
    const expiresAt = inventoryHighlightExpiresAt || Date.now() + 20000;
    const remaining = Math.max(0, expiresAt - Date.now());
    if (inventoryHighlightTimerRef.current) {
      window.clearTimeout(inventoryHighlightTimerRef.current);
    }
    inventoryHighlightTimerRef.current = window.setTimeout(() => {
      setInventoryHighlightBranch("");
      setInventoryHighlightArtNo("");
      setInventoryHighlightExpiresAt(null);
      inventoryHighlightTimerRef.current = null;
    }, remaining);
    return () => {
      if (inventoryHighlightTimerRef.current) {
        window.clearTimeout(inventoryHighlightTimerRef.current);
        inventoryHighlightTimerRef.current = null;
      }
    };
  }, [inventoryHighlightBranch, inventoryHighlightArtNo, inventoryHighlightExpiresAt]);

  useEffect(() => {
    if (!inventoryHighlightExpiresAt) return undefined;
    const interval = window.setInterval(() => {
      if (Date.now() >= inventoryHighlightExpiresAt) {
        setInventoryHighlightBranch("");
        setInventoryHighlightArtNo("");
        setInventoryHighlightExpiresAt(null);
        if (inventoryHighlightTimerRef.current) {
          window.clearTimeout(inventoryHighlightTimerRef.current);
          inventoryHighlightTimerRef.current = null;
        }
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [inventoryHighlightExpiresAt]);

  useEffect(() => {
    const artNo = String(itemForm.art_no || "").trim().toUpperCase();
    if (!artNo) return;
    const match =
      artNoFormLookup && String(artNoFormLookup.art_no || "").trim().toUpperCase() === artNo
        ? artNoFormLookup
        : inventoryRows.find((row) => String(row.art_no || "").trim().toUpperCase() === artNo) || null;
    if (!match) return;
    if (
      String(itemForm.batch_no || "") === String(match.batch_no || "") &&
      String(itemForm.design_no || "") === String(match.design_no || "") &&
      String(itemForm.item_name || "") === String(match.item_name || "") &&
      String(itemForm.category || "") === String(match.category || "None") &&
      String(itemForm.description || "") === String(match.description || "") &&
      String(itemForm.branch || "") === String(match.branch || "H.O") &&
      String(itemForm.wholesale || "") === String(match.wholesale ?? "") &&
      String(itemForm.quantity || "") === String(match.available_qty ?? match.total ?? "")
    ) {
      return;
    }
    projectInventoryRowToAddItem(match);
    setStatus(`Loaded ${artNo} details into Add Item`);
  }, [inventoryRows, artNoFormLookup, itemForm.art_no]);

  useEffect(() => {
    if (!barcodeSvgRef.current || !barcodeValue) return;
    try {
      let cancelled = false;
      import("jsbarcode").then((mod) => {
        if (cancelled || !barcodeSvgRef.current) return;
        const JsBarcode = mod.default;
        JsBarcode(barcodeSvgRef.current, barcodeValue, {
          format: "CODE128",
          displayValue: false,
          margin: 0,
          height: 34,
          width: 1.5,
        });
      });
      return () => {
        cancelled = true;
      };
    } catch {
      // ignore barcode rendering errors until valid data is available
    }
  }, [barcodeValue]);

  useEffect(() => {
    if (addDate) return;
    setAddDate(new Date().toISOString().slice(0, 10));
  }, [addDate]);

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      const detail = describeUnknownError(event.error) || event.message || "Unexpected client error";
      setError(detail);
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      setError(describeUnknownError(event.reason) || "Unhandled promise rejection");
    };
    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  async function openLabelArtNo() {
    const code = barcodeScan.trim();
    if (!code) return;
    const parsed = parseBarcodeScan(code);
    if (barcodeScanTarget === "stock-transfer") {
      setMovementLookup(parsed.art_no || code);
    } else {
      setItemForm((prev) => ({
        ...prev,
        art_no: parsed.art_no || code,
        batch_no: parsed.batch_no || prev.batch_no,
        design_no: parsed.design_no || prev.design_no,
      }));
      setScanStatus(parsed.art_no ? `Scanned ${parsed.art_no}` : "Scan captured");
      await openArtDetails(parsed.art_no || code);
    }
    setBarcodeModalOpen(false);
    setBarcodeScan("");
  }

  function downloadBarcodePng() {
    const svg = barcodeSvgRef.current;
    if (!svg || !barcodeValue) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const serializer = new XMLSerializer();
    const svgText = serializer.serializeToString(clone);
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((out) => {
        if (!out) return;
        const outUrl = URL.createObjectURL(out);
        const link = document.createElement("a");
        link.href = outUrl;
        link.download = `${selectedArtNo || "barcode"}_label.png`;
        link.click();
        URL.revokeObjectURL(outUrl);
      });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function printBarcodeLabel() {
    const target = document.getElementById("barcode-label-print-area");
    if (!target) return;
    const w = window.open("", "_blank", "width=520,height=620");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Barcode Label</title><style>
      body{margin:0;padding:16px;font-family:Arial,sans-serif}
      .label{width:100%;max-width:320px;border:1px solid #ddd;padding:12px}
      .name{font-size:16px;font-weight:700;line-height:1.2;margin-bottom:10px}
      .meta{font-size:12px;display:grid;gap:3px;margin-bottom:8px}
      .code{font-size:11px;text-align:center;margin-top:4px;word-break:break-all}
      svg{width:100%;height:auto}
      @media print{body{padding:0}.label{border:0}}
    </style></head><body>${target.outerHTML}<script>window.onload=function(){window.print();}</script></body></html>`);
    w.document.close();
  }

  function downloadSelectedArtNoData() {
    if (!selectedArtNo) return;
    const source = detailItem || detailLookup || {};
    const analyticsSummary = {
      branch: detailLookup?.branch || branchName || "All branches",
      available: detailLookup?.available_qty ?? source.available_qty ?? source.total ?? 0,
      wholesale: source.wholesale ?? 0,
      retail: source.retail ?? 0,
      moves_count: filteredMovesRows.length,
    };
    const escapeCell = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const sections: string[] = [];

    sections.push(["Item Detail", ""].map(escapeCell).join(","));
    sections.push(
      [["Field", "Value"], ["ART NO", selectedArtNo], ["Item Name", String(source.item_name || "-")], ["Batch No", String(source.batch_no || "-")], ["Design No", String(source.design_no || "-")], ["Category", String(source.category || "-")], ["Available", String(analyticsSummary.available)], ["Wholesale", String(source.wholesale ?? 0)], ["Retail", String(source.retail ?? 0)], ["Description", String(source.description || "-")], ["Branch", analyticsSummary.branch]]
        .map(([a, b]) => `${escapeCell(a)}${b !== undefined ? `,${escapeCell(String(b))}` : ""}`)
        .join("\n")
    );

    sections.push("");
    sections.push(["Moves History", ""].map(escapeCell).join(","));
    sections.push(["Time", "ART NO", "Item", "Type", "Qty", "From", "To", "Note"].map(escapeCell).join(","));
    sections.push(
      filteredMovesRows
        .map((row) =>
          [
            String(row.created_at || "").replace("T", " ").slice(0, 16),
            row.art_no || "-",
            row.item_name || "-",
            row.mtype || "-",
            String(row.qty ?? 0),
            row.from_p || "-",
            row.to_p || "-",
            row.note || "-",
          ]
            .map(escapeCell)
            .join(",")
        )
        .join("\n")
    );

    sections.push("");
    sections.push(["Analytics Summary", ""].map(escapeCell).join(","));
    sections.push(["Metric", "Value"].map(escapeCell).join(","));
    sections.push(
      Object.entries(analyticsSummary)
        .map(([key, value]) => `${escapeCell(key)}${value !== undefined ? `,${escapeCell(String(value))}` : ""}`)
        .join("\n")
    );

    const csv = sections.filter(Boolean).join("\n");
    const blob = new Blob([csv], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedArtNo}_details.xls`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <ErrorBoundary>
      <AppLayout
        activeTab={activeTab}
        userName={userName || "Admin"}
        branchName={branchName || "All branches"}
        role={role || "admin"}
        status={status}
        onNavigate={handleNavigate}
        onLogout={submitLogout}
      >
        {activeTab === "inventory" ? (
          <section className={`inventory-workspace inventory-page ${artDetailsOpen ? "has-details" : ""}`}>
            <div className="inventory-stack">
              <section className="summary-strip">
              <div className="summary-box">
                <div className="summary-label">SKUs</div>
                <div className="summary-value">{summary.skus ?? 0}</div>
              </div>
              <div className="summary-box">
                <div className="summary-label">Units</div>
                <div className="summary-value">{summary.units ?? 0}</div>
              </div>
              <div className="summary-box">
                <div className="summary-label">Wholesale</div>
                <div className="summary-value">Rs {(summary.wholesale ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
            </section>

            <section className="panel inventory-form-panel">
              <div className="section-title">Add Item</div>
              <div className="scan-box">
                <div className="scan-group">
                  <div className="field-label">Scan Barcode</div>
                  <div className="scan-actions">
                    <button className="classic-btn" type="button" onClick={() => handleScan()}>Scan</button>
                    <button className="classic-btn" type="button" onClick={clearAddItemScan}>Clear</button>
                  </div>
                </div>
                <div className="scan-status">{scanStatus}</div>
              </div>

              <div className="inventory-form-grid">
                <label className="field">
                  Date
                  <input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} />
                </label>
                <label className="field">
                  ART NO
                  <input
                    list="inventory-artnos"
                    value={itemForm.art_no}
                    onChange={(e) => {
                      const nextArtNo = e.target.value;
                      setItemForm((prev) => ({ ...prev, art_no: nextArtNo }));
                      if (nextArtNo.trim()) {
                        void lookupAddItemArtNo(nextArtNo);
                      } else {
                        resetProjectedAddItemFields();
                      }
                    }}
                    onBlur={handleAddItemArtNoBlur}
                  />
                  <datalist id="inventory-artnos">
                    {artNoSuggestions.map((artNo) => (
                      <option key={artNo} value={artNo} />
                    ))}
                  </datalist>
                </label>
                <label className="field">
                  Batch No
                  <input
                    value={itemForm.batch_no}
                    onChange={(e) =>
                      setItemForm((prev) => ({
                        ...prev,
                        batch_no: e.target.value,
                        wholesale: String(decodePrice(e.target.value)),
                      }))
                    }
                  />
                </label>
                <label className="field">
                  Design No
                  <input value={itemForm.design_no} onChange={(e) => setItemForm((prev) => ({ ...prev, design_no: e.target.value }))} />
                </label>
                <label className="field field-span-2">
                  Item Name
                  <input value={itemForm.item_name} onChange={(e) => setItemForm((prev) => ({ ...prev, item_name: e.target.value }))} />
                </label>
                <label className="field">
                  Wholesale
                  <input type="number" value={itemForm.wholesale} readOnly />
                </label>
                <label className="field field-span-2">
                  Description
                  <input value={itemForm.description} onChange={(e) => setItemForm((prev) => ({ ...prev, description: e.target.value }))} />
                </label>
                <label className="field">
                  Category
                  <input
                    list="category-suggestions"
                    value={itemForm.category}
                    onChange={(e) => setItemForm((prev) => ({ ...prev, category: e.target.value }))}
                    placeholder="Start typing a category"
                  />
                  <datalist id="category-suggestions">
                    <option value="None" />
                    <option value="Stone Item" />
                    <option value="CZ Item" />
                    <option value="Annamayya" />
                    <option value="Temple Jewellery" />
                    <option value="1st Quality Temple Jewellery" />
                    <option value="TTC" />
                  </datalist>
                </label>
                <label className="field">
                  Quantity
                  <input type="number" value={itemForm.quantity} onChange={(e) => setItemForm((prev) => ({ ...prev, quantity: e.target.value }))} />
                </label>
                <label className="field">
                  Branch
                  <select value={itemForm.branch} onChange={(e) => setItemForm((prev) => ({ ...prev, branch: e.target.value }))}>
                    {branchOptions.map((branch) => (
                      <option key={branch} value={branch}>
                        {branch === "H.O" ? "HO" : branch}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="form-actions form-actions-grid">
                  <button className="primary-btn" type="button" disabled={loading} onClick={() => submitInventoryItem()}>
                    Add / Update Item
                  </button>
                </div>
              </div>
            </section>

            <section className="panel search-inventory-panel">
              <div className="section-title">Search Inventory</div>
              {normalizedRole === "admin" && normalizedHighlightBranch ? (
                <div className="inventory-update-banner">
                  <strong>Latest branch update:</strong> {inventoryHighlightBranch}
                  {inventoryHighlightArtNo ? <span> | ART NO {inventoryHighlightArtNo}</span> : null}
                </div>
              ) : null}
              <div className="inventory-toolbar">
                <div className="search-row">
                  <input
                    ref={inventorySearchRef}
                    className="search-input"
                    value={inventorySearch}
                    onChange={(e) => setInventorySearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      const term = inventorySearch.trim().toUpperCase();
                      if (!term) return;
                      const exactMatch = inventoryRows.find((row) => String(row.art_no || "").trim().toUpperCase() === term);
                      if (exactMatch) {
                        projectInventoryRowToAddItem(exactMatch);
                        setStatus(`Projected ${exactMatch.art_no} into Add Item`);
                      } else {
                        setStatus(`No inventory item found for ${inventorySearch.trim()}`);
                      }
                    }}
                  />
                  <button className="classic-btn clear-btn" type="button" onClick={() => setInventorySearch("")}>Clear</button>
                  <div className="candybox-anchor">
                    <button className="classic-btn candybox-btn" type="button" aria-label="Inventory menu" onClick={() => setInventoryMenuOpen((open) => !open)}>
                      <span className="candybox-icon" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                      </span>
                    </button>
                    {inventoryMenuOpen ? (
                      <div className="inventory-menu">
                        <div className="inventory-menu-title">Inventory Actions</div>
                        <button
                          className="menu-item"
                          type="button"
                          onClick={() => {
                            selectAllVisibleInventory();
                            closeInventoryMenu();
                          }}
                        >
                          Select all
                        </button>
                        <button
                          className="menu-item"
                          type="button"
                          onClick={() => {
                            unselectAllInventory();
                            closeInventoryMenu();
                          }}
                        >
                          Unselect all
                        </button>
                        <button
                          className="menu-item"
                          type="button"
                          onClick={() => {
                            openInventoryUploadPage();
                            closeInventoryMenu();
                          }}
                        >
                          Upload Excel
                        </button>
                        <button
                          className="menu-item"
                          type="button"
                          onClick={() => {
                            downloadSelectedInventoryAsExcel();
                            closeInventoryMenu();
                          }}
                        >
                          Download Excel
                        </button>
                        <button
                          className="menu-item"
                          type="button"
                          onClick={() => {
                            downloadSelectedInventoryAsPdf();
                            closeInventoryMenu();
                          }}
                        >
                          Download PDF
                        </button>
                        {String(role || "").trim().toLowerCase() === "admin" ? (
                          <button
                            className="menu-item danger"
                            type="button"
                            onClick={() => {
                              deleteSelectedInventory();
                              closeInventoryMenu();
                            }}
                          >
                            Delete Art Number
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="table-wrap inventory-table-wrap">
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th>
                        <button
                          className={`select-head ${visibleSelectionState.allSelected ? "active" : ""}`}
                          type="button"
                          onClick={toggleVisibleInventorySelection}
                        >
                          <span>{visibleSelectionState.allSelected ? "Unselect" : "Select"}</span>
                        </button>
                      </th>
                      <th><SortHeader label="SR NO" sortKeyName="sr" /></th>
                      <th><SortHeader label="DATE" sortKeyName="date" /></th>
                      <th><SortHeader label="ART NO" sortKeyName="art_no" /></th>
                      <th><SortHeader label="BATCH NO" sortKeyName="batch_no" /></th>
                      <th><SortHeader label="DESIGN NO" sortKeyName="design_no" /></th>
                      <th><SortHeader label="Item" sortKeyName="item_name" /></th>
                      <th><SortHeader label="Category" sortKeyName="category" /></th>
                      <th><HeadSort label="AVAILABLE QTY" onClick={() => {
                        setBranchSortColumn("AVAILABLE");
                        setBranchSortDirection((current) => (branchSortColumn === "AVAILABLE" && current === "high" ? "low" : "high"));
                      }} /></th>
                      {inventoryColumns.map((col) => (
                        <th key={col}><HeadSort label={col} onClick={() => {
                          const nextColumn = col.trim().toUpperCase();
                          setBranchSortColumn(nextColumn);
                          setBranchSortDirection((current) => (branchSortColumn === nextColumn && current === "high" ? "low" : "high"));
                        }} /></th>
                      ))}
                      <th><SortHeader label="WHOLESALE" sortKeyName="wholesale" /></th>
                      <th><SortHeader label="DESCRIPTION" sortKeyName="description" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row, index) => (
                      <tr
                        key={row.id ?? row.art_no}
                        className={String(role || "").trim().toLowerCase() === "admin" && String(row.created_at || "").slice(0, 10) === todayKey ? "inventory-row-new" : undefined}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={row.id != null ? selectedInventoryIds.has(row.id) : false}
                            onChange={() => {
                              toggleInventorySelection(row);
                              projectInventoryRowToAddItem(row);
                              setStatus(`Projected ${String(row.art_no || "").trim() || "item"} into Add Item`);
                            }}
                          />
                        </td>
                        <td>{index + 1}</td>
                        <td>{String(row.created_at || "").slice(0, 10) || "-"}</td>
                        <td
                          onDoubleClick={() => {
                            router.push(`/art-number/${encodeURIComponent(String(row.art_no || ""))}`);
                          }}
                          style={{ cursor: "pointer", fontWeight: 700, color: "#4f6888" }}
                        >
                          {row.art_no}
                        </td>
                        <td>{row.batch_no || "-"}</td>
                        <td>{row.design_no || "-"}</td>
                        <td
                          onDoubleClick={() => {
                            projectInventoryRowToAddItem(row);
                            setStatus(`Projected ${String(row.art_no || "").trim() || "item"} into Add Item`);
                          }}
                          style={{ cursor: "pointer" }}
                        >
                          {row.item_name}
                        </td>
                        <td>{row.category}</td>
                        <td>{row.available_qty ?? row.total ?? 0}</td>
                        {inventoryColumns.map((col) => (
                          <td key={col}>{row.by?.[col] ?? 0}</td>
                        ))}
                        <td>{Number(row.wholesale ?? 0).toFixed(2)}</td>
                        <td>{row.description || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-footer" style={artDetailsOpen ? { display: "none" } : undefined}>
                <div>Ctrl+F search | F5 refresh | Click headers to sort</div>
              </div>
            </section>

            {barcodeModalOpen ? (
              <div className="barcode-scan-backdrop" role="dialog" aria-modal="true" aria-label="Scan Barcode">
                <div className="barcode-scan-dialog">
                  <div className="barcode-scan-title">Scan Barcode</div>
                  <label className="field barcode-scan-field">
                    Scan now (ART-BATCH-DESIGN):
                    <input
                      id="barcode-scan-input"
                      value={barcodeScan}
                      onChange={(e) => setBarcodeScan(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          openLabelArtNo();
                        }
                      }}
                    />
                  </label>
                  <div className="barcode-scan-actions">
                    <button className="secondary-btn" type="button" onClick={() => setBarcodeModalOpen(false)}>
                      Close
                    </button>
                    <button
                      className="classic-btn"
                      type="button"
                      onClick={() => {
                        const code = barcodeScan.trim();
                        if (!code) return;
                        const parsed = parseBarcodeScan(code);
                        const artNo = parsed.art_no || code;
                        setItemForm((prev) => ({
                          ...prev,
                          art_no: artNo,
                          batch_no: parsed.batch_no || prev.batch_no,
                          design_no: parsed.design_no || prev.design_no,
                        }));
                        setSelectedArtNo(artNo);
                        setArtDetailsOpen(false);
                        setSelectedItemDetail(null);
                        setScanStatus(parsed.art_no ? `Barcode prepared for ${artNo}` : "Barcode prepared");
                      }}
                    >
                      Generate Barcode
                    </button>
                    <button className="classic-btn" type="button" onClick={printBarcodeLabel}>
                      Print Barcode
                    </button>
                    <button className="primary-btn" type="button" onClick={openLabelArtNo}>
                      Use Scan
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {inventoryPopup ? (
              <div className="inventory-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="inventory-popup-title">
                <div className="system-dialog">
                  <div className="system-dialog-title" id="inventory-popup-title">
                    {inventoryPopup.title}
                  </div>
                  <div className="system-dialog-body">
                    <div className="system-dialog-icon">!</div>
                    <div className="system-dialog-message">{inventoryPopup.message}</div>
                  </div>
                  <div className="system-dialog-actions">
                    <button className="classic-btn" type="button" onClick={dismissInventoryPopup}>
                      Cancel
                    </button>
                    {inventoryPopup.confirm ? (
                      <button className="primary-btn" type="button" onClick={confirmInventoryPopup}>
                        OK
                      </button>
                    ) : (
                      <button className="primary-btn" type="button" onClick={dismissInventoryPopup}>
                        OK
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
            {inventorySuccessPopup ? (
              <div className="inventory-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="inventory-success-title">
                <div className="system-dialog">
                  <div className="system-dialog-title" id="inventory-success-title">
                    {inventorySuccessPopup.title}
                  </div>
                  <div className="system-dialog-body">
                    <div className="system-dialog-icon">✓</div>
                    <div className="system-dialog-message">{inventorySuccessPopup.message}</div>
                  </div>
                  <div className="system-dialog-actions">
                    <button className="primary-btn" type="button" onClick={dismissInventorySuccessPopup}>
                      OK
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            </div>

            {artDetailsOpen ? (
              <aside className="panel art-details-panel">
                <div className="panel-head">
                  <div>
                    <div className="section-title">Art Number Details</div>
                    <h2>{selectedArtNo || "Selected Art"}</h2>
                  </div>
                  <button className="secondary-btn" type="button" onClick={closeArtDetails}>
                    Close
                  </button>
                </div>

                {selectedItemDetail?.item ? (
                  <>
                    <div className="detail-grid">
                      <div>
                        <div className="detail-label">Art Number</div>
                        <div className="detail-value">{selectedItemDetail.item.art_no || selectedArtNo || "-"}</div>
                      </div>
                      <div>
                        <div className="detail-label">Category</div>
                        <div className="detail-value">{selectedItemDetail.item.category || "-"}</div>
                      </div>
                      <div>
                        <div className="detail-label">Item Name</div>
                        <div className="detail-value">{selectedItemDetail.item.item_name || "-"}</div>
                      </div>
                      <div>
                        <div className="detail-label">Available Qty</div>
                        <div className="detail-value">{selectedItemDetail.item.available_qty ?? 0}</div>
                      </div>
                      <div>
                        <div className="detail-label">Wholesale</div>
                        <div className="detail-value">
                          Rs {(Number(selectedItemDetail.item.wholesale || 0)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div>
                        <div className="detail-label">Weight</div>
                        <div className="detail-value">{selectedItemDetail.item.weight || "-"}</div>
                      </div>
                    </div>

                    <div className="detail-note">Use the weight from this panel for barcode label generation.</div>

                    <div className="section-title">Stock Movement Section</div>
                    <div className="table-wrap inventory-table-wrap detail-table-wrap">
                      <table className="inventory-table">
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>Type</th>
                            <th>Qty</th>
                            <th>From</th>
                            <th>To</th>
                            <th>Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.isArray(selectedItemDetail.movementRows) && selectedItemDetail.movementRows.length ? (
                            selectedItemDetail.movementRows.map((row, index) => (
                              <tr key={`${row.created_at || index}`}>
                                <td>{String(row.created_at || "").replace("T", " ").slice(0, 16) || "-"}</td>
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
                  </>
                ) : (
                  <div className="detail-empty">Open an art number from the inventory table to show details here.</div>
                )}
              </aside>
            ) : null}
          </section>
        ) : null}

        {isInventoryUploadTab ? (
          <section className="inventory-upload-screen">
            <section className="panel inventory-upload-panel">
              <div className="panel-head">
                <div>
                  <div className="section-title">Upload Excel</div>
                  <h2>Inventory Import</h2>
                </div>
                <button className="secondary-btn" type="button" onClick={() => setActiveTab("inventory")}>
                  Back
                </button>
              </div>
              <div className="bulk-file-row inventory-upload-row">
                <label className="field">
                  <input value={inventoryUploadFileName} readOnly placeholder="No file selected" />
                  <input
                    className="inventory-upload-hidden-file"
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={(e) => {
                      const nextFile = e.target.files?.[0] || null;
                      setInventoryUploadFile(nextFile);
                      setInventoryUploadFileName(nextFile?.name || "");
                      setInventoryUploadRows([]);
                      setInventoryUploadPopup(null);
                      if (nextFile) {
                        void loadInventoryUploadFile(nextFile);
                      }
                    }}
                  />
                </label>
                <button className="classic-btn" type="button" onClick={openInventoryUploadPicker}>
                  Browse
                </button>
                <button className="classic-btn" type="button" onClick={clearInventoryUploadSelection}>
                  Clear
                </button>
                <button className="primary-btn" type="button" disabled={inventoryUploadLoading || !inventoryUploadRows.length} onClick={() => uploadInventoryRows()}>
                  Load
                </button>
              </div>
              <div className="bulk-note">
                Required columns: <strong>ART NO, Batch No, Design No, Item Name, Category, Quantity, Branch, Description</strong>
              </div>
              <div className="bulk-preview">
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>ART NO</th>
                      <th>Batch No</th>
                      <th>Design No</th>
                      <th>Item Name</th>
                      <th>Category</th>
                      <th>Qty</th>
                      <th>Branch</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryUploadRows.length ? inventoryUploadRows.map((row) => (
                      <tr
                        key={`${row.row_no}-${row.art_no}`}
                        className={
                          row.hasError
                            ? String(row.errorText || "").toLowerCase().includes("branch mismatch")
                              ? "inventory-upload-row-branch-mismatch"
                              : "inventory-upload-row-error"
                            : row.isNewArt
                              ? "inventory-upload-row-new"
                              : ""
                        }
                      >
                        <td>{row.row_no}</td>
                        <td>{row.art_no || "-"}</td>
                        <td>{row.batch_no || "-"}</td>
                        <td>{row.design_no || "-"}</td>
                        <td>{row.item_name || "-"}</td>
                        <td>{row.category || "-"}</td>
                        <td>{row.quantity || "-"}</td>
                        <td>{row.branch || "-"}</td>
                        <td>{row.description || "-"}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={9}>No inventory file loaded yet</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {inventoryUploadPopup ? (
                <CommonPopup
                  title={inventoryUploadPopup.title}
                  message={inventoryUploadPopup.message}
                  ariaLabel={inventoryUploadPopup.title}
                  confirmLabel="OK"
                  onCancel={() => setInventoryUploadPopup(null)}
                />
              ) : null}
            </section>
          </section>
        ) : activeTab === "stock-movement" ? (
          <section className="stock-movement-stack">
            <div className="stock-movement-layout stock-transfer-grid">
              <div className="panel form-panel stock-transfer-panel stock-transfer-main">
                  <div className="panel-head">
                    <div>
                      <h2>Stock Transfer</h2>
                    </div>
                  </div>
                  <div className="transfer-lookup-row transfer-lookup-row-top">
                    <label className="field transfer-date-field">
                      Date
                      <input type="date" value={movementDate} onChange={(e) => setMovementDate(e.target.value)} />
                    </label>
                    <label className="field transfer-lookup-field">
                      Scan / ART NO
                      <input
                        list="movement-art-suggestions"
                        value={movementLookup}
                        onChange={(e) => {
                          setMovementLookup(e.target.value);
                          setMovementQtyRejected(false);
                        }}
                        placeholder="ART NO"
                      />
                      <datalist id="movement-art-suggestions">
                        {movementArtSuggestions.map((row) => (
                          <option key={row.art_no} value={row.art_no}>
                            {row.item_name ? `${row.art_no} - ${row.item_name}` : row.art_no}
                          </option>
                        ))}
                      </datalist>
                    </label>
                    <div className="transfer-scan-actions">
                      <button className="classic-btn" type="button" onClick={() => handleScan("stock-transfer")}>
                        Scan
                      </button>
                      <button className="classic-btn" type="button" onClick={clearStockTransferInputs}>
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="movement-item-summary">
                    <div className="movement-item-line">
                      Item: {movementLookupRecord ? `${movementLookupRecord.art_no} - ${movementLookupRecord.item_name}` : "-"}
                    </div>
                    <div className={`movement-qty-line ${movementQtyInvalid ? "movement-qty-line-invalid" : ""}`}>
                      Available Qty: {movementLookupRecord ? `${getTotalAvailableQty(movementLookupRecord)} Qty` : "0 Qty"}
                    </div>
                    {movementLookupRecord ? (
                      <div className="movement-stock-line">
                        {inventoryColumns.map((col) => `${col} - ${movementLookupRecord.by?.[col] ?? 0} Qty`).join(" | ")}
                      </div>
                    ) : null}
                  </div>
                  <div className="filters movement-grid">
                    <label className="field">
                      From
                      <select value={movementFrom} onChange={(e) => setMovementFrom(e.target.value)}>
                        {branchOptions.map((branch) => (
                          <option key={branch} value={branch}>
                            {branch}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      To
                      <select value={movementTo} onChange={(e) => setMovementTo(e.target.value)}>
                        {branchOptions.filter((branch) => branch !== movementFrom).map((branch) => (
                          <option key={branch} value={branch}>
                            {branch}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Quantity
                      <div className="quantity-input-wrap">
                        <input
                          type="number"
                          min={0}
                          ref={movementQtyRef}
                          value={movementQty}
                          className={movementQtyInvalid ? "movement-qty-input-invalid" : ""}
                          onChange={(e) => {
                            const nextQty = e.target.value;
                            if (nextQty !== "" && (!/^\d+$/.test(nextQty) || Number(nextQty) < 0)) {
                              setMovementQty("");
                              setMovementError("Quantity must be 0 or greater");
                              setMovementQtyRejected(true);
                              return;
                            }
                            if (nextQty === "") {
                              setMovementError("");
                              setMovementQtyRejected(false);
                              setMovementQty("");
                              return;
                            }
                            if (movementLookupRecord && movementFromQty <= 0) {
                              setMovementQty("");
                              setMovementError(`Branch ${movementFrom} does not have any qty for ${movementLookup || movementLookupRecord.art_no || "-"}`);
                              setMovementQtyRejected(true);
                              return;
                            }
                            if (movementLookupRecord && Number(nextQty) > movementFromQty) {
                              setMovementQty("");
                              setMovementError(`Only ${movementFromQty} Qty available in ${movementFrom} for ${movementLookup || movementLookupRecord.art_no || "-"}`);
                              setMovementQtyRejected(true);
                              return;
                            }
                            setMovementError("");
                            setMovementQtyRejected(false);
                            setMovementQty(nextQty);
                          }}
                        />
                      </div>
                    </label>
                    <button className="primary-btn transfer-ok-btn" type="button" disabled={loading} onClick={enqueueTransfer}>
                      Add
                    </button>
                  </div>
                  <label className="field">
                    Note
                    <input value={movementNote} onChange={(e) => setMovementNote(e.target.value)} placeholder="Optional note" />
                  </label>
                </div>

                <section className="panel form-panel bulk-stock-panel stock-bulk-fullrow">
                  <div className="panel-head">
                    <div>
                      <h2>Bulk Stock Load (File)</h2>
                    </div>
                  </div>
                  <div className="bulk-note">
                    Required columns: <strong>Item Name, ART NO, Wholesale Price, Quantity</strong>
                  </div>
                  <div className="filters">
                    <label className="field">
                      From
                      <select value={bulkStockFrom} onChange={(e) => setBulkStockFrom(e.target.value)}>
                        {branchOptions.map((branch) => (
                          <option key={branch} value={branch}>
                            {branch}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      To
                      <select value={bulkStockTo} onChange={(e) => setBulkStockTo(e.target.value)}>
                        {branchOptions.map((branch) => (
                          <option key={branch} value={branch}>
                            {branch}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="bulk-file-row">
                    <label className="field">
                      <input value={bulkStockFileName} readOnly placeholder="No file selected" />
                      <input
                        className="sales-load-hidden-file"
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={(e) => handleBulkFilePick(e.target.files?.[0] || null)}
                      />
                    </label>
                    <button className="classic-btn" type="button" onClick={() => document.querySelector<HTMLInputElement>('.bulk-stock-panel input[type="file"]')?.click()}>
                      Browse
                    </button>
                <button className="classic-btn" type="button" onClick={addBulkStockToPendingQueue}>
                  Add
                </button>
                    <button className="primary-btn" type="button" disabled={bulkStockLoading} onClick={() => loadBulkStockFile()}>
                      Load File
                    </button>
                  </div>
                  <div className="bulk-preview">
                    <table className="inventory-table">
                      <thead>
                        <tr>
                          <th>Item Name</th>
                          <th>ART NO</th>
                          <th>Wholesale</th>
                          <th>Quantity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkStockPreview.length ? bulkStockPreview.map((row, index) => (
                          <tr key={`${row.art_no || index}-${index}`} className={row.missingArt ? "bulk-row-missing-art" : ""}>
                            <td>{row.item_name || "-"}</td>
                            <td>{row.art_no || "-"}</td>
                            <td>{row.wholesale || "-"}</td>
                            <td>{row.quantity || "-"}</td>
                          </tr>
                        )) : (
                          <tr>
                            <td colSpan={4}>No bulk file loaded yet</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

              <div className="panel form-panel pending-queue-panel stock-transfer-queue">
                  <div className="panel-head">
                    <div>
                      <h2>Pending Queue</h2>
                      <p>Queued transfers waiting for processing</p>
                    </div>
                  </div>
                  <div className="pending-queue-toolbar">
                    <div className="pending-qty">Pending Qty : {pendingTransfers.reduce((sum, row) => sum + row.qty, 0)}</div>
                    <div className="pending-queue-actions">
                      <button className="classic-btn" type="button" onClick={clearPendingQueue}>
                        <span className="pending-btn-desktop">Clear Pending</span>
                        <span className="pending-btn-mobile">Clear</span>
                      </button>
                      <button className="classic-btn" type="button" onClick={removeSelectedPending}>
                        <span className="pending-btn-desktop">Remove Selected</span>
                        <span className="pending-btn-mobile">Remove</span>
                      </button>
                      <button className="primary-btn" type="button" disabled={loading || !pendingTransfers.length} onClick={transferPendingQueue}>
                        Transfer
                      </button>
                    </div>
                  </div>
                  <div className="pending-queue-table-wrap">
                    <table className="inventory-table pending-queue-table">
                      <thead>
                        <tr>
                          <th>Select</th>
                          <th>ART NO</th>
                          <th>From</th>
                          <th>To</th>
                          <th>Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingTransfers.length ? pendingTransfers.map((row) => (
                          <tr key={row.id}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedPendingIds.has(row.id)}
                                onChange={() => {
                                  setSelectedPendingIds((current) => {
                                    const next = new Set(current);
                                    if (next.has(row.id)) next.delete(row.id);
                                    else next.add(row.id);
                                    return next;
                                  });
                                }}
                              />
                            </td>
                            <td>{row.art_no || row.lookup || "-"}</td>
                            <td>{row.from_branch}</td>
                            <td>{row.to_branch}</td>
                            <td>{row.qty}</td>
                          </tr>
                        )) : (
                          <tr>
                            <td>
                              <input type="checkbox" disabled />
                            </td>
                            <td>-</td>
                            <td>-</td>
                            <td>-</td>
                            <td>-</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
            </div>
            {movementError ? (
              <div className="system-dialog-backdrop" role="dialog" aria-modal="true" aria-label="Error">
                <div className="system-dialog">
                  <div className="system-dialog-title">Error</div>
                  <div className="system-dialog-body">
                    <div className="system-dialog-icon">×</div>
                    <div className="system-dialog-message">{movementError}</div>
                  </div>
                  <div className="system-dialog-actions">
                    <button className="primary-btn" type="button" onClick={() => { setMovementQtyRejected(false); setMovementError(""); }}>
                      OK
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            {movementPopup ? (
              <div className="system-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="movement-popup-title">
                <div className="system-dialog">
                  <div className="system-dialog-title" id="movement-popup-title">
                    {movementPopup.title}
                  </div>
                  <div className="system-dialog-body">
                    <div className="system-dialog-icon">!</div>
                    <div className="system-dialog-message">{movementPopup.message}</div>
                  </div>
                  <div className="system-dialog-actions">
                    <button className="classic-btn" type="button" onClick={dismissMovementPopup}>
                      Cancel
                    </button>
                    {movementPopup.confirm ? (
                      <button
                        className="primary-btn"
                        type="button"
                        onClick={() => {
                          dismissMovementPopup();
                          void commitPendingQueueTransfer();
                        }}
                      >
                        OK
                      </button>
                    ) : (
                      <button className="primary-btn" type="button" onClick={dismissMovementPopup}>
                        OK
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
            {transferSuccessPopup ? (
              <div className="system-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="transfer-success-title">
                <div className="system-dialog">
                  <div className="system-dialog-title" id="transfer-success-title">
                    {transferSuccessPopup.title}
                  </div>
                  <div className="system-dialog-body">
                    <div className="system-dialog-icon">✓</div>
                    <div className="system-dialog-message">{transferSuccessPopup.message}</div>
                  </div>
                  <div className="system-dialog-actions">
                    <button className="primary-btn" type="button" onClick={dismissTransferSuccessPopup}>
                      OK
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            {bulkStockPopup ? (
              <CommonPopup
                title={bulkStockPopup.title}
                message={bulkStockPopup.message}
                ariaLabel={bulkStockPopup.title}
                confirm={Boolean(bulkStockPopup.confirm)}
                onCancel={() => setBulkStockPopup(null)}
                onConfirm={confirmAddBulkStockToPendingQueue}
                confirmLabel={bulkStockPopup.confirm ? "Confirm" : "OK"}
              />
            ) : null}
          </section>
        ) : null}
        {activeTab === 'moves' ? (
          <section className={`panel moves-panel ${movesExpanded ? "expanded" : ""}`}>
            <div className="moves-toolbar">
              <div className="moves-search-row">
                <label className="field moves-search-field">
                  Search
                  <input value={movesSearch} onChange={(e) => setMovesSearch(e.target.value)} placeholder="Search" />
                </label>
                <label className="field moves-field moves-mode-field">
                  Type
                  <select value={movesSearchMode} onChange={(e) => setMovesSearchMode(e.target.value as "all" | "art_no")}>
                    <option value="all">All</option>
                    <option value="art_no">ART NO</option>
                  </select>
                </label>
                <div className="moves-actions">
                  <button
                    className="classic-btn"
                    type="button"
                    onClick={() => {
                      setMovesDateFrom("");
                      setMovesDateTo("");
                      setMovesSearch("");
                      setMovesBranch("All");
                      setMovesSearchMode("all");
                    }}
                  >
                    Clear
                  </button>
                  <button className="classic-btn moves-expand-btn" type="button" onClick={() => setMovesExpanded((value) => !value)}>
                    Expand Rows
                  </button>
                  <button className="classic-btn" type="button" onClick={() => refreshAll().catch((err) => setError(err instanceof Error ? err.message : "Refresh failed"))}>
                    Refresh
                  </button>
                </div>
              </div>
              <div className="moves-filter-row">
                <label className="field moves-field">
                  Branch
                  <select value={movesBranch} onChange={(e) => setMovesBranch(e.target.value)}>
                    {branchList.map((branch) => (
                      <option key={branch} value={branch}>
                        {branch}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field moves-search-field">
                  Date From
                  <input type="date" value={movesDateFrom} onChange={(e) => setMovesDateFrom(e.target.value)} />
                </label>
                <label className="field moves-search-field">
                  Date To
                  <input type="date" value={movesDateTo} onChange={(e) => setMovesDateTo(e.target.value)} />
                </label>
              </div>
            </div>
            <div className="moves-table-title">Moves</div>
            <div className="table-wrap moves-table-wrap">
              <table className="moves-table">
                <thead>
                  <tr>
                    <th><HeadSort label="Date" onClick={() => toggleMovesSort("date")} /></th>
                    <th><HeadSort label="ART NO" onClick={() => toggleMovesSort("art_no")} /></th>
                    <th><HeadSort label="Type" onClick={() => toggleMovesSort("type")} /></th>
                    <th><HeadSort label="From" onClick={() => toggleMovesSort("from")} /></th>
                    <th><HeadSort label="To" onClick={() => toggleMovesSort("to")} /></th>
                    <th><HeadSort label="Qty" onClick={() => toggleMovesSort("qty")} /></th>
                    <th><HeadSort label="Category" onClick={() => toggleMovesSort("category")} /></th>
                    <th><HeadSort label="Item" onClick={() => toggleMovesSort("item")} /></th>
                  </tr>
                </thead>
                <tbody>
                  {groupedMovesRows.map(({ key, date, artNo, rows, category, itemName, totalQty }) => (
                    <Fragment key={key}>
                      <tr className={`moves-parent-row ${movesExpanded ? "moves-parent-row-expanded" : ""}`}>
                        <td>{date || "-"}</td>
                        <td>{artNo || "-"}</td>
                        <td>{rows[0]?.mtype || "-"}</td>
                        <td>{rows[0]?.from_p || rows[0]?.from_branch || "-"}</td>
                        <td>{rows[0]?.to_p || rows[0]?.to_branch || "-"}</td>
                        <td>{Number(rows[0]?.qty ?? rows[0]?.quantity ?? 0)}</td>
                        <td>{category || "-"}</td>
                        <td>{itemName || "-"}</td>
                      </tr>
                      {movesExpanded ? (
                        <>
                          {rows.slice(1).map((row) => (
                            <tr key={row.id ?? `${row.created_at}-${row.art_no}-${row.from_p}-${row.to_p}`}>
                              <td />
                              <td />
                              <td>{row.mtype || "-"}</td>
                              <td>{row.from_p || row.from_branch || "-"}</td>
                              <td>{row.to_p || row.to_branch || "-"}</td>
                              <td>{row.qty ?? row.quantity ?? 0}</td>
                              <td />
                              <td />
                            </tr>
                          ))}
                          <tr className="moves-sum-row">
                            <td colSpan={5}>SUM</td>
                            <td>{totalQty}</td>
                            <td />
                            <td />
                          </tr>
                        </>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {activeTab === "admin-panel" && role === "admin" ? (
          <section className="panel form-panel admin-panel">
            <div className="section-title">Admin Panel</div>
            <div className="admin-panel-copy">Create login users here. Only the admin account can see this tab.</div>

            <div className="admin-create-grid">
              <label className="field">
                Username
                <input value={adminNewUsername} onChange={(e) => setAdminNewUsername(e.target.value)} placeholder="New username" />
              </label>
              <label className="field">
                Password
                <div className="password-field">
                  <input
                    type={showAdminNewPassword ? "text" : "password"}
                    value={adminNewPassword}
                    onChange={(e) => setAdminNewPassword(e.target.value)}
                    placeholder="New password"
                  />
                  <button
                    className="password-toggle"
                    type="button"
                    onClick={() => setShowAdminNewPassword((value) => !value)}
                    aria-label={showAdminNewPassword ? "Hide password" : "Show password"}
                    title={showAdminNewPassword ? "Hide password" : "Show password"}
                  >
                    {showAdminNewPassword ? (
                      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3l18 18" />
                        <path d="M10.58 10.58A2 2 0 0 0 12 16a2 2 0 0 0 1.42-.58" />
                        <path d="M9.88 5.05A10.45 10.45 0 0 1 12 5c7 0 10 7 10 7a18.35 18.35 0 0 1-3.17 4.4" />
                        <path d="M6.61 6.61A18.23 18.23 0 0 0 2 12s3 7 10 7a10.47 10.47 0 0 0 3.44-.59" />
                      </svg>
                    ) : (
                      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </label>
              <label className="field">
                Role
                <select value={adminNewRole} onChange={(e) => setAdminNewRole(e.target.value as LocalAccount["role"])}>
                  <option value="staff">Staff</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label className="field">
                Branch
                <select value={adminNewBranch} onChange={(e) => setAdminNewBranch(e.target.value)}>
                  <option value="All branches">All branches</option>
                  {branchOptions.map((branch) => (
                    <option key={branch} value={branch}>
                      {branch}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-actions form-actions-grid">
                <button
                  className="primary-btn"
                  type="button"
                  onClick={() => {
                    void createAccount({
                      username: adminNewUsername,
                      password: adminNewPassword,
                      role: adminNewRole,
                      branch_name: adminNewBranch,
                    });
                    setAdminNewUsername("");
                    setAdminNewPassword("");
                    setAdminNewRole("staff");
                    setAdminNewBranch("All branches");
                  }}
                >
                  Create Login
                </button>
              </div>
            </div>

            <div className="admin-edit-panel">
              <div className="admin-edit-title">Edit / Reset Login</div>
              <div className="admin-create-grid">
                <label className="field">
                  Selected Username
                  <input value={editingAccountUsername} readOnly placeholder="Choose a user below" />
                </label>
              <label className="field">
                New Password
                <div className="password-field">
                  <input
                    type={showEditingPassword ? "text" : "password"}
                    value={editingPassword}
                    onChange={(e) => setEditingPassword(e.target.value)}
                    placeholder="New password"
                    disabled={normalizeAccountName(editingAccountUsername) === "admin"}
                  />
                  <button
                    className="password-toggle"
                    type="button"
                    onClick={() => setShowEditingPassword((value) => !value)}
                    aria-label={showEditingPassword ? "Hide password" : "Show password"}
                    title={showEditingPassword ? "Hide password" : "Show password"}
                    disabled={normalizeAccountName(editingAccountUsername) === "admin"}
                  >
                    {showEditingPassword ? (
                      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3l18 18" />
                        <path d="M10.58 10.58A2 2 0 0 0 12 16a2 2 0 0 0 1.42-.58" />
                        <path d="M9.88 5.05A10.45 10.45 0 0 1 12 5c7 0 10 7 10 7a18.35 18.35 0 0 1-3.17 4.4" />
                        <path d="M6.61 6.61A18.23 18.23 0 0 0 2 12s3 7 10 7a10.47 10.47 0 0 0 3.44-.59" />
                      </svg>
                    ) : (
                      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </label>
                <label className="field">
                  Role
                  <select
                    value={editingRole}
                    onChange={(e) => setEditingRole(e.target.value as LocalAccount["role"])}
                    disabled={normalizeAccountName(editingAccountUsername) === "admin"}
                  >
                    <option value="staff">Staff</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <label className="field">
                  Branch
                  <select
                    value={editingBranch}
                    onChange={(e) => setEditingBranch(e.target.value)}
                    disabled={normalizeAccountName(editingAccountUsername) === "admin"}
                  >
                    <option value="All branches">All branches</option>
                    {branchOptions.map((branch) => (
                      <option key={branch} value={branch}>
                        {branch}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="form-actions form-actions-grid">
                  <button className="primary-btn" type="button" onClick={() => void saveEditedAccount()} disabled={!editingAccountUsername || normalizeAccountName(editingAccountUsername) === "admin"}>
                    Save Changes
                  </button>
                </div>
              </div>
            </div>

            <div className="admin-account-list">
              {accounts.length ? accounts.map((account) => (
                <div key={account.username} className="admin-account-row">
                  <div>
                    <strong>{account.username}</strong>
                    <span>{account.branch_name}</span>
                  </div>
                  <div className="admin-account-actions">
                    <button
                      className="classic-btn"
                      type="button"
                      onClick={() => beginEditAccount(account)}
                      disabled={normalizeAccountName(account.username) === "admin"}
                    >
                      Edit
                    </button>
                    <button
                      className="classic-btn"
                      type="button"
                      onClick={() => void resetPassword(account.username)}
                      disabled={normalizeAccountName(account.username) === "admin"}
                    >
                      Reset Password
                    </button>
                    <button
                      className="classic-btn"
                      type="button"
                      onClick={() => void deleteAccount(account.username)}
                      disabled={normalizeAccountName(account.username) === "admin"}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )) : (
                <div className="admin-empty">No login users created yet.</div>
              )}
            </div>
          </section>
        ) : null}

        <div id="barcode-label-print-area" style={{ position: "absolute", left: "-99999px", top: 0 }}>
          <div className="label">
            <div className="name">{labelRecord?.item_name || itemForm.item_name || "Barcode Label"}</div>
            <div className="meta">
              <div>Art No: {labelRecord?.art_no || itemForm.art_no || "-"}</div>
              <div>Batch No: {labelRecord?.batch_no || itemForm.batch_no || "-"}</div>
              <div>Design No: {labelRecord?.design_no || itemForm.design_no || "-"}</div>
              <div>Weight: {productWeight || "-"}</div>
            </div>
            <svg ref={barcodeSvgRef} />
            <div className="code">{barcodeValue || `${itemForm.art_no || ""}-${itemForm.batch_no || ""}-${itemForm.design_no || ""}`}</div>
          </div>
        </div>
      </AppLayout>
    </ErrorBoundary>
  );
}

type CommonPopupProps = {
  title: string;
  message: string;
  ariaLabel?: string;
  confirm?: boolean;
  onCancel: () => void;
  onConfirm?: () => void;
  cancelLabel?: string;
  confirmLabel?: string;
  icon?: string;
};

function CommonPopup({
  title,
  message,
  ariaLabel,
  confirm,
  onCancel,
  onConfirm,
  cancelLabel = "Cancel",
  confirmLabel = "OK",
  icon = "!",
}: CommonPopupProps) {
  return (
    <div className="system-dialog-backdrop" role="dialog" aria-modal="true" aria-label={ariaLabel || title}>
      <div className="system-dialog">
        <div className="system-dialog-title">{title}</div>
        <div className="system-dialog-body">
          <div className="system-dialog-icon">{icon}</div>
          <div className="system-dialog-message">{message}</div>
        </div>
        <div className="system-dialog-actions">
          {confirm ? (
            <>
              <button className="classic-btn" type="button" onClick={onCancel}>
                {cancelLabel}
              </button>
              <button className="primary-btn" type="button" onClick={onConfirm}>
                {confirmLabel}
              </button>
            </>
          ) : (
            <button className="primary-btn" type="button" onClick={onCancel}>
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

