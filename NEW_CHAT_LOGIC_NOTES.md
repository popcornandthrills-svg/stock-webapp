# New Chat Logic Notes

Use this file to restart work in a fresh chat without re-discovering the app from scratch.

## One-Line Project Summary

This is a stock management and billing web app with a Next.js frontend, a FastAPI backend, and a shared stock database.

## Main Files

- `app/page.tsx`: main frontend app shell and most UI/business logic
- `app/api/bootstrap/route.ts`: frontend bootstrap bridge to backend or local snapshot
- `app/api/accounts/route.ts`: local account storage for login/admin flows
- `app/api/backend/[...path]/route.ts`: proxy from frontend to backend API
- `app/art-number/[artNo]/page.tsx`: dedicated art-number detail page
- `app/components/Sidebar.tsx`: tab navigation and role-based menu
- `backend_api.py`: FastAPI API layer, auth, routes, admin, billing, inventory, transfers
- `stock_core.py`: database and core stock/billing logic

## Overall Flow

1. The user logs in.
2. The frontend stores token, role, username, and branch in browser storage.
3. The frontend loads bootstrap data from `/api/bootstrap`.
4. The bootstrap route either:
   - logs in to the backend and fetches live inventory, overview, and moves, or
   - falls back to `public/local-bootstrap.json` when the backend is unavailable.
5. The frontend renders the active tab in `app/page.tsx`.
6. Most reads and writes go through `backend_api.py`.
7. `stock_core.py` performs the actual database work.

## Frontend Logic Map

### `app/page.tsx`

This is the big controller for the UI.

It owns:

- auth state
- active tab state
- inventory table state
- inventory upload state
- stock movement state
- moves/history state
- admin account state
- barcode and detail popup state
- browser cache and session storage sync

Important behaviors:

- Reads bootstrap data on load.
- Restores data from local/session storage when allowed.
- Supports tab routing via the `tab` query parameter.
- Handles login/logout.
- Handles inventory add/update/delete.
- Handles stock transfer and bulk stock load.
- Handles sales load parsing.
- Handles exports to Excel and PDF.
- Handles barcode label creation and printing.
- Handles art-number drill-down.

### `app/components/Sidebar.tsx`

This renders the left navigation.

Rules:

- Tabs are role-aware.
- `admin-panel` is hidden unless the user is admin.
- Mobile menu closes on outside click.
- Navigation updates the active tab through the parent callback.

### `app/art-number/[artNo]/page.tsx`

This page is the item detail view for one art number.

It is used when the user clicks an art number from inventory.

Typical responsibilities:

- show item metadata
- show branch quantities
- show item movement history
- support print/export style actions

### `app/api/bootstrap/route.ts`

This route is the bridge between frontend and backend startup data.

It does:

- backend login with admin credentials in non-local fallback flow
- fetches inventory, inventory overview, and moves
- returns one combined JSON payload
- falls back to `public/local-bootstrap.json` if backend access fails

Important detail:

- This route is why the app can still start even if the live backend is temporarily unavailable.

### `app/api/accounts/route.ts`

This stores local account records for the frontend login/admin experience.

It is part of the browser-side auth support, not the main backend auth system.

## Backend Logic Map

### `backend_api.py`

This is the FastAPI layer and route controller.

It handles:

- token auth
- current user resolution
- role-based access control
- inventory endpoints
- stock transfer endpoints
- bulk load endpoints
- moves endpoints
- analytics endpoints
- billing and invoice endpoints
- shop manager CRUD
- audit logs

### Auth Flow

- `LoginRequest` and `LoginResponse` define auth payloads.
- `issue_token()` creates signed tokens.
- `decode_token()` reads them back.
- `get_current_user()` protects routes with bearer auth.
- `require_admin()` blocks non-admins from admin-only operations.

### Branch Logic

- `branch_context()` decides which branch the current user can see or act on.
- Admins can often see all branches.
- Shop managers are restricted to their own branch.
- Some routes default admins to `H.O`.

### Inventory Endpoints

