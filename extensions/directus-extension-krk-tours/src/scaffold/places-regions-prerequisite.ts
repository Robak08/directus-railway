import { readColumnDataType } from './column-introspection.js';
import type { ScaffoldLogger } from './types.js';

type KnexLike = {
	select: (columns: string | string[]) => {
		from: (table: string) => {
			where: (criteria: Record<string, string>) => {
				first: () => Promise<unknown>;
			};
		};
	};
};

export async function assertPlacesRegionsIdIsUuid(
	database: KnexLike,
	logger: ScaffoldLogger
): Promise<string | null> {
	const dataType = await readColumnDataType(database, 'places_regions', 'id');
	if (!dataType) {
		const message =
			'Could not read places_regions.id column type (information_schema); tours.regions M2M expects uuid';
		logger.warn(`[krk-tours] ${message}`);
		return null;
	}

	if (dataType !== 'uuid') {
		const message = `places_regions.id must be uuid for tours.regions M2M (found ${dataType})`;
		logger.error(`[krk-tours] ${message}`);
		return message;
	}

	return null;
}
