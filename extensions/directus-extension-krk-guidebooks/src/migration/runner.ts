import { createHash } from 'node:crypto';
import {
	KRAKOW_DESTINATION_ID,
	KRAKOW_GUIDEBOOK_ID,
	KRAKOW_LIFETIME_OFFER_ID,
	KRAKOW_DESTINATION_SLUG,
	KRAKOW_GUIDEBOOK_SLUG,
	KRAKOW_LIFETIME_OFFER_SLUG,
	MIGRATION_LOCK_KEY,
	MIGRATION_PHASES,
	type MigrationPhase
} from '@krk/guidebooks-core';
import { runScaffold } from '../scaffold/run-scaffold.js';
import { rebuildAccessForUser } from '../access/grant-service.js';
import type { ScaffoldLogger } from '../scaffold/types.js';
import { applyGuidebookPermissions } from '../scaffold/permissions.js';

export type MigrationContext = {
	services: Record<string, unknown>;
	database: {
		transaction: (fn: (trx: unknown) => Promise<void>) => Promise<void>;
		raw: (sql: string, bindings?: unknown[]) => Promise<unknown>;
		schema: { hasTable: (name: string) => Promise<boolean> };
	};
	getSchema: () => Promise<unknown>;
	logger: ScaffoldLogger;
};

const phaseChecksum = (phase: MigrationPhase): string =>
	createHash('sha256').update(`${MIGRATION_LOCK_KEY}:${phase}:v1`).digest('hex');

export async function getMigrationStatus(database: MigrationContext['database']) {
	const hasLedger = await database.schema.hasTable('guidebook_migration_ledger');
	if (!hasLedger) {
		return { phases: MIGRATION_PHASES, completed: [] as string[] };
	}

	const rows = (await database.raw(
		`SELECT phase, status, checksum FROM guidebook_migration_ledger WHERE status = 'completed' ORDER BY phase`
	)) as { rows?: { phase: string; status: string; checksum: string }[] };

	return {
		phases: MIGRATION_PHASES,
		completed: rows.rows?.map((row) => row.phase) ?? []
	};
}

async function recordPhase(
	database: MigrationContext['database'],
	phase: MigrationPhase,
	status: 'completed' | 'failed',
	result: Record<string, unknown>
) {
	const hasLedger = await database.schema.hasTable('guidebook_migration_ledger');
	if (!hasLedger) return;

	await database.raw(
		`INSERT INTO guidebook_migration_ledger (id, phase, checksum, status, result)
     VALUES (gen_random_uuid(), ?, ?, ?, ?::jsonb)
     ON CONFLICT DO NOTHING`,
		[phase, phaseChecksum(phase), status, JSON.stringify(result)]
	);
}

