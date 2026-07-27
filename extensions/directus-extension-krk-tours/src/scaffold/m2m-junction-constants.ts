/** Nested junction Directus creates when a scalar FK is saved as list-m2m. */
export const TOURS_REGIONS_JUNCTION = 'tours_places_regions';

export const TOURS_REGIONS_GHOST_COLLECTION = `${TOURS_REGIONS_JUNCTION}_places_regions`;

export function ghostNestedJunctionName(junctionCollection: string, relatedTable: string): string {
	return `${junctionCollection}_${relatedTable}`;
}
