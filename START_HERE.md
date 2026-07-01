# Start Here

Use this as the first message in a new chat:

> We’re working on a stock management app with a Next.js frontend, a Python backend, and SQLite data. The main files are `app/page.tsx`, `app/api/bootstrap/route.ts`, `backend_api.py`, and `stock_core.py`. Keep Inventory, Sales Load, Stock Movement, Moves, and Art Number detail behavior aligned across local and deployed environments.

## Current Snapshot

- Frontend: Next.js app in `app/`
- Backend: Python API in `backend_api.py`
- Core logic: `stock_core.py`
- Database: `stock.db`
- Handoff notes: `TAB_NOTES.md`
- Detailed backup: `HANDOFF_BACKUP.md`

## Important Local Ports

- Frontend: `127.0.0.1:3001`
- Backend: `127.0.0.1:8002`

## What To Check First

1. Backend auth and bootstrap flow
2. Frontend backend URL
3. Database source alignment between local and deployed environments
4. Whether Sales Load and Inventory Upload are being mixed

