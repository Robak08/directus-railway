import { physicalTableExists } from './column-introspection.js';
import { collectionExists } from './relation-helpers.js';
import type { DatabaseLike, ScaffoldLogger } from './types.js';

/** Child-first: matches greenfield teardown in README. */
export const TOUR_EXTENSION_COLLECTIONS_TEARDOWN_ORDER = [
	'tour_steps_translations',
	'tours_translations',
	'tour_steps',
	'tours_places_regions',
	'tours'
] as const;

type CollectionsServiceLike = {
	deleteOne: (collection: string) => Promise<unknown>;
};

/**
 * After SQL DROP TABLE, Directus metadata can remain. Scaffold then skips create and fails on DB access.
 */
export async function removeOrphanedTourCollectionMetadata(
	database: DatabaseLike,
	collectionsService: CollectionsServiceLike,
	logger: ScaffoldLogger
): Promise<string[]> {
	const removed: string[] = [];

	for (const collection of TOUR_EXTENSION_COLLECTIONS_TEARDOWN_ORDER) {
		if (!(await collectionExists(database, collection))) {
			continue;
		}
		if (await physicalTableExists(database, collection)) {
			continue;
		}

		try {
			await collectionsService.deleteOne(collection);
			logger.info(
				`[krk-tours] Removed orphaned collection metadata (no physical table): ${collection}`
			);
			removed.push(collection);
		} catch (error: unknown) {
			const err = error as { message?: string };
			logger.warn(
				`[krk-tours] Could not remove orphaned metadata for ${collection}: ${err?.message ?? 'unknown'}`
			);
		}
	}

	return removed;
}
