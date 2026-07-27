# directus-extension-krk-tours

Directus bundle extension for **guided walking tours** (kierrokset) in Krakovan Opas CMS. It idempotently creates collections, relations, Studio field layouts, and permissions, and can seed sample tours linked to existing `places` and Krakow `places_regions`.

## Install

From this directory:

```bash
pnpm install
pnpm build
```

Restart Directus (or rely on `EXTENSIONS_AUTO_RELOAD` in local Docker). The extension is loaded from `krakovanopas-srv/extensions/` via the `./extensions` volume in `docker-compose.yml`.

On first boot, if the `tours` collection does not exist, the **scaffold hook** runs automatically after routes are registered.

## Admin endpoints

Requires an **admin** session or admin static token.

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/krk-tours/scaffold` | Re-run schema scaffold (repair / upgrades) |
| `POST` | `/krk-tours/seed` | Create 1–2 sample published tours (FI translations) |

Example:

```bash
curl -X POST "$PUBLIC_URL/krk-tours/scaffold" \
  -H "Authorization: Bearer <admin-token>"

curl -X POST "$PUBLIC_URL/krk-tours/seed" \
  -H "Authorization: Bearer <admin-token>"
```

## Collections

- `tours` — status, image, duration, M2M `regions`, O2M `steps`, translations
- `tours_translations` — `tours_id`, `languages_code`, `title`, `slug`, `description`
- `tour_steps` — `tour_id`, `place_id`, `sort`, optional step duration, translations
- `tour_steps_translations` — optional `note` per language
- `tours_places_regions` — junction to `places_regions`

Walking route geometry is **not** stored in Directus (computed in the app).

## Permissions

After scaffold, the extension attempts to:

1. Grant **read** on all tour collections to roles that already have **read** on `places` (or roles listed in `KRK_TOURS_APP_ROLE`, comma-separated names).
2. For `tours` only, read is limited to `status = published`.
3. Grant **CRUD** on tour collections to roles with **update** on `places` (or the role named in `KRK_TOURS_EDITOR_ROLE`).

If your instance uses Directus 12 policies-only RBAC, review permissions in Admin and adjust manually.

Optional environment variables (Directus `.env`):

```env
KRK_TOURS_APP_ROLE=Public,API
KRK_TOURS_EDITOR_ROLE=Editor
```

On **Directus 12** (policy-based access), permissions are copied to **policies** that already have `places` read/update (or policies linked to the roles above via `directus_access`).

## Seed behaviour

- Looks up `places_regions` by slug (`krakova`, `krakow`, …) or title containing “krak”.
- Uses the first N **published** `places` (sorted by id).
- Skips tours whose `tours_translations.slug` already exists for `fi-FI`.

## Verify app access

With the same static token the app uses for CMS reads:

```http
GET /items/tours?filter[status][_eq]=published&fields=*,translations.*,steps.*,steps.place_id.id,steps.place_id.coordinates,regions.*
```

Expect `200` and seeded data after `POST /krk-tours/seed`.

## Troubleshooting

### Translations: “relationship hasn’t been configured correctly”

Directus may auto-link `languages_code` to `languages.id` instead of **`languages.code`**. From v1.0.1+, run:

```bash
curl -X POST "$PUBLIC_URL/krk-tours/scaffold" -H "Authorization: Bearer <admin-token>"
```

Check `summary.relationsRepaired` (expect ≥ 2 on a typical broken DB). Full rollout steps: [docs/relation-repair-and-deploy.md](./docs/relation-repair-and-deploy.md).

### Regions: “relationship not configured properly” on `tours`

The **Regions** field is M2M via `tours_places_regions`. Greenfield installs (v1.0.2+) use **`places_regions_id` as uuid** (matching `places_regions.id`) and create **both** junction relations via `ensureOrRepairRelations`:

- `tours_places_regions.tours_id` → `tours` (`one_field: regions`)
- `tours_places_regions.places_regions_id` → `places_regions` (`junction_field: tours_id`)

Scaffold checks `places_regions.id` is `uuid` before creating the junction. If `summary.errors` mentions `tours.regions M2M junction incomplete`, inspect Data Model on `tours_places_regions` or re-run scaffold on a fresh DB.

**UI drift (v1.0.7+):** If scaffold is `ok` but Relations still look wrong, check for collection `tours_places_regions_places_regions` and `places_regions_id` with `list-m2m` interface. Re-run scaffold after upgrading, or use [docs/schema-introspection.sql](./docs/schema-introspection.sql). Errors like `Ghost nested junction collection still exists` mean manual cleanup is required.

**Existing DBs** created with integer `places_regions_id` or missing junction columns must be fixed manually (column type + M2O); re-scaffold will try to **create missing columns** and **recreate empty-table FK columns** as uuid before relations.

### Studio save: `tour_id: Value can't be null` on `tours`

When editing a tour with nested **Steps** and **Translations**, Directus Studio may send hidden parent FKs as `null` or use `steps: { create, update, delete }` instead of a flat array. From **v1.0.9+**, the `tours-items` hook normalizes nested `steps`, `translations`, and step-level `translations` on `tours.items.create` / `tours.items.update`, with a fallback on `tour_steps.items.*`. Scaffold reconciles hidden FK meta (`tour_id`, `tours_id`, `tour_steps_id`, `languages_code`) and sets translation UI to **`defaultLanguage: fi-FI`** with **`userLanguage: false`**. Re-run `POST /krk-tours/scaffold` after upgrade.

### Greenfield reset (optional)

Dropping collections alone does **not** fix saves without the extension version above. Use reset only to clear meta drift, then scaffold from a clean slate (**all tour content is lost** until seed):

1. Delete collections in Data Model (child first): `tour_steps_translations` → `tours_translations` → `tour_steps` → `tours_places_regions` → `tours`
2. Deploy extension **1.0.9+**
3. `POST /krk-tours/scaffold`
4. `POST /krk-tours/seed`

Do not drop `places`, `places_regions`, or `languages`.

Equivalent SQL (Postgres, extension tables only):

```sql
DROP TABLE IF EXISTS tour_steps_translations CASCADE;
DROP TABLE IF EXISTS tours_translations CASCADE;
DROP TABLE IF EXISTS tour_steps CASCADE;
DROP TABLE IF EXISTS tours_places_regions CASCADE;
DROP TABLE IF EXISTS tours CASCADE;
```

Then run scaffold and seed as above.

## Development

`pnpm test` runs Vitest unit tests for relation repair helpers.

```bash
pnpm dev
```

`directus-state.json` is generated from `src/scaffold/directus-state-data.ts` on `prebuild`.

## Related docs

- Backend plan: `krk-app/docs/plans/tours-kierrokset-backend.md` (folder name here: `directus-extension-krk-tours`).