export async function runMigrationPhase(context: MigrationContext & { phase: MigrationPhase }) {
	const { phase } = context;
	const result: Record<string, unknown> = { phase };

	switch (phase) {
		case 'preflight': {
			result.guidebooksTable = await context.database.schema.hasTable('guidebooks');
			result.placesTable = await context.database.schema.hasTable('places');
			break;
		}
		case 'expand-schema': {
			const summary = await runScaffold(context as unknown as Parameters<typeof runScaffold>[0]);
			result.summary = summary;
			break;
		}
		case 'seed-krakow': {
			await context.database.raw(
				`INSERT INTO destinations (id, status, slug, title, timezone)
         VALUES (?, 'published', ?, 'Kraków', 'Europe/Warsaw')
         ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, timezone = EXCLUDED.timezone`,
				[KRAKOW_DESTINATION_ID, KRAKOW_DESTINATION_SLUG]
			);
			await context.database.raw(
				`INSERT INTO guidebooks (id, status, slug, destination_id, title, daisy_theme)
         VALUES (?, 'published', ?, ?, 'Krakovan opas', 'krk')
         ON CONFLICT (slug) DO UPDATE SET destination_id = EXCLUDED.destination_id, title = EXCLUDED.title`,
				[KRAKOW_GUIDEBOOK_ID, KRAKOW_GUIDEBOOK_SLUG, KRAKOW_DESTINATION_ID]
			);
			const stripePrice = process.env.STRIPE_GUIDEBOOK_PRICE_ID ?? null;
			await context.database.raw(
				`INSERT INTO guidebook_offers (id, status, guidebook_id, slug, capabilities, access_kind, stripe_price_id, stripe_mode)
         VALUES (?, 'active', ?, ?, '["catalog","pdf"]'::jsonb, 'lifetime', ?, 'payment')
         ON CONFLICT (slug) DO UPDATE SET stripe_price_id = EXCLUDED.stripe_price_id`,
				[KRAKOW_LIFETIME_OFFER_ID, KRAKOW_GUIDEBOOK_ID, KRAKOW_LIFETIME_OFFER_SLUG, stripePrice]
			);
			break;
		}
		case 'backfill-content': {
			await context.database.raw(
				`UPDATE places SET destination_id = ? WHERE destination_id IS NULL`,
				[KRAKOW_DESTINATION_ID]
			);
			await context.database.raw(
				`UPDATE events SET destination_id = ? WHERE destination_id IS NULL`,
				[KRAKOW_DESTINATION_ID]
			);
			await context.database.raw(
				`UPDATE tours SET destination_id = ? WHERE destination_id IS NULL`,
				[KRAKOW_DESTINATION_ID]
			);
			await context.database.raw(
				`UPDATE places_regions SET destination_id = ? WHERE destination_id IS NULL`,
				[KRAKOW_DESTINATION_ID]
			);
			await context.database.raw(
				`INSERT INTO guidebooks_places (id, guidebook_id, places_id)
         SELECT gen_random_uuid(), ?, p.id FROM places p
         ON CONFLICT DO NOTHING`,
				[KRAKOW_GUIDEBOOK_ID]
			);
			await context.database.raw(
				`INSERT INTO guidebooks_events (id, guidebook_id, events_id)
         SELECT gen_random_uuid(), ?, e.id FROM events e
         ON CONFLICT DO NOTHING`,
				[KRAKOW_GUIDEBOOK_ID]
			);
			await context.database.raw(
				`INSERT INTO guidebooks_tours (id, guidebook_id, tours_id)
         SELECT gen_random_uuid(), ?, t.id FROM tours t
         ON CONFLICT DO NOTHING`,
				[KRAKOW_GUIDEBOOK_ID]
			);
			break;
		}
		case 'backfill-tips': {
			await context.database.raw(
				`UPDATE tips SET audience_scope = 'selected_guidebooks' WHERE audience_scope IS NULL`
			);
			await context.database.raw(
				`INSERT INTO tips_guidebooks (id, tips_id, guidebooks_id)
         SELECT gen_random_uuid(), t.id, ?
         FROM tips t
         WHERE t.audience_scope = 'selected_guidebooks'
         ON CONFLICT DO NOTHING`,
				[KRAKOW_GUIDEBOOK_ID]
			);
			break;
		}
		case 'backfill-grants': {
			await context.database.raw(
				`INSERT INTO customer_guidebook_grants (
           id, user_id, guidebook_id, capabilities, status, source_type, source_id, valid_from, valid_until
         )
         SELECT
           gen_random_uuid(),
           cp.user_id,
           ?,
           '["catalog","pdf"]'::jsonb,
           'active',
           'migration',
           'customer_profile:' || cp.id::text,
           now(),
           NULL
         FROM customer_profiles cp
         WHERE cp.user_id IS NOT NULL
           AND cp.customer_type IN ('one_time_buyer', 'all_access', 'subscriber')
         ON CONFLICT DO NOTHING`,
				[KRAKOW_GUIDEBOOK_ID]
			);
			break;
		}
		case 'rebuild-access': {
			const users = (await context.database.raw(
				`SELECT DISTINCT user_id FROM customer_guidebook_grants WHERE user_id IS NOT NULL`
			)) as { rows?: { user_id: string }[] };
			let rebuilt = 0;
			for (const row of users.rows ?? []) {
				await rebuildAccessForUser({
					services: context.services as Parameters<typeof rebuildAccessForUser>[0]['services'],
					getSchema: context.getSchema,
					userId: row.user_id
				});
				rebuilt++;
			}
			result.rebuiltUsers = rebuilt;
			break;
		}
		case 'replace-permissions': {
			const created = await applyGuidebookPermissions({
				database: context.database,
				logger: context.logger
			});
			result.permissionsCreated = created;
			break;
		}
		case 'validate': {
			result.guidebookCount = (
				await context.database.raw(`SELECT COUNT(*)::int AS count FROM guidebooks`)
			);
			break;
		}
		case 'contract': {
			result.note = 'Contract phase requires explicit operator confirmation after frontend cutover';
			break;
		}
		default:
			throw new Error(`Unknown phase: ${phase satisfies never}`);
	}

	await recordPhase(context.database, phase, 'completed', result);
	return { ok: true, ...result };
}

export async function runMigrationThrough(
	context: MigrationContext & { through: MigrationPhase }
) {
	const endIndex = MIGRATION_PHASES.indexOf(context.through);
	if (endIndex < 0) {
		throw new Error(`Unknown through phase: ${context.through}`);
	}

	const results = [];
	for (const phase of MIGRATION_PHASES.slice(0, endIndex + 1)) {
		results.push(await runMigrationPhase({ ...context, phase }));
	}
	return { ok: true, results };
}
