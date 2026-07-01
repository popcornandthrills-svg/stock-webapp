# Handoff Backup

Date: 2026-07-01

## Current State

- The workspace has active edits in frontend, backend, and database-related files.
- There are also a few new files for deployment and migration support.
- A local SQLite database file is present, along with `-shm` and `-wal` sidecar files.

## Files Changed

Tracked modifications:

- `README.md`
- `app/api/accounts/route.ts`
- `app/api/backend/[...path]/route.ts`
- `app/api/bootstrap/route.ts`
- `app/art-number/[artNo]/page.tsx`
- `app/components/Sidebar.tsx`
- `app/globals.css`
- `app/page.tsx`
- `backend_api.py`
- `stock.db`
- `stock_core.py`

New files:

- `Dockerfile`
- `TAB_NOTES.md`
- `migrate_stock_sqlite_to_neon.py`
- `public/local-bootstrap.json`
- `render.yaml`

Untracked database sidecars:

- `stock.db-shm`
- `stock.db-wal`

## What This Project Is

This is a stock management webapp with:

- a React/Next.js frontend in `app/`
- a Python backend in `backend_api.py`
- stock/business logic in `stock_core.py`
- SQLite data stored in `stock.db`

## Important App Flow

1. The sidebar selects the active tab.
2. `app/page.tsx` renders the matching tab content.
3. `app/api/bootstrap/route.ts` logs in to the backend and fetches initial data.
4. `backend_api.py` serves protected API routes.
5. `stock_core.py` handles inventory, movement, and balance logic.

## Tab Summary

- Inventory: master stock list and detail access.
- Sales Load: sales upload only.
- Stock Movement: branch transfers and queue processing.
- Moves: movement history and reporting.
- Admin Panel: user management.
- Art Number page: single-item detail view.

## Local Setup

- Frontend: `127.0.0.1:3001`
- Backend: `127.0.0.1:8002`
- Local frontend/backend communication is controlled by `.env.local`.

## Deployment Setup

- Frontend: Vercel
- Backend: Render
- Both environments should point to the same production database.

## Common Failure Points

- Missing backend auth token
- Wrong backend URL in the frontend
- Production backend pointed at a different database
- Sales Load mixed with Inventory Upload
- Stale frontend cache

## Best Restart Point

If you continue in a new chat, start with this short context:

> We are working on a stock management app with a Next.js frontend, a Python backend, and SQLite data. The main job is to keep Inventory, Sales Load, Stock Movement, Moves, and Art Number detail working cleanly across local and deployed environments. The key files are `app/page.tsx`, `app/api/bootstrap/route.ts`, `backend_api.py`, and `stock_core.py`.

