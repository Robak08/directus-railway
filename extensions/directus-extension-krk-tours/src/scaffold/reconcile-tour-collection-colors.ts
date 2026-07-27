import { TOUR_COLLECTION_COLOR, directusState } from './directus-state-data.js';
import { collectionExists } from './relation-helpers.js';
import type { DatabaseLike, ScaffoldLogger } from './types.js';

type CollectionsServiceLike = {
	updateOne: (collection: string, data: Record<string, unknown>) => Promise<unknown>;
};

type MetaKnex = {
	select: (columns: string | string[]) => {
		from: (table: string) => {
			where: (criteria: Record<string, string>) => {
				first: () => Promise<unknown>;
			};
		};
	};
};

export async function reconcileTourCollectionColors(
	database: DatabaseLike,
	collectionsService: CollectionsServiceLike,
	logger: ScaffoldLogger
): Promise<string[]> {
	const knex = database as MetaKnex;
	const repaired: string[] = [];

	for (const { collection, meta } of directusState.collections) {
		if (!(await collectionExists(database, collection))) {
			continue;
		}

		const wantColor = (meta.color as string | undefined) ?? TOUR_COLLECTION_COLOR;
		const row = (await knex
			.select('color')
			.from('directus_collections')
			.where({ collection })
			.first()) as { color?: string | null } | undefined;

		if ((row?.color ?? null) === wantColor) {
			continue;
		}

		try {
			await collectionsService.updateOne(collection, {
				meta: {
					color: wantColor
				}
			});
			logger.info(`[krk-tours] Set collection color ${wantColor} on ${collection}`);
			repaired.push(collection);
		} catch (error: unknown) {
			const err = error as { message?: string };
			logger.warn(
				`[krk-tours] Could not set color on ${collection}: ${err?.message ?? 'unknown'}`
			);
		}
	}

	return repaired;
}
