# Deployment Notes

## Live URLs

- Frontend: `https://stock-webapp-rose.vercel.app`
- Backend: `https://stock-webapp-vs3h.onrender.com`

## Vercel Environment Variables

Set these in the Vercel project under Production:

- `BACKEND_URL=https://stock-webapp-vs3h.onrender.com`
- `NEXT_PUBLIC_BACKEND_URL=https://stock-webapp-vs3h.onrender.com`
- `NEXT_PUBLIC_API_BACKEND_URL=https://stock-webapp-vs3h.onrender.com`

## Git Branch

- Production branch: `master`

## Quick Checklist

1. Confirm Inventory loads rows.
2. Confirm Moves loads rows.
3. Open at least one Art Number details page.
4. Test search and branch filters.
5. Verify add/update actions still work.
6. Redeploy Vercel after any frontend env change.
7. Redeploy Render after any backend code change.

## Useful Links

- GitHub repo: `https://github.com/popcornandthrills-svg/stock-webapp`
- Vercel project: `https://vercel.com/popcornandthrills-8352s-projects/stock-webapp`
- Render service: `https://dashboard.render.com/web/srv-d8tsmi0js32c73c5m3ug`

