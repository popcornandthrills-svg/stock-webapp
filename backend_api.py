import base64
import hashlib
import hmac
import json
import os
import shutil
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Optional

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from stock_core import (
    BRANCH_POINTS,
    CATEGORIES,
    DB,
    DB_PATH,
    LOGIN_PASSWORD,
    POINTS,
    display_time,
    invoice_branch_prefix,
    now_iso,
)

BUNDLED_DB_PATH = Path(DB_PATH).resolve()
DATABASE_URL = str(os.getenv("DATABASE_URL", "") or "").strip()
API_DB_PATH = Path(os.getenv("STOCK_DB_PATH", str(DB_PATH))).expanduser().resolve()
API_SECRET_KEY = os.getenv("API_SECRET_KEY", "goldprince-api-secret-change-me")
API_TOKEN_HOURS = int(os.getenv("API_TOKEN_HOURS", "12") or "12")
API_DB_SOURCE = "postgres" if DATABASE_URL else "sqlite"
ACCOUNTS_FILE = Path(__file__).resolve().parent / "data" / "accounts.json"

if DATABASE_URL:
    API_DB_TARGET = DATABASE_URL
else:
    API_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if API_DB_PATH != BUNDLED_DB_PATH and not API_DB_PATH.exists() and BUNDLED_DB_PATH.exists():
        shutil.copy2(BUNDLED_DB_PATH, API_DB_PATH)
    API_DB_TARGET = API_DB_PATH

db = DB(API_DB_TARGET)
bearer_scheme = HTTPBearer(auto_error=False)

