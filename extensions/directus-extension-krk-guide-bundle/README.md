# directus-extension-krk-guide-bundle

Single Directus 12 bundle for Krakovan Opas product extensions:

- **Guidebooks** — schema, migration, `/krk-guidebooks/*` customer APIs
- **Commerce** — Stripe webhook (`/krk-guide`), checkout BFF (`/krk-stripe`)
- **Tours** — schema scaffold/seed (`/krk-tours`)
- **Email** — Finnish subjects for user invitation and password reset

Push, slugify, and WYSIWYG drawer remain separate extensions.

## Build and deploy

```bash
cd extensions/directus-extension-krk-guide-bundle
bun install
bun run build
```

### Railway / GitHub (production Dockerfile)

The repo **must include** `dist/api.js`, `dist/app.js`, and `dist/directus-state.json` in git. This folder only gitignores `node_modules` (same pattern as slugify/push). Running `bun run build` locally is not enough unless you commit the updated `dist/` before push — otherwise the Docker image copies `package.json` pointing at missing `dist/api.js` and **no** `/krk-guidebooks` routes mount.

Core logic is under `src/core` and is inlined at build time (no `@krk/guidebooks-core` npm package).

After Railway rebuild:

1. Admin `POST /krk-guidebooks/scaffold` — schema + customer permission rows. Response must not be `ROUTE_NOT_FOUND`; check `summary.permissionsCreated`.
2. Smoke (404 = bundle API not loaded):
   - `GET /krk-guidebooks` — not 404
   - `POST /krk-guide/guide-webhook` — not 404
   - `GET /krk-guidebooks/me/access` (customer token) — 200 or 403, not 404
   - `GET /krk-guidebooks/<guidebook-slug>/calendar` — not 404 (app `/kalenteri` 502s when this fails)

Set `CUSTOMER_ROLE_ID` (or Customer role / places-read policy) for permission seed. Commerce: `PAYMENT_LINKS.md`.

Migration `POST /krk-guidebooks/migration/run` phase `replace-permissions` uses the same permission helper as scaffold.
