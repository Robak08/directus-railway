import type { ScaffoldLogger } from '../scaffold/types.js';

type ItemsServiceLike = {
	readByQuery: (query: Record<string, unknown>) => Promise<unknown[]>;
	createOne: (data: Record<string, unknown>) => Promise<unknown>;
};

type SeedContext = {
	services: {
		ItemsService: new (collection: string, context: unknown) => ItemsServiceLike;
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	database: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	getSchema: (options?: { database?: any }) => Promise<unknown>;
	logger: ScaffoldLogger;
};

type SeedSummary = {
	created: string[];
	skipped: string[];
	errors: string[];
};

const SEED_TOURS = [
	{
		slug: 'krakova-keskusta-esittely',
		title: 'Krakovan keskusta – lyhyt kierros',
		description: 'Esittelykierros Krakovan keskustan nähtävyyksille.',
		estimated_duration_minutes: 90,
		stepCount: 4
	},
	{
		slug: 'krakova-iltakaynti',
		title: 'Krakova illalla',
		description: 'Iltalenkki valaistuissa katuympäristöissä.',
		estimated_duration_minutes: 60,
		stepCount: 3
	}
] as const;

const KRAKOW_REGION_SLUGS = ['krakova', 'krakow', 'kraków', 'krakow-centrum', 'krakova-keskusta'];

async function findKrakowRegionId(
	itemsService: ItemsServiceLike,
	logger: ScaffoldLogger
): Promise<string | number | null> {
	const regions = (await itemsService.readByQuery({
		fields: ['id', 'slug', 'title'],
		limit: 100
	})) as { id: string | number; slug?: string | null; title?: string | null }[];

	for (const region of regions) {
		const slug = (region.slug ?? '').toLowerCase();
		if (KRAKOW_REGION_SLUGS.includes(slug)) {
			return region.id;
		}
	}

	const byTitle = regions.find((region) =>
		(region.title ?? '').toLowerCase().includes('krak')
	);
	if (byTitle) return byTitle.id;

	logger.warn('[krk-tours] Krakow places_regions row not found; seed continues without regions');
	return null;
}

async function findPublishedPlaceIds(
	itemsService: ItemsServiceLike,
	limit: number
): Promise<(string | number)[]> {
	const places = (await itemsService.readByQuery({
		filter: { status: { _eq: 'published' } },
		fields: ['id'],
		sort: ['id'],
		limit
	})) as { id: string | number }[];

	return places.map((place) => place.id);
}

export async function seedTours(context: SeedContext): Promise<SeedSummary> {
	const { services, database, getSchema, logger } = context;
	const summary: SeedSummary = { created: [], skipped: [], errors: [] };

	const schema = await getSchema({ database });
	const toursService = new services.ItemsService('tours', {
		schema,
		knex: database
	});
	const tourTranslationsService = new services.ItemsService('tours_translations', {
		schema,
		knex: database
	});
	const tourStepsService = new services.ItemsService('tour_steps', {
		schema,
		knex: database
	});
	const stepTranslationsService = new services.ItemsService('tour_steps_translations', {
		schema,
		knex: database
	});
	const junctionService = new services.ItemsService('tours_places_regions', {
		schema,
		knex: database
	});
	const regionsService = new services.ItemsService('places_regions', {
		schema,
		knex: database
	});
	const placesService = new services.ItemsService('places', {
		schema,
		knex: database
	});

	const regionId = await findKrakowRegionId(regionsService, logger);
	const maxSteps = Math.max(...SEED_TOURS.map((tour) => tour.stepCount));
	const placeIds = await findPublishedPlaceIds(placesService, maxSteps);

	if (placeIds.length < 3) {
		summary.errors.push('Need at least 3 published places to seed tours');
		return summary;
	}

	for (const seed of SEED_TOURS) {
		const existing = (await tourTranslationsService.readByQuery({
			filter: {
				_and: [{ languages_code: { _eq: 'fi-FI' } }, { slug: { _eq: seed.slug } }]
			},
			fields: ['id', 'tours_id'],
			limit: 1
		})) as { id: number; tours_id: string }[];

		if (existing.length > 0) {
			summary.skipped.push(seed.slug);
			continue;
		}

		try {
			const tourId = (await toursService.createOne({
				status: 'published',
				estimated_duration_minutes: seed.estimated_duration_minutes
			})) as string;

			await tourTranslationsService.createOne({
				tours_id: tourId,
				languages_code: 'fi-FI',
				title: seed.title,
				slug: seed.slug,
				description: seed.description
			});

			if (regionId !== null) {
				await junctionService.createOne({
					tours_id: tourId,
					places_regions_id: regionId
				});
			}

			const stepsForTour = placeIds.slice(0, seed.stepCount);
			for (let index = 0; index < stepsForTour.length; index++) {
				const placeId = stepsForTour[index];
				const stepId = (await tourStepsService.createOne({
					tour_id: tourId,
					place_id: placeId,
					sort: index + 1,
					estimated_duration_minutes: 15
				})) as number;

				await stepTranslationsService.createOne({
					tour_steps_id: stepId,
					languages_code: 'fi-FI',
					note: `Pysähdys ${index + 1}`
				});
			}

			summary.created.push(seed.slug);
		} catch (error: unknown) {
			const err = error as Error;
			summary.errors.push(`${seed.slug}: ${err.message}`);
			logger.error(`[krk-tours] Seed failed for ${seed.slug}`, error);
		}
	}

	return summary;
}
