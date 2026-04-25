# SolarSizer Pro on Cloudflare

SolarSizer Pro is now structured for Cloudflare free-tier hosting:

- `Vite + React` for the SPA
- `Cloudflare Workers` for `/api/*`
- `Cloudflare D1` for shared catalog, hardware, and settings data

Profiles, saved results, and other end-user drafts still live in browser `localStorage`, which preserves the current product behavior while removing the old Render/Node runtime.

## Local development

Prerequisites:

- Node.js 20+
- A Cloudflare account with Wrangler authenticated

1. Install dependencies:
   `npm install`
2. Create a local Worker secret file named `.dev.vars`:
   `ADMIN_PASSWORD=your-password`
3. Create your D1 database, then update `database_id` in `wrangler.jsonc`.
4. Apply the schema locally:
   `npm run d1:migrate:local`
5. Start the Worker API:
   `npm run dev:worker`
6. Start the Vite client in a second terminal:
   `npm run dev`

The Vite dev server proxies `/api` requests to the local Worker on `http://127.0.0.1:8787`.

## Deploy

1. Apply remote migrations:
   `wrangler d1 migrations apply solar-sizer-sdk2`
2. Set the production admin secret:
   `wrangler secret put ADMIN_PASSWORD`
3. Build the SPA:
   `npm run build`
4. Deploy the Worker and static assets:
   `wrangler deploy`

On first request, the Worker bootstraps the shared D1 catalog with the seeded devices, products, and hardware inventory carried over from the previous server implementation.
