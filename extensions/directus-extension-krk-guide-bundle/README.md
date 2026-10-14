# directus-extension-krk-guide-bundle

Single Directus 12 bundle for Krakovan Opas product extensions:

- **Guidebooks** — schema, migration, `/krk-guidebooks/*` customer APIs
- **Commerce** — Stripe webhook (`/krk-guide`), checkout BFF (`/krk-stripe`)
- **Tours** — schema scaffold/seed (`/krk-tours`)
- **Email** — Finnish subjects for user invitation and password reset

Push, slugify, and WYSIWYG drawer remain separate extensions.

## Build

```bash
cd extensions/directus-extension-krk-guide-bundle
bun install
bun run build
```

After deploy, run `POST /krk-guidebooks/scaffold` (admin) when guidebook schema changes. See `README-guidebooks.md` and `PAYMENT_LINKS.md`.
