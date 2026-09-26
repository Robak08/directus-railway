import type { Accountability } from '@directus/types';
import { createServiceAccountability } from '../access/grant-service.js';

const PUBLIC_EVENT_FIELDS = [
	'id',
	'title',
	'content',
	'slug',
	'start_date',
	'timetable',
	'end_date',
	'event_link',
	'repeating_event',
	'days_of_week',
	'affiliate_link',
	'duration',
	'address',
	'category',
	'related_post'
];

export type GuidebookRow = {
	id: string;
	slug: string;
	status: string;
};

export const loadPublishedGuidebookBySlug = async (params: {
	services: {
		ItemsService: new (
			collection: string,
			options: { schema: unknown; accountability?: Accountability | null }
		) => {
			readByQuery: (query: Record<string, unknown>) => Promise<GuidebookRow[]>;
		};
	};
	getSchema: () => Promise<unknown>;
	slug: string;
}): Promise<GuidebookRow | null> => {
	const schema = await params.getSchema();
	const items = new params.services.ItemsService('guidebooks', {
		schema,
		accountability: createServiceAccountability()
	});

	const rows = await items.readByQuery({
		filter: {
			_and: [{ slug: { _eq: params.slug } }, { status: { _eq: 'published' } }]
		},
		limit: 1,
		fields: ['id', 'slug', 'status']
	});

	return rows[0] ?? null;
};

export const loadGuidebookCalendarPayload = async (params: {
	services: {
		ItemsService: new (
			collection: string,
			options: { schema: unknown; accountability?: Accountability | null }
		) => {
			readByQuery: (query: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
		};
	};
	getSchema: () => Promise<unknown>;
	guidebookId: string;
}) => {
	const schema = await params.getSchema();
	const accountability = createServiceAccountability();
	const junction = new params.services.ItemsService('guidebooks_events', {
		schema,
		accountability
	});

	const assignments = await junction.readByQuery({
		filter: { guidebook_id: { _eq: params.guidebookId } },
		fields: ['events_id'],
		limit: -1
	});

	const eventIds = assignments
		.map((row) => row.events_id)
		.filter((id): id is string => typeof id === 'string');

	if (eventIds.length === 0) {
		return { events: [], eventCategories: [] };
	}

	const eventsService = new params.services.ItemsService('events', {
		schema,
		accountability
	});

	const events = await eventsService.readByQuery({
		filter: {
			_and: [{ id: { _in: eventIds } }, { status: { _eq: 'published' } }]
		},
		sort: ['-start_date'],
		fields: PUBLIC_EVENT_FIELDS,
		limit: -1
	});

	const categoryIds = [
		...new Set(
			events
				.map((event) => {
					const category = event.category;
					if (category && typeof category === 'object' && 'id' in category) {
						return (category as { id?: string }).id ?? null;
					}
					return typeof category === 'string' ? category : null;
				})
				.filter((id): id is string => Boolean(id))
		)
	];

	const categoriesService = new params.services.ItemsService('event_categories', {
		schema,
		accountability
	});

	const eventCategories =
		categoryIds.length === 0
			? []
			: await categoriesService.readByQuery({
					filter: {
						_and: [{ id: { _in: categoryIds } }, { status: { _eq: 'published' } }]
					},
					sort: ['title'],
					fields: ['id', 'title', 'slug', 'color'],
					limit: -1
				});

	return { events, eventCategories };
};
