import { collectionExists } from './relation-helpers.js';
import {
	TOURS_REGIONS_GHOST_COLLECTION,
	TOURS_REGIONS_JUNCTION,
	ghostNestedJunctionName
} from './m2m-junction-constants.js';
import type { DatabaseLike, ScaffoldLogger } from './types.js';

type CollectionsServiceLike = {
	deleteOne: (collection: string) => Promise<unknown>;
};

type KnexDatabase = DatabaseLike & {
	(table: string): {
		count: (column: string) => { first: () => Promise<unknown> };
	};
};

export const KNOWN_GHOST_NESTED_JUNCTIONS: ReadonlyArray<string> = [
	ghostNestedJunctionName(TOURS_REGIONS_JUNCTION, 'places_regions')
];

async function countTableRows(database: KnexDatabase, table: string): Promise<number> {
	const row = (await database(table).count('* as count').first()) as { count?: string | number } | undefined;
	const value = row?.count ?? 0;
	return typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
}

export type GhostJunctionCleanupResult = {
	removed: string[];
	skipped: string[];
	errors: string[];
};

/**
 * Removes auto-created nested junction collections (empty only) and bad relation rows
 * that set one_field on a scalar junction FK.
 */
export async function removeGhostNestedJunctions(
	database: DatabaseLike,
	collectionsService: CollectionsServiceLike,
	logger: ScaffoldLogger,
	ghostNames: ReadonlyArray<string> = KNOWN_GHOST_NESTED_JUNCTIONS
): Promise<GhostJunctionCleanupResult> {
	const knex = database as KnexDatabase;
	const result: GhostJunctionCleanupResult = { removed: [], skipped: [], errors: [] };

	// Wrong nested-M2M relation hijacking tours_places_regions.places_regions_id
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const relationsTable = (database as any)('directus_relations');
		const deleted = await relationsTable
			.where({ one_collection: TOURS_REGIONS_JUNCTION, one_field: 'places_regions_id' })
			.delete();
		if (typeof deleted === 'number' && deleted > 0) {
			result.removed.push(
				`directus_relations: one_collection=${TOURS_REGIONS_JUNCTION} one_field=places_regions_id (${deleted} row(s))`
			);
			logger.info(`[krk-tours] Removed ${deleted} erroneous nested-M2M relation row(s)`);
		}
	} catch (error: unknown) {
		const err = error as { message?: string };
		result.errors.push(`delete bad one_field relation: ${err?.message ?? 'unknown'}`);
	}

	for (const ghost of ghostNames) {
		if (!(await collectionExists(database, ghost))) {
			continue;
		}

		const rowCount = await countTableRows(knex, ghost);
		if (rowCount > 0) {
			result.errors.push(
				`${ghost} has ${rowCount} row(s); drop manually or migrate data before auto-removal`
			);
			continue;
		}

		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const relationsTable = (database as any)('directus_relations');
			await relationsTable.where({ many_collection: ghost }).delete();
			await relationsTable.where({ one_collection: ghost }).delete();
		} catch (error: unknown) {
			const err = error as { message?: string };
			result.errors.push(`${ghost} relations cleanup: ${err?.message ?? 'unknown'}`);
			continue;
		}

		try {
			await collectionsService.deleteOne(ghost);
			result.removed.push(ghost);
			logger.info(`[krk-tours] Removed ghost nested junction collection: ${ghost}`);
		} catch (error: unknown) {
			const err = error as { message?: string };
			result.errors.push(`${ghost} deleteOne: ${err?.message ?? 'unknown'}`);
		}
	}

	return result;
}

export { TOURS_REGIONS_GHOST_COLLECTION };
