import { describe, expect, it } from 'vitest';

import {
	ghostNestedJunctionName,
	TOURS_REGIONS_GHOST_COLLECTION
} from '../../src/scaffold/m2m-junction-constants.js';

describe('ghostNestedJunctionName', () => {
	it('builds tours_places_regions_places_regions from junction + related table', () => {
		expect(ghostNestedJunctionName('tours_places_regions', 'places_regions')).toBe(
			TOURS_REGIONS_GHOST_COLLECTION
		);
	});
});
