# Stock Webapp Notes

This file explains each tab in the app and how the parts connect together.

## Overall Flow

1. The sidebar chooses the active tab.
2. `app/page.tsx` renders the matching section for that tab.
3. On load, the frontend calls `app/api/bootstrap/route.ts`.
4. The bootstrap route logs in to the backend and fetches the main data:
   - inventory
   - inventory overview
   - moves
5. The backend reads from the database layer in `stock_core.py`.
6. The backend is exposed through `backend_api.py`.
7. Local development uses the local backend URL.
8. Vercel uses the deployed backend URL.

## How the Connection Works

- `Sidebar` sends the selected tab to the main page.
- `app/page.tsx` stores the active tab in state and shows only that section.
- `app/api/bootstrap/route.ts` is the bridge between frontend and backend.
- `backend_api.py` checks the bearer token before returning protected data.
- `stock_core.py` contains the actual inventory, stock movement, and balance logic.
- The same database content should be used by both local and deployed apps if the same database URL is configured.

## Tabs

### 1. Inventory

Purpose:
- Main stock screen.
- Shows the item list, stock totals, and item details.

What it does:
- Loads inventory rows.
- Shows SKU count, units, and wholesale value.
- Lets you search, sort, and select items.
- Opens art number detail pages.
- Supports add, update, and upload flows.

Logic:
- Frontend calls bootstrap and inventory APIs.
- The table is built from the `inventory` state in `app/page.tsx`.
- The summary cards use the overview data.
- When an art number is clicked, the app routes to `/art-number/[artNo]`.

Important connection:
- This tab is the main read view for stock records.
- If the inventory table is empty, the issue is usually in bootstrap, backend auth, or the database source.

### 2. Sales Load

Purpose:
- Bulk sales upload.
- Used for sales loading only, not inventory upload.

Expected file columns:
- `ART NO`
- `Item`
- `PRICE`
- `QTY`

What it does:
- Reads an Excel or file upload for sales.
- Previews uploaded rows.
- Sends the sales data to the backend for processing.

Logic:
- This tab should stay separate from Inventory upload.
- It should not use the inventory upload columns.
- It is for sales movement only.

Important connection:
- Sales load should update stock movement / sales history, not replace the inventory upload format.

### 3. Stock Movement

Purpose:
- Transfer stock between branches.
- Also handles bulk stock load into a pending queue.

What it does:
- Scans or enters an art number.
- Chooses source branch and destination branch.
- Adds quantity to a pending transfer queue.
- Lets the user review, remove, or transfer queued items.
- Supports bulk file loading for many art numbers.

Logic:
- Manual transfer creates one row at a time.
- Bulk stock load creates many queue rows from a file.
- The pending queue is then processed by the transfer action.

Important connection:
- This tab is separate from Sales Load.
- It is used for inter-branch stock transfers, not sales upload.

### 4. Moves

Purpose:
- Shows stock movement history.
- Used for tracking all transfers and related activity.

What it does:
- Lists transfer rows.
- Lets the user search by art number, date, or branch.
- Supports expanding grouped rows.
- Shows quantities, categories, and items.

Logic:
- The data comes from the backend moves endpoint.
- The frontend groups and filters rows for display.
- This is mostly a reporting tab.

Important connection:
- Moves is a read-only history view for what happened in stock movement and other stock activity.

### 5. Admin Panel

Purpose:
- Admin-only user management.

What it does:
- Create login users.
- Edit user role and branch.
- Reset passwords.
- Delete users.

Logic:
- Only the admin role can see this tab.
- The sidebar hides it for non-admin users.
- `app/page.tsx` renders it only when `role === "admin"`.

Important connection:
- This tab manages access control for the app.

## Art Number Details Page

Route:
- `/art-number/[artNo]`

Purpose:
- Shows one item in detail.
- Used when the user clicks an art number from inventory.

What it does:
- Loads the item by art number.
- Shows item metadata and stock details.
- Can print or export PDF/Excel.
- Can show history for that exact art number.

Logic:
- The page gets the art number from the URL.
- It reads bootstrap/local cache data.
- It then finds the matching item and renders the detail view.

Important connection:
- This page is the drill-down from Inventory.
- Inventory is the list, art-number page is the detail screen.

## Backend API Roles

### `app/api/bootstrap/route.ts`

- Logs into the backend.
- Fetches inventory, overview, and moves in one request flow.
- Returns one combined JSON payload to the frontend.

### `backend_api.py`

- Protects routes with bearer token auth.
- Exposes inventory, moves, overview, and item detail endpoints.
- Talks to the database layer.

### `stock_core.py`

- Contains the actual storage and stock logic.
- Reads items, balances, and movement records.
- Calculates branch quantities and totals.

## Local vs Deployed Setup

### Local

- Frontend runs on `127.0.0.1:3001`
- Backend runs on `127.0.0.1:8002`
- `.env.local` points frontend calls to the local backend.

### Deployed

- Vercel runs the frontend.
- Render runs the backend.
- The backend should point to the same production database.

## Why Data Can Look Missing

Common reasons:

1. Backend auth token is missing.
2. Frontend is pointing to the wrong backend URL.
3. Production backend is using a different database than local.
4. Inventory bootstrap succeeds but returns empty data from the wrong source.
5. Sales Load and Inventory Upload are being mixed.
6. The app cache still has old or empty data.

## Safe Mental Model

- Inventory = master stock list.
- Sales Load = upload sales file.
- Stock Movement = transfer stock / pending queue.
- Moves = movement history.
- Admin Panel = user management.
- Art Number Page = single item detail screen.

## Short Summary

If you want the app to match local and Vercel:

- Make sure both environments use the same database.
- Keep Sales Load separate from Inventory Upload.
- Keep Stock Movement separate from Sales Load.
- Use Inventory for the master list.
- Use Moves for history.
- Use Art Number page for one-item details.

