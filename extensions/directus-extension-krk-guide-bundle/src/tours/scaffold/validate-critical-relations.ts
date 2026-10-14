import { relationExists } from './relation-helpers.js';
import type { DatabaseLike, ScaffoldLogger } from './types.js';

/** M2M `tours.regions` requires both junction relation rows. */
export const TOURS_REGIONS_JUNCTION_RELATIONS: ReadonlyArray<{
	collection: string;
	field: string;
}> = [
	{ collection: 'tours_places_regions', field: 'tours_id' },
	{ collection: 'tours_places_regions', field: 'places_regions_id' }
];

export async function validateToursRegionsJunctionRelations(
	database: DatabaseLike,
	logger: ScaffoldLogger
): Promise<string[]> {
	const missing: string[] = [];

	for (const { collection, field } of TOURS_REGIONS_JUNCTION_RELATIONS) {
		if (!(await relationExists(database, collection, field))) {
			missing.push(`${collection}.${field}`);
		}
	}

	if (missing.length > 0) {
		logger.error(
			`[krk-tours] Critical tours.regions M2M junction relations missing: ${missing.join(', ')}. ` +
				'Expected tours_id (one_field: regions) and places_regions_id → places_regions.id (uuid).'
		);
	}

	return missing;
}
