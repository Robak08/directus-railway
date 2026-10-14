/** Deterministic IDs for idempotent Krakow migration (non-secret). */
export const KRAKOW_DESTINATION_ID = 'a0000000-0000-4000-8000-000000000001';
export const KRAKOW_GUIDEBOOK_ID = 'a0000000-0000-4000-8000-000000000002';
export const KRAKOW_LIFETIME_OFFER_ID = 'a0000000-0000-4000-8000-000000000003';

export const KRAKOW_DESTINATION_SLUG = 'krakow';
export const KRAKOW_GUIDEBOOK_SLUG = 'krakow';
export const KRAKOW_LIFETIME_OFFER_SLUG = 'krakow-lifetime';

export const MIGRATION_LOCK_KEY = 'krk-guidebooks-v1';

export const MIGRATION_PHASES = [
	'preflight',
	'expand-schema',
	'seed-krakow',
	'backfill-content',
	'backfill-tips',
	'backfill-grants',
	'rebuild-access',
	'replace-permissions',
	'validate',
	'contract'
] as const;

export type MigrationPhase = (typeof MIGRATION_PHASES)[number];
