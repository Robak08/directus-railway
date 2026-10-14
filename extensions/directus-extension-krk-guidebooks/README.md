# directus-extension-krk-guidebooks

Directus 12 bundle for multi-guidebook gating (Branch B):

- Schema scaffold (`POST /krk-guidebooks/scaffold`)
- Migration phases (`POST /krk-guidebooks/migration/run`)
- Public calendar (`GET /krk-guidebooks/:slug/calendar`)
- Customer access (`GET /krk-guidebooks/me/access`)
- Entitlement-checked PDF metadata (`GET /krk-guidebooks/:slug/pdf`)

Grants and access projection helpers live in `@krk/guidebooks-core` (`upsertGrant`, `rebuildAccessForUserGuidebook`). Stripe checkout fulfillment is handled by the `krk-guide` webhook extension, not this bundle.

Operator CLI: `bun scripts/guidebook-migration.ts` from the backend repo root.

After deploying extension changes, run `POST /krk-guidebooks/scaffold` (admin token) so new fields and customer junction read permissions (`guidebooks_places`, etc.) are applied. Without junction read, filtered `GET /items/places` returns 403 for customers.

Shared types/projection logic: `@krk/guidebooks-core`.

Build:

```powershell
cd extensions/directus-extension-krk-guidebooks
bun install
bun run build
```

Tests:

```powershell
bun test
```
