# Webapp File Guide

This document explains the main files and folders in the GOLDPRINCE webapp so you can quickly understand where things live and what each file does.

## Project Root

`C:\Users\bhara\OneDrive\Desktop\project 4`

This is the main project folder. It contains the web app, backend API, build files, logs, and helper scripts.

## Main Folders

### `app`

This is the Next.js App Router folder. Most webapp pages, API routes, and shared UI live here.

### `public`

Static files such as icons, logos, or images that can be served directly by the browser.

### `backup`

Backup files and exported copies of data.

### `data`

Local data storage used by the app, including the SQLite database in some setups.

## Main App Files

### `app/page.tsx`

This is the main webapp screen.

It contains:
- inventory tab
- stock movement tab
- sales load tab
- moves tab
- admin panel
- add/update inventory form
- search and filtering
- queue handling
- bulk stock load and upload actions

If you want to change the main dashboard behavior, this is the first file to check.

### `app/layout.tsx`

This is the root layout for the app.

It:
- loads global CSS
- defines the HTML structure
- sets page metadata

### `app/globals.css`

This file controls the full visual styling of the webapp.

It includes:
- layout sizing
- sidebar design
- form styling
- tables
- buttons
- mobile responsiveness
- premium theme colors

If the app looks broken or misaligned, this is a key file.

## Route Pages

### `app/inventory/page.tsx`

Redirects to the inventory tab inside the main page.

### `app/invoice/page.tsx`

Invoice-related page of the webapp.

### `app/art-number/[artNo]/page.tsx`

Art number details page.

It shows:
- item details
- stock movement rows
- admin change history
- PDF export
- Excel export

This page is now routed through the app backend proxy so it works both locally and through ngrok.

## API Routes

### `app/api/accounts/route.ts`

Handles account data for the app.

Used for:
- loading accounts
- saving accounts

### `app/api/bootstrap/route.ts`

Loads the initial session and data bundle for the frontend.

This is used to:
- get token
- get role
- get username
- get branch
- load inventory
- load overview totals
- load moves

### `app/api/backend/[...path]/route.ts`

This is a proxy route.

It forwards frontend requests to the backend server running on:
- `http://127.0.0.1:8000`

This proxy is important because it allows the browser and ngrok-hosted frontend to talk to the backend correctly.

## Components

### `app/components/AppLayout.tsx`

Main shared layout wrapper used by pages.

### `app/components/Header.tsx`

Header area of the app.

### `app/components/Sidebar.tsx`

Sidebar navigation buttons and labels.

### `app/components/SidebarShell.tsx`

Sidebar layout shell and related positioning.

### `app/components/LoginModule.tsx`

Login UI and login-related logic.

### `app/components/ErrorBoundary.tsx`

Catches rendering errors and shows a fallback instead of crashing the page.

### `app/components/FooterStatusBar.tsx`

Bottom status bar that shows current app status messages.

### `app/components/MobileLandscapeGuard.tsx`

Warns or handles mobile/landscape layout issues on small screens.

### `app/components/ContentContainer.tsx`

Shared container used to wrap page content.

### `app/components/invoice/InvoicePage.tsx`

Invoice page component used by the invoice route.

## Supporting Code

### `app/lib/BillingCalculation.ts`

Billing and amount calculation helpers.

Useful for:
- totals
- discounts
- price calculations
- invoice math

## Startup Scripts

### `start-webapp.ps1`

Starts the backend and frontend together.

### `start-webapp-ngrok.ps1`

Starts:
- backend
- frontend on port `3001`
- ngrok tunnel

### `start-webapp-ngrok.cmd`

Windows Command Prompt launcher for the PowerShell ngrok script.

### `start-frontend.cmd`

Starts the frontend only.

## Build and Config Files

### `package.json`

Lists dependencies and project scripts such as:
- `dev`
- `build`
- `start`

### `next.config.mjs`

Next.js configuration file.

It currently includes:
- allowed ngrok dev origins
- caching behavior
- build/runtime settings

### `tsconfig.json`

TypeScript configuration.

### `next-env.d.ts`

Next.js TypeScript type references.

## Database and Logs

### `stock.db`

Main local SQLite database used by the app in local mode.

### `stock.db.pre-restore.bak`

Backup copy of the database.

### `backend-start.err.log`, `dev.err.log`, `prod.err.log`, and similar files

These are runtime logs used for troubleshooting.

## Generated Files

### `.next`

Next.js build output and cache.

This folder is generated automatically and can be safely deleted when you need a clean rebuild.

### `__pycache__`

Python bytecode cache.

### `node_modules`

Installed npm packages.

## Quick “What to Edit” Guide

- Change main inventory UI: `app/page.tsx`
- Change page design: `app/globals.css`
- Change art number details: `app/art-number/[artNo]/page.tsx`
- Change API proxy behavior: `app/api/backend/[...path]/route.ts`
- Change startup behavior: `start-webapp.ps1` or `start-webapp-ngrok.ps1`
- Change login behavior: `app/components/LoginModule.tsx`

## Notes

- The app uses the frontend on port `3001`.
- The backend usually runs on port `8000`.
- Ngrok should point to the frontend on `3001`, not the backend.
- If the app shows strange 404/500 errors, a stale `.next` folder is often the cause.

