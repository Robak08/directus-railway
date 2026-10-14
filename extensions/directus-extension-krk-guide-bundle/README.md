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

Deploy the built `dist/` (including `api.js` and `app.js`) into Directus and restart the service. The bundle must not leave `@krk/guidebooks-core` as an external import — core lives under `src/core` and is inlined at build time.

After deploy:

1. Admin `POST /krk-guidebooks/scaffold` — reconciles guidebook schema **and** seeds customer policy rows (`customer_guidebook_access`, `guidebooks`, catalog junctions). Check the response `summary.permissionsCreated`.
2. Smoke (404 means the bundle API did not load):
   - `GET /krk-guidebooks` — not 404 (401/403/200 is fine)
   - `POST /krk-guide/guide-webhook` — not 404 (400 without a valid Stripe signature is fine)
   - `GET /krk-guidebooks/me/access` with a customer token — 200 or 403, not 404

Set `CUSTOMER_ROLE_ID` (or ensure the Customer role / places-read policy exists) so permission seed can attach rows. Commerce details: `PAYMENT_LINKS.md`.

Migration phases (`POST /krk-guidebooks/migration/run`) still include `replace-permissions`; scaffold and migration both call the same permission helper.
