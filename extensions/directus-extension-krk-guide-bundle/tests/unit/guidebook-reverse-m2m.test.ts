import { describe, expect, it } from 'vitest';

import { directusState } from '../../src/guidebooks/scaffold/directus-state-data.js';
import { relationNeedsRepair } from '../../src/guidebooks/scaffold/relation-helpers.js';
import type { RelationSnapshot } from '../../src/guidebooks/scaffold/types.js';

describe('guidebook content reverse M2M aliases', () => {
	it('declares places.guidebooks alias for Directus admin assignment (catalog scopes destination_id)', () => {
		const field = directusState.fields.find(
			(f) => f.collection === 'places' && f.field === 'guidebooks'
		);
		expect(field?.type).toBe('alias');
		expect(field?.meta?.special).toContain('m2m');
	});

	it('sets one_field guidebooks on guidebooks_places.places_id so scaffold repairs existing DBs', () => {
		const relation = directusState.relations.find(
			(r) => r.collection === 'guidebooks_places' && r.field === 'places_id'
		);
		expect(relation?.meta?.one_field).toBe('guidebooks');

		const snapshot: RelationSnapshot = {
			one_collection: 'places',
			junction_field: 'guidebook_id',
			one_field: null,
			one_deselect_action: null
		};
		expect(relationNeedsRepair(snapshot, relation!)).toBe(true);
	});
});
