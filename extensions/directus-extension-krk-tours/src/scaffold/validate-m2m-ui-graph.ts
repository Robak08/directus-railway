import { fieldSpecialContainsM2m } from './reconcile-junction-field-meta.js';
import { collectionExists } from './relation-helpers.js';
import { TOURS_REGIONS_GHOST_COLLECTION, TOURS_REGIONS_JUNCTION } from './m2m-junction-constants.js';
import type { DatabaseLike, ScaffoldLogger } from './types.js';

type MetaKnex = DatabaseLike & {
	select: (columns: string | string[]) => {
		from: (table: string) => {
			where: (criteria: Record<string, string>) => {
				first: () => Promise<unknown>;
			};
		};
	};
};

/** Fails scaffold when FK relations exist but Studio graph is still wrong. */
export async function validateToursRegionsM2mUiGraph(
	database: DatabaseLike,
	logger: ScaffoldLogger
): Promise<string[]> {
	const errors: string[] = [];
	const knex = database as MetaKnex;

	if (await collectionExists(database, TOURS_REGIONS_GHOST_COLLECTION)) {
		const message = `Ghost nested junction collection still exists: ${TOURS_REGIONS_GHOST_COLLECTION}`;
		logger.error(`[krk-tours] ${message}`);
		errors.push(message);
	}

	const badRelation = (await knex
		.select('id')
		.from('directus_relations')
		.where({ one_collection: TOURS_REGIONS_JUNCTION, one_field: 'places_regions_id' })
		.first()) as { id?: number } | undefined;

	if (badRelation?.id != null) {
		const message =
			`Erroneous relation: one_collection=${TOURS_REGIONS_JUNCTION} one_field=places_regions_id ` +
			'(scalar junction FK must not be an M2M alias)';
		logger.error(`[krk-tours] ${message}`);
		errors.push(message);
	}

	const fieldRow = (await knex
		.select(['interface', 'special'])
		.from('directus_fields')
		.where({ collection: TOURS_REGIONS_JUNCTION, field: 'places_regions_id' })
		.first()) as { interface?: string | null; special?: unknown } | undefined;

	if (fieldRow) {
		if (fieldRow.interface === 'list-m2m' || fieldSpecialContainsM2m(fieldRow.special)) {
			const message =
				`tours_places_regions.places_regions_id has M2M field meta ` +
				`(interface=${fieldRow.interface ?? 'null'}); expected hidden scalar FK`;
			logger.error(`[krk-tours] ${message}`);
			errors.push(message);
		}
	}

	return errors;
}
