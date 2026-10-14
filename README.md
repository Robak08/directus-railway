# Krakovan opas DirectusCMS

Directus 12 backend for Krakovan Opas: content, commerce, guidebook entitlements, push, and tours.

## Extensions (high level)

| Extension | Role |
|-----------|------|
| `directus-extension-krk-guide-bundle` | Guidebooks schema/APIs, Stripe webhook + checkout, tours scaffold, Finnish email subjects |
| `directus-extension-push-notification` | Web push (third-party bundle) |
| `directus-extension-slugify-interface` | Slug field UI |
| `directus-extension-wysiwyg-source-drawer` | Wider WYSIWYG source drawer |

Shared commerce logic lives in `extensions/directus-extension-krk-guide-bundle/src/core` (formerly `@krk/guidebooks-core`).

## Commerce and fulfillment

- Webhook: `POST /krk-guide/guide-webhook` — see `extensions/directus-extension-krk-guide-bundle/PAYMENT_LINKS.md`.
- Checkout API: `POST /krk-stripe/checkout-session`, `GET /krk-stripe/checkout-session/:id/status`, `POST /krk-stripe/billing-portal`.
- Grants use idempotent `upsertGrant` + `rebuildAccessForUserGuidebook` from the bundle core module.
- Webhook ledger collection `stripe_webhook_events` tracks `processing` / `processed` / `failed` for safe retries.

## Operations

- Environment template: `.env.example` (`STRIPE_*`, `CHECKOUT_SERVICE_SECRET`, `KRK_GUIDE_PROVISION_USERS`, SES, MailerLite, CORS).
- After deploying the guide bundle: admin `POST /krk-guidebooks/scaffold` (schema + customer permission rows). See `extensions/directus-extension-krk-guide-bundle/README.md` for smoke checks (`/krk-guidebooks`, `/krk-guide/guide-webhook` must not return 404).
- Staging checklist: `docs/RELEASE_VERIFICATION.md`.
- Permissions smoke test: `node scripts/verify-guidebook-permissions.mjs`.

## Other notes

- **Slugify** interface plugin updated for Directus v12.
- **WYSIWYG source drawer** extension widens the code editor drawer (`directus-extension-wysiwyg-source-drawer`).
- **Push** bundle v0.6.1+ uses uuid FK scaffold for Directus 12 / Postgres.

Build the guide bundle: `cd extensions/directus-extension-krk-guide-bundle`, `bun install`, `bun run build`, then **commit `dist/`** before pushing to GitHub/Railway (Dockerfile copies the extension folder as-is).
