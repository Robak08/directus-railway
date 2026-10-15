import { describe, expect, it } from 'vitest';
import {
	hydrateEventsWithCategories,
	PUBLIC_EVENT_FIELDS,
	type EventCategoryRow
} from '../../src/guidebooks/endpoint/calendar.js';

const sampleCategories: EventCategoryRow[] = [
	{
		id: 'cat-1',
		title: 'Music',
		slug: 'music',
		color: '#ff0000'
	},
	{
		id: 'cat-2',
		title: 'Food',
		slug: 'food',
		color: null
	}
];

describe('PUBLIC_EVENT_FIELDS', () => {
	it('uses string paths so ItemsService can parse relational category fields', () => {
		expect(PUBLIC_EVENT_FIELDS.every((field) => typeof field === 'string')).toBe(true);
		expect(PUBLIC_EVENT_FIELDS).toEqual(
			expect.arrayContaining([
				'category.id',
				'category.title',
				'category.slug',
				'category.color'
			])
		);
	});
});

describe('hydrateEventsWithCategories', () => {
	it('replaces category UUID with the matching eventCategories row', () => {
		const events = [{ id: 'ev-1', title: 'Gig', category: 'cat-1' }];

		const hydrated = hydrateEventsWithCategories(events, sampleCategories);

		expect(hydrated).toEqual([
			{
				id: 'ev-1',
				title: 'Gig',
				category: sampleCategories[0]
			}
		]);
	});

	it('leaves already-expanded category objects unchanged', () => {
		const expanded = { id: 'cat-1', title: 'Music', slug: 'music', color: '#ff0000' };
		const events = [{ id: 'ev-1', category: expanded }];

		const hydrated = hydrateEventsWithCategories(events, sampleCategories);

		expect(hydrated).toEqual([{ id: 'ev-1', category: expanded }]);
	});

	it('keeps unknown category UUIDs as strings', () => {
		const events = [{ id: 'ev-1', category: 'missing-cat' }];

		const hydrated = hydrateEventsWithCategories(events, sampleCategories);

		expect(hydrated).toEqual([{ id: 'ev-1', category: 'missing-cat' }]);
	});
});