app = FastAPI(
    title="GOLDPRINCE Stock Management API",
    version="1.0.0",
    description="FastAPI backend for the GOLDPRINCE stock management and billing system.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LoginMode(str, Enum):
    admin = "admin"
    shop_manager = "shop_manager"


class PriceType(str, Enum):
    retail = "Retail"
    wholesale = "Wholesale"


class AdjustmentMode(str, Enum):
    percent = "Percent"
    rupees = "Rupees"


@dataclass
class CurrentUser:
    role: str
    user_name: str
    branch_id: Optional[int] = None
    branch_name: str = ""

    @property
    def is_admin(self):
        return self.role == "admin"

    @property
    def is_shop_manager(self):
        return self.role == "shop_manager"

    @property
    def is_manager(self):
        return self.role == "manager"

    @property
    def is_staff(self):
        return self.role == "staff"


class LoginRequest(BaseModel):
  mode: LoginMode = LoginMode.admin
  password: str = Field(min_length=1)
  branch: Optional[str] = None
  username: Optional[str] = None
  role: Optional[str] = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_name: str
    branch_name: str = ""
    branch_id: Optional[int] = None
    expires_at: str


class InvoiceLineRequest(BaseModel):
    lookup: Optional[str] = None
    item_id: Optional[int] = None
    qty: int = Field(gt=0)
    unit: str = "Nos"
    rate: Optional[float] = Field(default=None, ge=0)
    gst_percent: float = Field(default=18, ge=0)


class InvoiceCreateRequest(BaseModel):
    branch: Optional[str] = None
    branch_id: Optional[int] = None
    customer_name: str = "Walk-in Customer"
    customer_phone: str = ""
    address: str = ""
    price_type: PriceType = PriceType.retail
    date: Optional[str] = None
    discount_mode: AdjustmentMode = AdjustmentMode.percent
    discount_value: float = Field(default=0, ge=0)
    tds_mode: AdjustmentMode = AdjustmentMode.percent
    tds_value: float = Field(default=0, ge=0)
    paid_amount: float = Field(default=0, ge=0)
    payment_mode: str = "Cash"
    note: str = ""
    lines: list[InvoiceLineRequest]


class InvoiceReturnLineRequest(BaseModel):
    invoice_line_id: int = Field(gt=0)
    qty: int = Field(gt=0)


class InvoiceReturnRequest(BaseModel):
    items: list[InvoiceReturnLineRequest]
    return_no: Optional[str] = None


class InvoiceBranchUpdateRequest(BaseModel):
    branch: str


class ShopManagerRequest(BaseModel):
    branch: str
    manager_name: str
    password: str


class PasswordResetRequest(BaseModel):
    password: str


class InventoryItemRequest(BaseModel):
    art_no: str
    batch_no: str
    design_no: str
    item_name: str
    category: str
    branch: Optional[str] = None
    branch_id: Optional[int] = None
    reorder: int = 0
    quantity: int = 0
    desc: str = ""


class TransferTargetRequest(BaseModel):
    to_branch: str
    qty: int = Field(gt=0)


class StockTransferRequest(BaseModel):
    lookup: str
    from_branch: str
    note: str = ""
    transfers: list[TransferTargetRequest]


class BulkLoadRowRequest(BaseModel):
    item_name: str
    art_no: str
    wholesale: float = 0
    retail: float = 0
    quantity: float = 0


class BulkLoadRequest(BaseModel):
    branch: str
    from_branch: Optional[str] = None
    note: str = ""
    rows: list[BulkLoadRowRequest]


class SalesLoadRowRequest(BaseModel):
    row_no: int = 0
    item_name: str
    art_no: str
    price: float
    quantity: float


class SalesLoadRequest(BaseModel):
    branch: str
    sale_date: str = ""
    source_name: str = "Sales import"
    rows: list[SalesLoadRowRequest]


def encode_b64(raw):
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_b64(raw):
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(raw + padding)


def issue_token(payload):
    token_payload = dict(payload)
    expires_at = datetime.now(UTC) + timedelta(hours=API_TOKEN_HOURS)
    token_payload["exp"] = int(expires_at.timestamp())
    body = json.dumps(token_payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    signature = hmac.new(API_SECRET_KEY.encode("utf-8"), body, hashlib.sha256).digest()
    token = f"{encode_b64(body)}.{encode_b64(signature)}"
    return token, expires_at.isoformat().replace("+00:00", "Z")


def decode_token(token):
    try:
        body_part, sig_part = token.split(".", 1)
        body = decode_b64(body_part)
        actual_sig = decode_b64(sig_part)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token format") from exc

    expected_sig = hmac.new(API_SECRET_KEY.encode("utf-8"), body, hashlib.sha256).digest()
    if not hmac.compare_digest(actual_sig, expected_sig):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token signature")

    payload = json.loads(body.decode("utf-8"))
    if int(payload.get("exp") or 0) < int(datetime.now(UTC).timestamp()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    return payload


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    payload = decode_token(credentials.credentials)
    return CurrentUser(
        role=str(payload.get("role") or ""),
        user_name=str(payload.get("user_name") or ""),
        branch_id=payload.get("branch_id"),
        branch_name=str(payload.get("branch_name") or ""),
    )


def require_admin(user: CurrentUser = Depends(get_current_user)):
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


def point_map():
    return db.point_map()


def branch_id_for_name(branch_name):
    pmap = point_map()
    branch = str(branch_name or "").strip()
    if branch not in pmap:
        branch_key = branch.upper()
        for name in pmap:
            if str(name).strip().upper() == branch_key:
                return int(pmap[name])
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown branch: {branch}")
    return int(pmap[branch])


def branch_context(requested_branch, user: CurrentUser, default_admin_to_ho=False):
    if user.is_manager:
        if requested_branch:
          branch = str(requested_branch).strip()
          return branch, branch_id_for_name(branch)
        return "All branches", None
    if user.is_staff:
        if requested_branch and str(requested_branch).strip() and str(requested_branch).strip() != user.branch_name:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff can access only their own branch")
        return user.branch_name, int(user.branch_id or 0)
    if user.is_shop_manager:
        if requested_branch and str(requested_branch).strip() and str(requested_branch).strip() != user.branch_name:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Shop managers can access only their own branch")
        return user.branch_name, int(user.branch_id or 0)
    if requested_branch:
        branch = str(requested_branch).strip()
        return branch, branch_id_for_name(branch)
    if default_admin_to_ho:
        return "H.O", branch_id_for_name("H.O")
    return None, None


def enrich_item_from_moves(art_no: str, base_row: Optional[dict] = None):
    art = str(art_no or "").strip().upper()
    if not art:
        return base_row or None
    row = dict(base_row or {})
    try:
        recent_moves = db.moves(limit=20, art_no=art)
    except Exception:
        recent_moves = []
    latest_move = next((m for m in recent_moves if str(m.get("art_no") or "").strip().upper() == art), None)
    if latest_move:
        row.setdefault("art_no", art)
        if not str(row.get("item_name") or "").strip():
            row["item_name"] = str(latest_move.get("item_name") or "").strip()
        if not str(row.get("category") or "").strip():
            row["category"] = str(latest_move.get("category") or "").strip()
        if not str(row.get("created_at") or "").strip():
            row["created_at"] = str(latest_move.get("created_at") or "").strip()
        if not str(row.get("updated_at") or "").strip():
            row["updated_at"] = str(latest_move.get("created_at") or "").strip()
    try:
        lookup_row = db.lookup_stock(art, 1)
    except Exception:
        lookup_row = None
    if lookup_row:
        row.setdefault("art_no", art)
        if not str(row.get("item_name") or "").strip():
            row["item_name"] = str(lookup_row.get("item_name") or "").strip()
        if not str(row.get("available_qty") or "").strip():
            row["available_qty"] = int(lookup_row.get("point_qty") or 0)
    return row or None


def billing_timestamp(raw_date):
    for fmt in ("%d-%m-%Y", "%Y-%m-%d"):
        try:
            d = datetime.strptime(str(raw_date or "").strip(), fmt).date()
            return datetime(d.year, d.month, d.day, 12, 0, 0, tzinfo=UTC).isoformat().replace("+00:00", "Z")
        except ValueError:
            continue
    return now_iso()


def parse_number(value):
    try:
        return round(float(str(value or "").strip() or "0"), 2)
    except Exception:
        return 0.0


def build_invoice_lines(lines, branch_id, price_type):
    built = []
    for line in lines:
        payload = line.model_dump()
        lookup_value = payload.get("lookup")
        item_id = payload.get("item_id")
        item = None
        if item_id:
            item = db.billing_lookup_item(str(item_id), branch_id)
        elif lookup_value:
            item = db.billing_lookup_item(lookup_value, branch_id)
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Item not found: {lookup_value or item_id}")

        qty = int(payload["qty"])
        available = int(item.get("available_qty") or item.get("point_qty") or 0)
        if qty > available:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Insufficient stock for {item['art_no']} at selected branch. Available: {available}",
            )

        rate = payload["rate"]
        if rate is None:
            rate = item["retail"] if price_type == PriceType.retail else item["wholesale"]
        rate = round(float(rate), 2)
        gst_percent = round(float(payload.get("gst_percent") or 0), 2)
        taxable_amount = round(qty * rate, 2)
        line_total = round(taxable_amount + (taxable_amount * gst_percent / 100), 2)
        built.append(
            {
                "item_id": int(item["id"]),
                "art_no": item["art_no"],
                "item_name": item["item_name"],
                "unit": str(payload.get("unit") or "Nos"),
                "qty": qty,
                "rate": rate,
                "gst_percent": gst_percent,
                "taxable_amount": taxable_amount,
                "line_total": line_total,
            }
        )
    return built


def invoice_summary(lines, discount_mode, discount_value, tds_mode, tds_value, paid_amount):
    taxable = round(sum(float(line.get("taxable_amount") or 0) for line in lines), 2)
    total_gst = round(sum(float(line.get("line_total") or 0) - float(line.get("taxable_amount") or 0) for line in lines), 2)
    cgst = round(total_gst / 2, 2)
    sgst = round(total_gst / 2, 2)
    subtotal = round(taxable + cgst + sgst, 2)

    discount_input = max(parse_number(discount_value), 0.0)
    if discount_mode == AdjustmentMode.rupees:
        discount_amount = min(discount_input, subtotal)
        discount_percent = round((discount_amount / subtotal) * 100, 2) if subtotal else 0.0
    else:
        discount_percent = discount_input
        discount_amount = round(subtotal * discount_percent / 100, 2)
    discount_amount = min(discount_amount, subtotal)

    after_discount = round(max(subtotal - discount_amount, 0), 2)
    tds_input = max(parse_number(tds_value), 0.0)
    if tds_mode == AdjustmentMode.rupees:
        tds_amount = min(tds_input, after_discount)
        tds_percent = round((tds_amount / after_discount) * 100, 2) if after_discount else 0.0
    else:
        tds_percent = tds_input
        tds_amount = round(after_discount * tds_percent / 100, 2)
    tds_amount = min(tds_amount, after_discount)

    pre_round_total = round(after_discount - tds_amount, 2)
    round_target = round(pre_round_total)
    round_off = round(round_target - pre_round_total, 2)
    if abs(round_off) < 0.005:
        round_off = 0.0
    grand_total = round(pre_round_total + round_off, 2)
    paid_value = max(parse_number(paid_amount), 0.0)
    due_amount = round(max(grand_total - paid_value, 0), 2)

    return {
        "taxable": taxable,
        "cgst": cgst,
        "sgst": sgst,
        "subtotal": subtotal,
        "discount_percent": discount_percent,
        "discount_amount": discount_amount,
        "tds_percent": tds_percent,
        "tds_amount": tds_amount,
        "round_off": round_off,
        "grand_total": grand_total,
        "paid_amount": paid_value,
        "due_amount": due_amount,
    }


def inventory_overview(branch_name=None):
    rows = db.inventory()
    skus = 0
    units = 0
    wholesale = 0.0
    retail = 0.0
    low = []
    for row in rows:
        qty = int(row["by"].get(branch_name, 0)) if branch_name else int(row["total"])
        if qty <= 0 and branch_name:
            continue
        skus += 1
        units += qty
        wholesale += qty * float(row["wholesale"] or 0)
        retail += qty * float(row["retail"] or 0)
        if qty <= int(row.get("reorder_level") or 0):
            low.append(
                {
                    "id": int(row["id"]),
                    "art_no": row["art_no"],
                    "item_name": row["item_name"],
                    "available_qty": qty,
                    "reorder_level": int(row.get("reorder_level") or 0),
                }
            )
    return {
        "branch": branch_name or "All",
        "skus": skus,
        "units": units,
        "wholesale": round(wholesale, 2),
        "retail": round(retail, 2),
        "low_stock": low,
    }


def inventory_matches(row, search):
    if not search:
        return True
    needle = search.lower()
    haystack = " ".join(
        [
            str(row.get("art_no") or ""),
            str(row.get("item_name") or ""),
            str(row.get("category") or ""),
            str(row.get("description") or ""),
            str(row.get("batch_no") or ""),
            str(row.get("design_no") or ""),
        ]
    ).lower()
    return needle in haystack


@app.get("/")
def root():
    return {
        "name": "GOLDPRINCE Stock Management API",
        "docs_url": "/docs",
        "redoc_url": "/redoc",
        "database_source": API_DB_SOURCE,
        "database_path": str(API_DB_PATH),
    }


@app.get("/health")
def health():
    return {"status": "ok", "time": now_iso()}


@app.post("/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    if payload.mode == LoginMode.admin:
        if payload.password != LOGIN_PASSWORD:
            db.add_audit_log("api_login", "Admin", actor_name="Admin", status="Failed", note="Incorrect admin password")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect admin password")
        db.add_audit_log("api_login", "Admin", actor_name="Admin", status="Success", note="API admin login")
        token, expires_at = issue_token({"role": "admin", "user_name": "Admin", "branch_name": "", "branch_id": None})
        return LoginResponse(access_token=token, role="admin", user_name="Admin", expires_at=expires_at)

    login_role = str(payload.role or "user").strip().lower()
    login_username = str(payload.username or "").strip()
    branch_name = str(payload.branch or "").strip()
    if login_role == "manager":
        if not ACCOUNTS_FILE.exists():
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Manager login is not configured")
        try:
            with ACCOUNTS_FILE.open("r", encoding="utf-8") as fh:
                saved_accounts = json.load(fh)
        except Exception:
            saved_accounts = []
        manager_account = next(
            (
                account
                for account in saved_accounts if isinstance(account, dict)
                and str(account.get("username") or "").strip().lower() == login_username.lower()
                and str(account.get("password") or "") == payload.password
                and str(account.get("role") or "").strip().lower() == "manager"
            ),
            None,
        )
        if not manager_account:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect manager login")
        db.add_audit_log(
            "api_login",
            "Manager",
            actor_name=str(manager_account.get("username") or "Manager"),
            status="Success",
            note="API manager login",
        )
        token, expires_at = issue_token({"role": "manager", "user_name": str(manager_account.get("username") or "Manager"), "branch_name": "All branches", "branch_id": None})
        return LoginResponse(access_token=token, role="manager", user_name=str(manager_account.get("username") or "Manager"), branch_name="All branches", branch_id=None, expires_at=expires_at)
    if login_role == "staff":
        if not branch_name or branch_name not in BRANCH_POINTS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select a valid branch for staff login")
        staff_account = None
        if ACCOUNTS_FILE.exists():
            try:
                with ACCOUNTS_FILE.open("r", encoding="utf-8") as fh:
                    saved_accounts = json.load(fh)
            except Exception:
                saved_accounts = []
            staff_account = next(
                (
                    account
                    for account in saved_accounts if isinstance(account, dict)
                    and str(account.get("username") or "").strip().lower() == login_username.lower()
                    and str(account.get("password") or "") == payload.password
                    and str(account.get("role") or "").strip().lower() == "staff"
                    and str(account.get("branch_name") or "").strip() == branch_name
                ),
                None,
            )
        if not staff_account:
            db.add_audit_log(
                "api_login",
                "Staff",
                actor_name=login_username or f"{branch_name} Staff",
                branch_id=branch_id_for_name(branch_name),
                status="Failed",
                note="Incorrect staff login",
            )
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect staff login")
        db.add_audit_log(
            "api_login",
            "Staff",
            actor_name=str(staff_account.get("username") or login_username or "Staff"),
            branch_id=branch_id_for_name(branch_name),
            status="Success",
            note="API staff login",
        )
        token, expires_at = issue_token(
            {
                "role": "staff",
                "user_name": str(staff_account.get("username") or login_username or "Staff"),
                "branch_name": branch_name,
                "branch_id": branch_id_for_name(branch_name),
            }
        )
        return LoginResponse(
            access_token=token,
            role="staff",
            user_name=str(staff_account.get("username") or login_username or "Staff"),
            branch_name=branch_name,
            branch_id=branch_id_for_name(branch_name),
            expires_at=expires_at,
        )
    if branch_name not in BRANCH_POINTS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select a valid branch for shop manager login")
    manager = db.verify_shop_manager(branch_id_for_name(branch_name), payload.password)
    if not manager and ACCOUNTS_FILE.exists():
        try:
            with ACCOUNTS_FILE.open("r", encoding="utf-8") as fh:
                saved_accounts = json.load(fh)
            for account in saved_accounts if isinstance(saved_accounts, list) else []:
                if not isinstance(account, dict):
                    continue
                if str(account.get("role") or "user").strip().lower() == "admin":
                    continue
                if str(account.get("branch_name") or "").strip() != branch_name:
                    continue
                if str(account.get("password") or "") != payload.password:
                    continue
                manager = {
                    "branch_id": branch_id_for_name(branch_name),
                    "branch_name": branch_name,
                    "manager_name": str(account.get("username") or f"{branch_name} Manager"),
                }
                break
        except Exception:
            manager = None
    if not manager:
        db.add_audit_log(
            "api_login",
            "Shop Manager",
            actor_name=f"{branch_name} Manager",
            branch_id=branch_id_for_name(branch_name),
            status="Failed",
            note="Incorrect password or login not created",
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password or shop-manager login is not created")
    db.add_audit_log(
        "api_login",
        "Shop Manager",
        actor_name=str(manager.get("manager_name") or f"{branch_name} Manager"),
        branch_id=int(manager["branch_id"]),
        status="Success",
        note="API shop manager login",
    )
    token, expires_at = issue_token(
        {
            "role": "shop_manager",
            "user_name": str(manager.get("manager_name") or f"{branch_name} Manager"),
            "branch_name": str(manager["branch_name"]),
            "branch_id": int(manager["branch_id"]),
        }
    )
    return LoginResponse(
        access_token=token,
        role="shop_manager",
        user_name=str(manager.get("manager_name") or f"{branch_name} Manager"),
        branch_name=str(manager["branch_name"]),
        branch_id=int(manager["branch_id"]),
        expires_at=expires_at,
    )


@app.post("/auth/logout")
def logout(user: CurrentUser = Depends(get_current_user)):
    role_label = "Admin" if user.is_admin else "Shop Manager"
    branch_id = int(user.branch_id) if user.branch_id is not None else None
    actor_name = user.user_name or role_label
    db.add_audit_log("api_logout", role_label, actor_name=actor_name, branch_id=branch_id, status="Success", note="API logout")
    return {"status": "ok"}


@app.get("/auth/me")
def auth_me(user: CurrentUser = Depends(get_current_user)):
    return {
        "role": user.role,
        "user_name": user.user_name,
        "branch_name": user.branch_name,
        "branch_id": user.branch_id,
    }


@app.get("/branches")
def branches(user: CurrentUser = Depends(get_current_user)):
    if user.is_shop_manager:
        return [{"id": user.branch_id, "name": user.branch_name, "invoice_prefix": invoice_branch_prefix(user.branch_name)}]
    return [
        {"id": index, "name": name, "invoice_prefix": invoice_branch_prefix(name)}
        for index, name in enumerate(POINTS, start=1)
    ]


@app.get("/inventory")
def inventory(
    search: str = "",
    branch: Optional[str] = None,
    low_stock_only: bool = False,
    limit: int = Query(default=200, ge=1, le=1000),
    user: CurrentUser = Depends(get_current_user),
):
    branch_name, _branch_id = branch_context(branch, user)
    items = []
    for row in db.inventory():
        if not inventory_matches(row, search):
            continue
        view_all = user.is_admin or user.is_manager or branch_name == "All branches" or not branch_name
        available_qty = int(row["total"]) if view_all else int(row["by"].get(branch_name, 0))
        if not view_all and available_qty <= 0:
            continue
        if low_stock_only and available_qty > int(row.get("reorder_level") or 0):
            continue
        shaped = dict(row)
        shaped["available_qty"] = available_qty
        if user.is_shop_manager:
            shaped["by"] = {user.branch_name: available_qty}
        items.append(shaped)
        if len(items) >= limit:
            break
    return {"branch": branch_name or "All", "count": len(items), "items": items}


@app.get("/inventory/artnos")
def inventory_artnos(user: CurrentUser = Depends(get_current_user)):
    items = []
    for row in db.inventory():
        art_no = str(row.get("art_no") or "").strip()
        if not art_no:
            continue
        items.append(
            {
                "art_no": art_no,
                "item_name": str(row.get("item_name") or "").strip(),
                "branch": str(row.get("branch") or "").strip(),
            }
        )
    return {"count": len(items), "items": items}


@app.get("/inventory/overview")
def inventory_summary(branch: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    branch_name, _branch_id = branch_context(branch, user)
    return inventory_overview(branch_name)


@app.get("/inventory/item-by-art/{art_no}")
def inventory_item_by_art(art_no: str, _user: CurrentUser = Depends(get_current_user)):
    row = db.item_by_art(art_no)
    if not row:
        row = enrich_item_from_moves(art_no)
    else:
        row = enrich_item_from_moves(art_no, row)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    row.setdefault("database_source", API_DB_SOURCE)
    row.setdefault("database_path", str(API_DB_PATH))
    return row


@app.get("/inventory/item-form-by-art/{art_no}")
def inventory_item_form_by_art(art_no: str, user: CurrentUser = Depends(get_current_user)):
    row = db.item_by_art(art_no)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    if user.is_staff:
        return {
            "art_no": row.get("art_no"),
            "batch_no": row.get("batch_no"),
            "design_no": row.get("design_no"),
            "item_name": row.get("item_name"),
            "category": row.get("category"),
            "wholesale": row.get("wholesale"),
            "description": row.get("description"),
            "branch": row.get("branch"),
            "available_qty": row.get("available_qty"),
            "total": row.get("total"),
        }
    return row


@app.get("/inventory/item-history/{art_no}")
def inventory_item_history(art_no: str, user: CurrentUser = Depends(get_current_user)):
    item = db.item_by_art(art_no)
    if not item:
        item = enrich_item_from_moves(art_no)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    move_rows = db.moves(limit=200)
    move_rows = [
        row
        for row in move_rows
        if str(row.get("art_no") or "").strip().upper() == str(art_no or "").strip().upper()
        or str(art_no or "").strip().upper() in str(row.get("note") or "").upper()
    ]
    return {
        "item": item,
        "moves": move_rows,
        "history": db.recent_audit_logs_for_art(art_no, limit=200) if user.is_admin else [],
    }


@app.post("/inventory/items")
def create_or_update_inventory_item(payload: InventoryItemRequest, user: CurrentUser = Depends(get_current_user)):
    if not (user.is_admin or user.is_staff):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin or staff access required")
    if payload.category not in CATEGORIES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Category must be one of: {', '.join(CATEGORIES)}")
    data = payload.model_dump()
    existing = db.item_by_art(payload.art_no)
    if user.is_staff:
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Staff can only add art numbers that already exist in H.O inventory",
            )
        if str(existing.get("branch") or "").strip().upper() not in {"H.O", "HO"}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Staff can only add stock for art numbers already available in H.O",
            )
        requested_branch = str(data.get("branch") or "").strip()
        if requested_branch and user.branch_name and requested_branch.upper() != user.branch_name.strip().upper():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Staff can only add stock for their own branch",
            )
    if data.get("branch_id") is None:
        data["branch_id"] = branch_id_for_name(str(data.get("branch") or "H.O"))
    else:
        data["branch_id"] = int(data["branch_id"])
    mode = db.add_item(data)
    actor_name = user.user_name or "Admin"
    branch_id = int(data["branch_id"]) if data.get("branch_id") is not None else None
    note = (
        f"ART NO {str(payload.art_no).strip().upper()} {mode} by {actor_name} | "
        f"Batch No: {str(existing.get('batch_no') or '-').strip()} -> {str(payload.batch_no).strip()} | "
        f"Design No: {str(existing.get('design_no') or '-').strip()} -> {str(payload.design_no).strip()} | "
        f"Item: {str(payload.item_name).strip()} | Qty: {int(payload.quantity or 0)} | Branch: {str(payload.branch or 'H.O').strip()}"
    )
    db.add_audit_log(
        "inventory_item_upsert",
        "Admin" if user.is_admin else ("Staff" if user.is_staff else ("Manager" if user.is_manager else "Shop Manager")),
        actor_name=actor_name,
        branch_id=branch_id,
        status="Success",
        note=note,
        created_at=str(data.get("created_at") or now_iso()),
    )
    return {"status": "ok", "action": mode, "art_no": payload.art_no.strip().upper()}


@app.delete("/inventory/items/{item_id}")
def delete_inventory_item(item_id: int, user: CurrentUser = Depends(require_admin)):
    deleted = db.delete_item(item_id)
    actor_name = user.user_name or "Unknown"
    db.add_audit_log(
        "inventory_item_delete",
        "Admin",
        actor_name=actor_name,
        branch_id=user.branch_id,
        status="Success",
        note=(
            f"Deleted ART NO {str(deleted.get('art_no') or '').strip().upper()} "
            f"({str(deleted.get('item_name') or '').strip()}) by {actor_name}"
        ),
        created_at=now_iso(),
    )
    return {"status": "ok", "deleted": deleted}


@app.get("/stock/lookup")
def stock_lookup(lookup: str, branch: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    branch_name, branch_id = branch_context(branch, user, default_admin_to_ho=True)
    row = db.lookup_stock(lookup, branch_id)
    return {"branch": branch_name, "item": row}


@app.post("/stock/transfers")
def create_stock_transfer(payload: StockTransferRequest, _user: CurrentUser = Depends(require_admin)):
    try:
        from_id = branch_id_for_name(payload.from_branch)
        transfer_pairs = [(branch_id_for_name(item.to_branch), int(item.qty)) for item in payload.transfers]
        if len(transfer_pairs) == 1:
            to_id, qty = transfer_pairs[0]
            db.transfer(payload.lookup, from_id, to_id, qty, payload.note)
            moved_total = qty
        else:
            moved_total = db.multi_transfer(payload.lookup, from_id, transfer_pairs, payload.note)
        transfer_targets = ", ".join(f"{item.to_branch} {int(item.qty)}" for item in payload.transfers)
        actor_name = getattr(_user, "user_name", "") or "Admin"
        db.add_audit_log(
            "stock_transfer",
            "Admin",
            actor_name=actor_name,
            branch_id=from_id,
            status="Success",
            note=(
                f"ART NO {str(payload.lookup or '').strip().upper()} transfer from {str(payload.from_branch or '').strip()} "
                f"to {transfer_targets} | Qty: {moved_total}"
                + (f" | Note: {str(payload.note or '').strip()}" if str(payload.note or '').strip() else "")
            ),
        )
        return {"status": "ok", "moved_total": moved_total}
    except ValueError as exc:
        # Transfer validation errors should return a client response instead of
        # bubbling up as a 500 and breaking the UI.
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@app.post("/stock/bulk-load")
def bulk_load_stock(payload: BulkLoadRequest, _user: CurrentUser = Depends(require_admin)):
    branch_id = branch_id_for_name(payload.branch)
    from_branch_id = branch_id_for_name(payload.from_branch) if payload.from_branch else None
    ok, bad = db.bulk_load_stock(
        [row.model_dump() for row in payload.rows],
        branch_id,
        payload.note.strip(),
        from_branch_id,
    )
    actor_name = "Admin"
    for row in payload.rows:
        art_no = str(row.art_no or "").strip().upper()
        if not art_no:
            continue
        db.add_audit_log(
            "stock_bulk_load",
            "Admin",
            actor_name=actor_name,
            branch_id=branch_id,
            status="Success",
            note=(
                f"ART NO {art_no} bulk load | Qty: {int(row.quantity or 0)} | "
                f"From: {str(payload.from_branch or '-').strip()} | To: {str(payload.branch).strip()}"
            ),
            created_at=now_iso(),
        )
    return {"status": "ok", "processed": ok, "failed": bad}


@app.post("/sales/load")
def sales_load(payload: SalesLoadRequest, _user: CurrentUser = Depends(require_admin)):
    branch_id = branch_id_for_name(payload.branch)
    ok, bad = db.import_sales_rows(
        branch_id,
        [row.model_dump() for row in payload.rows],
        payload.sale_date,
        source_name=payload.source_name.strip() or "Sales import",
    )
    for row in payload.rows:
        art_no = str(row.art_no or "").strip().upper()
        if not art_no:
            continue
        db.add_audit_log(
            "sales_load",
            "Admin",
            actor_name="Admin",
            branch_id=branch_id,
            status="Success",
            note=(
                f"ART NO {art_no} sales load | Qty: {int(row.quantity or 0)} | "
                f"Price: {float(row.price or 0):.2f} | Branch: {str(payload.branch).strip()} | "
                f"Date: {str(payload.sale_date or '').strip()}"
            ),
            created_at=now_iso(),
        )
    return {"status": "ok", "processed": ok, "failed": bad}


@app.get("/moves")
def moves(
    branch: Optional[str] = None,
    art_no: Optional[str] = None,
    limit: int = Query(default=150, ge=1, le=1000),
    user: CurrentUser = Depends(get_current_user),
):
    branch_name, branch_id = branch_context(branch, user)
    rows = db.moves(limit=limit, branch_id=branch_id)
    if art_no:
        art = str(art_no or "").strip().upper()
        rows = [
            row
            for row in rows
            if art == str(row.get("art_no") or "").strip().upper()
            or art in str(row.get("note") or "").upper()
        ]
    return {"branch": branch_name or "All", "count": len(rows), "moves": rows}


@app.get("/analytics")
def analytics(branch: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    branch_name, branch_id = branch_context(branch, user)
    return {
        "inventory": inventory_overview(branch_name),
        "sales": db.sales_insights(branch_id if branch_name else None),
    }


@app.get("/billing/next-invoice-number")
def billing_next_invoice_number(branch: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    branch_name, _branch_id = branch_context(branch, user, default_admin_to_ho=True)
    prefix_key = branch_name or ("H.O" if user.is_admin else user.branch_name)
    return {"branch": branch_name, "invoice_no": db.next_invoice_number(prefix_key)}


@app.get("/billing/item-lookup")
def billing_item_lookup(lookup: str, branch: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    branch_name, branch_id = branch_context(branch, user, default_admin_to_ho=True)
    row = db.billing_lookup_item(lookup, branch_id)
    return {"branch": branch_name, "item": row}


@app.get("/invoices")
def invoices(
    branch: Optional[str] = None,
    due_only: bool = False,
    limit: int = Query(default=25, ge=1, le=250),
    user: CurrentUser = Depends(get_current_user),
):
    branch_name, branch_id = branch_context(branch, user)
    rows = db.recent_invoices(limit=limit, branch_id=branch_id if branch_name else None, due_only=due_only)
    return {"branch": branch_name or "All", "count": len(rows), "invoices": rows}


@app.get("/invoices/{invoice_id}")
def invoice_detail(invoice_id: int, user: CurrentUser = Depends(get_current_user)):
    head, rows = db.invoice_details(invoice_id)
    if user.is_shop_manager and str(head.get("branch_name") or "") != user.branch_name:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invoice does not belong to your branch")
    return {"invoice": head, "lines": rows}


@app.post("/invoices/{invoice_id}/return")
def return_invoice(
    invoice_id: int,
    payload: Optional[InvoiceReturnRequest] = None,
    user: CurrentUser = Depends(get_current_user),
):
    head, _rows = db.invoice_details(invoice_id)
    if user.is_shop_manager and str(head.get("branch_name") or "") != user.branch_name:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invoice does not belong to your branch")
    if payload and payload.items:
        returned = db.return_invoice_items(
            invoice_id,
            [{"invoice_line_id": int(line.invoice_line_id), "qty": int(line.qty)} for line in payload.items],
            return_no=(payload.return_no or "").strip() or None,
        )
    else:
        returned = db.return_invoice(invoice_id, return_no=(payload.return_no or "").strip() or None if payload else None)
    return {"status": "ok", "returned": returned}


@app.post("/invoices")
def create_invoice(payload: InvoiceCreateRequest, user: CurrentUser = Depends(get_current_user)):
    try:
        branch_name, branch_id = branch_context(payload.branch, user, default_admin_to_ho=True)
        if payload.branch_id is not None:
            requested_branch_id = int(payload.branch_id)
            with db.c() as conn:
                branch_name_row = conn.execute("SELECT name FROM points WHERE id=?", (requested_branch_id,)).fetchone()
            requested_branch_name = str(branch_name_row["name"] or "").strip() if branch_name_row else ""
            if requested_branch_name and requested_branch_name == branch_name:
                branch_id = requested_branch_id
            elif requested_branch_name and user.is_shop_manager and requested_branch_name != user.branch_name:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Shop managers can access only their own branch")
        line_payloads = build_invoice_lines(payload.lines, int(branch_id), payload.price_type)
        summary = invoice_summary(
            line_payloads,
            payload.discount_mode,
            payload.discount_value,
            payload.tds_mode,
            payload.tds_value,
            payload.paid_amount,
        )
        invoice_payload = {
            "invoice_no": db.next_invoice_number("H.O" if user.is_admin else branch_name),
            "invoice_prefix_key": "H.O" if user.is_admin else branch_name,
            "branch_id": int(branch_id),
            "customer_name": payload.customer_name.strip() or "Walk-in Customer",
            "customer_phone": payload.customer_phone.strip(),
            "address": payload.address.strip(),
            "created_at": billing_timestamp(payload.date),
            "price_type": payload.price_type.value,
            "taxable_amount": summary["taxable"],
            "cgst_amount": summary["cgst"],
            "sgst_amount": summary["sgst"],
            "subtotal": summary["subtotal"],
            "discount_percent": summary["discount_percent"],
            "discount_amount": summary["discount_amount"],
            "tds_percent": summary["tds_percent"],
            "tds_amount": summary["tds_amount"],
            "round_off": summary["round_off"],
            "total_amount": summary["grand_total"],
            "paid_amount": summary["paid_amount"],
            "due_amount": summary["due_amount"],
            "payment_mode": payload.payment_mode.strip() or "Cash",
            "note": payload.note.strip(),
        }
        saved = db.create_invoice(invoice_payload, line_payloads)
        return {"status": "ok", "saved": saved, "summary": summary, "branch": branch_name}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@app.patch("/invoices/{invoice_id}/branch")
def update_invoice_branch(
    invoice_id: int,
    payload: InvoiceBranchUpdateRequest,
    _user: CurrentUser = Depends(require_admin),
):
    branch_name = str(payload.branch or "").strip()
    if branch_name not in BRANCH_POINTS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select a valid branch")
    branch_id = branch_id_for_name(branch_name)
    with db.c() as conn:
        invoice = conn.execute(
            "SELECT id, invoice_no FROM invoices WHERE id=?",
            (int(invoice_id),),
        ).fetchone()
        if not invoice:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
        conn.execute(
            "UPDATE invoices SET branch_id=? WHERE id=?",
            (branch_id, int(invoice_id)),
        )
        head = conn.execute(
            """
            SELECT inv.*, p.name branch_name
            FROM invoices inv
            LEFT JOIN points p ON p.id=inv.branch_id
            WHERE inv.id=?
            """,
            (int(invoice_id),),
        ).fetchone()
    db.add_audit_log(
        "api_invoice_branch_update",
        "Admin",
        actor_name="Admin",
        branch_id=branch_id,
        status="Success",
        note=f"Invoice {invoice['invoice_no']} branch updated to {branch_name}",
    )
    return {"status": "ok", "invoice": dict(head) if head else None}


@app.get("/shop-managers")
def shop_managers(_user: CurrentUser = Depends(require_admin)):
    return {"count": len(db.list_shop_managers()), "items": db.list_shop_managers()}


@app.post("/shop-managers")
def upsert_shop_manager(payload: ShopManagerRequest, _user: CurrentUser = Depends(require_admin)):
    branch_id = branch_id_for_name(payload.branch)
    result = db.upsert_shop_manager(branch_id, payload.manager_name, payload.password)
    db.add_audit_log(
        "api_shop_manager",
        "Admin",
        actor_name="Admin",
        branch_id=branch_id,
        status="Success",
        note=f"Shop manager {result['action']}: {payload.manager_name}",
    )
    return {"status": "ok", "item": result}


@app.post("/shop-managers/{branch_name}/reset-password")
def reset_shop_manager_password(branch_name: str, payload: PasswordResetRequest, _user: CurrentUser = Depends(require_admin)):
    branch_id = branch_id_for_name(branch_name)
    result = db.reset_shop_manager_password(branch_id, payload.password)
    db.add_audit_log(
        "api_shop_manager_password_reset",
        "Admin",
        actor_name="Admin",
        branch_id=branch_id,
        status="Success",
        note=f"Password reset for {result['manager_name']}",
    )
    return {"status": "ok", "item": result}


@app.delete("/shop-managers/{branch_name}")
def delete_shop_manager(branch_name: str, _user: CurrentUser = Depends(require_admin)):
    branch_id = branch_id_for_name(branch_name)
    result = db.delete_shop_manager(branch_id)
    db.add_audit_log(
        "api_shop_manager_deleted",
        "Admin",
        actor_name="Admin",
        branch_id=branch_id,
        status="Success",
        note=f"Shop manager deleted: {result['manager_name']}",
    )
    return {"status": "ok", "deleted": result}


@app.get("/audit-logs")
def audit_logs(limit: int = Query(default=200, ge=1, le=1000), _user: CurrentUser = Depends(require_admin)):
    rows = db.recent_audit_logs(limit=limit)
    for row in rows:
        row["display_time"] = display_time(row.get("created_at"))
    return {"count": len(rows), "items": rows}


if __name__ == "__main__":
    uvicorn.run("backend_api:app", host="127.0.0.1", port=8000, reload=False)
