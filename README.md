# Krakovan opas DirectusCMS

Directus 12 backend for Krakovan Opas: content, commerce, guidebook entitlements, push, and tours.

## Extensions (high level)

| Extension | Role |
|-----------|------|
| `directus-extension-endpoint-krk-guide` | Stripe webhook, MailerLite, optional customer provisioning, grant fulfillment |
| `directus-extension-endpoint-krk-stripe` | Checkout session, status, billing portal (BFF auth via `CHECKOUT_SERVICE_SECRET`) |
| `directus-extension-krk-guidebooks` | Multi-guidebook schema, migration, customer access APIs, PDF gating |
| `krk-guidebooks-core` | Shared grant projection and checkout helpers |
| `directus-extension-krk-tours` | Tours schema and seed endpoints |
| Push / email hooks | See extension folders and `.env.example` |

## Commerce and fulfillment

- Webhook: `POST /krk-guide/guide-webhook` — see `extensions/directus-extension-endpoint-krk-guide/PAYMENT_LINKS.md`.
- Checkout API: `POST /krk-stripe/checkout/session`, `GET /krk-stripe/checkout/status`, `POST /krk-stripe/billing/portal`.
- Grants use idempotent `upsertGrant` + `rebuildAccessForUserGuidebook` from `@krk/guidebooks-core`.
- Webhook ledger collection `stripe_webhook_events` tracks `processing` / `processed` / `failed` for safe retries.

## Operations

- Environment template: `.env.example` (`STRIPE_*`, `CHECKOUT_SERVICE_SECRET`, `KRK_GUIDE_PROVISION_USERS`, SES, MailerLite, CORS).
- Staging checklist: `docs/RELEASE_VERIFICATION.md`.
- Permissions smoke test: `node scripts/verify-guidebook-permissions.mjs`.

## Other notes

- **Slugify** interface plugin updated for Directus v12.
- **WYSIWYG source drawer** extension widens the code editor drawer (`directus-extension-wysiwyg-source-drawer`).
- **Push** bundle v0.6.1+ uses uuid FK scaffold for Directus 12 / Postgres.

Build an extension: `cd extensions/<name>`, `bun install`, `bun run build`.
