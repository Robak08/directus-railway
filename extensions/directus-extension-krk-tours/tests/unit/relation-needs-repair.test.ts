import { describe, expect, it } from 'vitest';

import { relationNeedsRepair } from '../../src/scaffold/relation-helpers.js';
import type { DirectusStateRelation, RelationSnapshot } from '../../src/scaffold/types.js';

const languagesCodeDesired: DirectusStateRelation = {
	collection: 'tours_translations',
	field: 'languages_code',
	related_collection: 'languages',
	schema: {
		table: 'tours_translations',
		column: 'languages_code',
		foreign_key_table: 'languages',
		foreign_key_column: 'code',
		on_update: 'NO ACTION',
		on_delete: 'CASCADE'
	},
	meta: {
		many_collection: 'tours_translations',
		many_field: 'languages_code',
		one_collection: 'languages',
		one_field: null,
		junction_field: 'tours_id'
	}
};

const toursIdDesired: DirectusStateRelation = {
	collection: 'tours_translations',
	field: 'tours_id',
	related_collection: 'tours',
	schema: {
		foreign_key_table: 'tours',
		foreign_key_column: 'id'
	},
	meta: {
		one_field: 'translations',
		junction_field: 'languages_code'
	}
};

describe('relationNeedsRepair', () => {
	it('returns false when existing matches desired languages_code relation', () => {
		const existing: RelationSnapshot = {
			related_collection: 'languages',
			foreign_key_table: 'languages',
			foreign_key_column: 'code',
			junction_field: 'tours_id',
			one_field: null,
			one_deselect_action: null
		};
		expect(relationNeedsRepair(existing, languagesCodeDesired)).toBe(false);
	});

	it('returns true when foreign_key_column points at id instead of code', () => {
		const existing: RelationSnapshot = {
			related_collection: 'languages',
			foreign_key_table: 'languages',
			foreign_key_column: 'id',
			junction_field: 'tours_id',
			one_field: null,
			one_deselect_action: null
		};
		expect(relationNeedsRepair(existing, languagesCodeDesired)).toBe(true);
	});

	it('returns true when related_collection is wrong', () => {
		const existing: RelationSnapshot = {
			related_collection: 'directus_users',
			foreign_key_table: 'languages',
			foreign_key_column: 'code',
			junction_field: 'tours_id',
			one_field: null,
			one_deselect_action: null
		};
		expect(relationNeedsRepair(existing, languagesCodeDesired)).toBe(true);
	});

	it('returns true when junction_field drifts on translation parent FK', () => {
		const existing: RelationSnapshot = {
			related_collection: 'tours',
			foreign_key_table: 'tours',
			foreign_key_column: 'id',
			junction_field: null,
			one_field: 'translations',
			one_deselect_action: null
		};
		expect(relationNeedsRepair(existing, toursIdDesired)).toBe(true);
	});

	it('returns false when tours_id junction meta matches', () => {
		const existing: RelationSnapshot = {
			related_collection: 'tours',
			foreign_key_table: 'tours',
			foreign_key_column: 'id',
			junction_field: 'languages_code',
			one_field: 'translations',
			one_deselect_action: null
		};
		expect(relationNeedsRepair(existing, toursIdDesired)).toBe(false);
	});

	const placesRegionsIdDesired: DirectusStateRelation = {
		collection: 'tours_places_regions',
		field: 'places_regions_id',
		related_collection: 'places_regions',
		schema: {
			foreign_key_table: 'places_regions',
			foreign_key_column: 'id'
		},
		meta: {
			junction_field: 'tours_id',
			one_field: null
		}
	};

	it('returns false when places_regions_id M2M leg matches', () => {
		const existing: RelationSnapshot = {
			related_collection: 'places_regions',
			foreign_key_table: 'places_regions',
			foreign_key_column: 'id',
			junction_field: 'tours_id',
			one_field: null,
			one_deselect_action: null
		};
		expect(relationNeedsRepair(existing, placesRegionsIdDesired)).toBe(false);
	});

	it('returns true when places_regions_id junction_field is missing', () => {
		const existing: RelationSnapshot = {
			related_collection: 'places_regions',
			foreign_key_table: 'places_regions',
			foreign_key_column: 'id',
			junction_field: null,
			one_field: null,
			one_deselect_action: null
		};
		expect(relationNeedsRepair(existing, placesRegionsIdDesired)).toBe(true);
	});

	it('returns true when tour_steps O2M deselect action is not delete', () => {
		const desired: DirectusStateRelation = {
			collection: 'tour_steps',
			field: 'tour_id',
			related_collection: 'tours',
			meta: {
				one_field: 'steps',
				one_deselect_action: 'delete'
			}
		};
		const existing: RelationSnapshot = {
			related_collection: 'tours',
			foreign_key_table: 'tours',
			foreign_key_column: 'id',
			junction_field: null,
			one_field: 'steps',
			one_deselect_action: 'nullify'
		};
		expect(relationNeedsRepair(existing, desired)).toBe(true);
	});
});
