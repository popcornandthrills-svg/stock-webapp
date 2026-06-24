# GOLDPRINCE Stock Management System

Desktop stock management and billing application built with Tkinter and SQLite.

## Repo contents

- `desktop_app.py`: main application source
- `StockManagementDesktop.spec`: PyInstaller build file
- `requirements.txt`: runtime dependencies
- `.github/workflows/release.yml`: GitHub Releases automation

## Local build

```powershell
python -m pip install -r requirements.txt
python -m pip install pyinstaller
python -m PyInstaller StockManagementDesktop.spec --noconfirm
```

## FastAPI backend

Start the backend API locally with:

```powershell
set DATABASE_URL=postgresql://USER:PASSWORD@HOST.neon.tech/DBNAME?sslmode=require
python -m uvicorn backend_api:app --reload
```

If `DATABASE_URL` is not set, the backend falls back to `STOCK_DB_PATH` and uses SQLite.

Useful URLs after startup:

- `http://127.0.0.1:8000/docs`
- `http://127.0.0.1:8000/redoc`

## Web app start

To start both the web frontend and the backend together on Windows:

```powershell
.\start-webapp.ps1
```

This starts:

- frontend on `http://127.0.0.1:3001`
- backend on `http://127.0.0.1:8000`

If you expose the app with ngrok, point the tunnel at the frontend port `3001`.
Current live ngrok URL:

- `https://earpiece-relatable-dismount.ngrok-free.dev`

Recommended launch command:

```powershell
.\start-ngrok.ps1
```

To start the full stack and ngrok together:

```powershell
.\start-webapp-ngrok.ps1
```

Main API areas included:

- auth for admin and shop manager logins
- branches
- inventory and inventory overview
- stock transfers
- moves
- analytics
- invoices
- shop managers
- audit logs

## Vercel deployment

If you deploy the Next.js frontend to Vercel, set a backend URL environment variable in Vercel.

Recommended variables:

```text
BACKEND_URL=https://your-backend-host.example.com
NEXT_PUBLIC_BACKEND_URL=https://your-backend-host.example.com
NEXT_PUBLIC_API_BACKEND_URL=https://your-backend-host.example.com
```

Notes:

- `app/api/bootstrap/route.ts` uses the backend URL to fetch the first data bundle.
- `app/api/backend/[...path]/route.ts` proxies frontend requests to the backend.
- Do not point Vercel to `127.0.0.1:8000`; that only works on your own PC.
- Keep the backend on Railway, Render, or another Python host, then point the Vercel frontend to that hosted backend.
- For the first Vercel test, use a real hosted backend URL in the environment variables. If the backend is still local, the Vercel page will load but data calls will fail.

## Neon database

The backend can run against Neon/Postgres by setting:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST.neon.tech/DBNAME?sslmode=require
```

To migrate the current desktop SQLite data into Neon:

```powershell
set DATABASE_URL=postgresql://USER:PASSWORD@HOST.neon.tech/DBNAME?sslmode=require
python migrate_sqlite_to_postgres.py --sqlite-path stock.db
```

## Railway deployment

This backend is prepared for Railway deployment with Docker.

Suggested Railway variables:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST.neon.tech/DBNAME?sslmode=require
API_SECRET_KEY=change-this-to-a-long-random-secret
```

If you still want SQLite on Railway, keep using a volume and set:

```text
STOCK_DB_PATH=/data/stock.db
API_SECRET_KEY=change-this-to-a-long-random-secret
```

The backend only seeds `/data/stock.db` from the bundled local `stock.db` when `DATABASE_URL` is not set.

## GitHub Releases

Push a tag like `v1.0.0` to GitHub. The workflow will:

1. build the Windows executable
2. attach the `.exe` to a GitHub Release
3. attach a `.zip` package to the same release
