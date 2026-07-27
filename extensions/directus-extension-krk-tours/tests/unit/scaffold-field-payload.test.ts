import { describe, expect, it } from 'vitest';

import { schemaForFieldCreate } from '../../src/scaffold/scaffold-field-payload.js';
import type { DirectusStateField } from '../../src/scaffold/types.js';

const junctionFkField: DirectusStateField = {
	collection: 'tours_places_regions',
	field: 'places_regions_id',
	type: 'uuid',
	schema: {
		name: 'places_regions_id',
		table: 'tours_places_regions',
		data_type: 'uuid',
		foreign_key_table: 'places_regions',
		foreign_key_column: 'id'
	},
	meta: { hidden: true }
};

describe('schemaForFieldCreate', () => {
	it('strips foreign_key hints for tours_places_regions junction FK fields', () => {
		const schema = schemaForFieldCreate('tours_places_regions', junctionFkField);
		expect(schema).toMatchObject({
			name: 'places_regions_id',
			data_type: 'uuid'
		});
		expect(schema).not.toHaveProperty('foreign_key_table');
		expect(schema).not.toHaveProperty('foreign_key_column');
	});

	it('keeps foreign_key hints for other collections', () => {
		const field: DirectusStateField = {
			collection: 'tour_steps',
			field: 'place_id',
			type: 'uuid',
			schema: {
				foreign_key_table: 'places',
				foreign_key_column: 'id'
			}
		};
		const schema = schemaForFieldCreate('tour_steps', field);
		expect(schema).toMatchObject({
			foreign_key_table: 'places',
			foreign_key_column: 'id'
		});
	});
});
