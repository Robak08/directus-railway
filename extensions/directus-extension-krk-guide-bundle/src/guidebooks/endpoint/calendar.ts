import type { ExtensionHandlerServices } from '../../core/index.js';
import { createServiceAccountability } from '../access/grant-service.js';
import { catalogPublishedDestinationFilter } from './catalog-destination-filter.js';

export const PUBLIC_EVENT_FIELDS = [
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
	// ItemsService accepts string paths only (`category.id`). Nested objects abort the query.
	'category.id',
	'category.title',
	'category.slug',
	'category.color',
	'related_post'
];

export type EventCategoryRow = {
	id: string;
	title: string;
	slug: string;
	color: string | null;
};

/** Attach full category objects when Directus returns a bare FK string. */
export const hydrateEventsWithCategories = (
	events: unknown[],
	eventCategories: EventCategoryRow[]
): unknown[] => {
	const categoryById = new Map(eventCategories.map((category) => [category.id, category]));

	return events.map((event) => {
		const ev = event as Record<string, unknown>;
		const category = ev.category;

		if (category && typeof category === 'object' && category !== null && 'id' in category) {
			return event;
		}

		if (typeof category === 'string') {
			const hydrated = categoryById.get(category);
			if (hydrated) {
				return { ...ev, category: hydrated };
			}
		}

		return event;
	});
};

export type GuidebookRow = {
	id: string;
	slug: string;
	status: string;
	destination_id?: string | null;
	calendar_enabled?: boolean | null;
};

export const isGuidebookCalendarPublic = (guidebook: GuidebookRow): boolean =>
	guidebook.calendar_enabled !== false;

export const loadPublishedGuidebookBySlug = async (params: {
	services: ExtensionHandlerServices;
	getSchema: () => Promise<unknown>;
	slug: string;
}): Promise<GuidebookRow | null> => {
	const schema = await params.getSchema();
	const items = new params.services.ItemsService('guidebooks', {
		schema: schema as object,
		accountability: createServiceAccountability()
	});

	const rows = await items.readByQuery({
		filter: {
			_and: [{ slug: { _eq: params.slug } }, { status: { _eq: 'published' } }]
		},
		limit: 1,
		fields: ['id', 'slug', 'status', 'destination_id', 'calendar_enabled']
	});

	const row = rows[0];
	return row && typeof row === 'object' ? (row as GuidebookRow) : null;
};

export const loadGuidebookCalendarPayload = async (params: {
	services: ExtensionHandlerServices;
	getSchema: () => Promise<unknown>;
	destinationId: string | null | undefined;
}) => {
	if (!params.destinationId) {
		return { events: [], eventCategories: [] };
	}

	const schema = await params.getSchema();
	const accountability = createServiceAccountability();

	const eventsService = new params.services.ItemsService('events', {
		schema: schema as object,
		accountability
	});

	const events = await eventsService.readByQuery({
		filter: catalogPublishedDestinationFilter(params.destinationId),
		sort: ['-start_date'],
		fields: PUBLIC_EVENT_FIELDS,
		limit: -1
	});

	const categoryIds = [
		...new Set(
			events
				.map((event: unknown) => {
					const ev = event as Record<string, unknown>;
					const category = ev.category;
					if (category && typeof category === 'object' && 'id' in category) {
						return (category as { id?: string }).id ?? null;
					}
					return typeof category === 'string' ? category : null;
				})
				.filter((id: unknown): id is string => typeof id === 'string' && Boolean(id))
		)
	];

	const categoriesService = new params.services.ItemsService('event_categories', {
		schema: schema as object,
		accountability
	});

	const eventCategories: EventCategoryRow[] =
		categoryIds.length === 0
			? []
			: (await categoriesService.readByQuery({
					filter: {
						_and: [{ id: { _in: categoryIds } }, { status: { _eq: 'published' } }]
					},
					sort: ['title'],
					fields: ['id', 'title', 'slug', 'color'],
					limit: -1
				})) as EventCategoryRow[];

	return {
		events: hydrateEventsWithCategories(events, eventCategories),
		eventCategories
	};
};
