# directus-extension-krk-guidebooks

Directus 12 bundle for multi-guidebook gating (Branch B):

- Schema scaffold (`POST /krk-guidebooks/scaffold`)
- Migration phases (`POST /krk-guidebooks/migration/run`)
- Public calendar (`GET /krk-guidebooks/:slug/calendar`)
- Customer access (`GET /krk-guidebooks/me/access`)
- Entitlement-checked PDF metadata (`GET /krk-guidebooks/:slug/pdf`)

Operator CLI: `bun scripts/guidebook-migration.ts` from the backend repo root.

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