- `GET /inventory`
- `GET /inventory/artnos`
- `GET /inventory/overview`
- `GET /inventory/item-by-art/{art_no}`
- `GET /inventory/item-form-by-art/{art_no}`
- `GET /inventory/item-history/{art_no}`
- `POST /inventory/items`
- `DELETE /inventory/items/{item_id}`

Core rules:

- inventory rows are filtered by search and branch visibility
- low-stock filtering is supported
- item-by-art can enrich a row from moves if needed
- staff can only add stock in approved cases
- admin/staff can create or update inventory items

### Stock Movement Endpoints

- `GET /stock/lookup/{lookup}`
- `POST /stock/transfer`
- `POST /stock/bulk-load`
- `GET /moves`

Rules:

- transfers are admin-only
- bulk load is admin-only
- `GET /moves` excludes sale-related move types from the history list
- art-number filtering is supported on move history

### Billing / Invoice Endpoints

- `GET /billing/next-invoice-number`
- `GET /billing/item-lookup`
- `GET /invoices`
- `GET /invoices/{invoice_id}`
- `POST /invoices`
- `POST /invoices/{invoice_id}/return`
- `PATCH /invoices/{invoice_id}/branch`

Rules:

- invoice numbering is branch-aware
- invoice creation runs through line building and invoice summary calculation
- shop managers can only access their own branch invoices
- admin can change invoice branch

### Admin Endpoints

- `GET /shop-managers`
- `POST /shop-managers`
- `POST /shop-managers/{branch_name}/reset-password`
- `DELETE /shop-managers/{branch_name}`
- `GET /audit-logs`

Rules:

- admin only
- each action records an audit log

## Core Database Logic

### `stock_core.py`

This file contains the low-level data model and business logic.

It likely owns:

- DB connection/session abstraction
- inventory reads
- movement writes
- invoice creation
- invoice return handling
- branch quantity calculations
- audit log writes
- date/time formatting helpers
- money and pricing helpers

Key helper functions visible in the file:

- `configure_tk_environment()`
- `now_iso()`
- `parse_scan_code()`
- `decode_price()`
- `normalize_key()`
- `money()`
- `effective_due_amount()`
- `invoice_is_returned()`
- `invoice_returned_total()`
- `invoice_effective_amounts()`
- `next_return_number()`
- `display_time()`
- `invoice_branch_prefix()`
- `is_postgres_target()`

Database wrapper classes:

- `DBSession`
- `DB`

## Data Model Mental Model

Think about the app like this:

- Inventory = master stock list
- Stock movement = transfer or load between branches
- Moves = history/reporting feed
- Sales load = sales upload flow
- Invoice system = billing + customer sale records
- Admin panel = user and shop-manager management

## Important UI State

The main page tracks a lot of state, but the important buckets are:

- login and user identity
- inventory table and filters
- item detail and barcode state
- movement form and pending transfer queue
- bulk stock upload preview
- moves filters and sort order
- admin account editor
- popups, timers, and notifications

## Common Failure Points

If something looks wrong, check these first:

1. Backend URL mismatch.
2. Missing or invalid auth token.
3. Bootstrap fell back to local snapshot data.
4. Frontend browser cache is hiding fresh backend data.
5. The selected branch is hiding rows that exist elsewhere.
6. Sales load and inventory upload got mixed together.
7. The database used locally is different from the deployed one.

## What To Tell the Next Chat

Paste this at the top of a fresh chat:

> We are working on a stock management and billing app. The frontend logic is mostly in `app/page.tsx`, navigation is in `app/components/Sidebar.tsx`, bootstrap is in `app/api/bootstrap/route.ts`, the backend is `backend_api.py`, and the database/business logic is in `stock_core.py`. I need help understanding or changing the logic while keeping inventory, stock movement, moves, billing, and admin flows consistent.

## Best Files To Read Next

If you need to continue debugging, start with:

- `app/page.tsx`
- `app/api/bootstrap/route.ts`
- `backend_api.py`
- `stock_core.py`
- `app/art-number/[artNo]/page.tsx`

