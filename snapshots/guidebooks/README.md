# Guidebooks schema snapshots

Export live Directus schema and permission rows before and after migration:

- `before-baseline.json` — pre-migration schema (from `directus schema snapshot`)
- `after-scaffold.json` — post `expand-schema` phase
- `permission-matrix.template.json` — review checklist (not a live export)

Live `directus_access` / `directus_permissions` must be exported separately; they are not included in standard schema snapshots.
