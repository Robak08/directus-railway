import {
	directusState,
	PLACE_M2O_DISPLAY_TEMPLATE,
	TOUR_STEP_PLACE_DISPLAY_TEMPLATE
} from './directus-state-data.js';
import { collectionExists } from './relation-helpers.js';
import type { DatabaseLike, DirectusStateField, ScaffoldLogger } from './types.js';

type FieldsServiceLike = {
	updateField: (collection: string, field: string, data: Record<string, unknown>) => Promise<unknown>;
};

type CollectionsServiceLike = {
	updateOne: (collection: string, data: Record<string, unknown>) => Promise<unknown>;
};

type MetaKnex = {
	select: (columns: string | string[]) => {
		from: (table: string) => {
			where: (criteria: Record<string, string>) => {
				first: () => Promise<unknown>;
			};
		};
	};
};

const FIELD_TARGETS: { collection: string; field: string }[] = [
	{ collection: 'tours', field: 'steps' },
	{ collection: 'tour_steps', field: 'place_id' }
];

function templateFromOptions(options: unknown): string | undefined {
	if (options == null || typeof options !== 'object') {
		return undefined;
	}
	const template = (options as Record<string, unknown>).template;
	return typeof template === 'string' ? template : undefined;
}

function templatesNeedRepair(
	existingOptions: unknown,
	existingDisplayOptions: unknown,
	wantOptions: Record<string, unknown> | undefined,
	wantDisplayOptions: Record<string, unknown> | undefined
): boolean {
	const wantOptionsTemplate = wantOptions ? templateFromOptions(wantOptions) : undefined;
	const wantDisplayTemplate = wantDisplayOptions
		? templateFromOptions(wantDisplayOptions)
		: undefined;

	if (wantOptionsTemplate != null && templateFromOptions(existingOptions) !== wantOptionsTemplate) {
		return true;
	}
	if (
		wantDisplayTemplate != null &&
		templateFromOptions(existingDisplayOptions) !== wantDisplayTemplate
	) {
		return true;
	}
	return false;
}

export function expectedPlaceDisplayTemplatesForField(
	collection: string,
	field: string
): { optionsTemplate?: string; displayTemplate?: string } {
	if (collection === 'tours' && field === 'steps') {
		return {
			optionsTemplate: TOUR_STEP_PLACE_DISPLAY_TEMPLATE,
			displayTemplate: TOUR_STEP_PLACE_DISPLAY_TEMPLATE
		};
	}
	if (collection === 'tour_steps' && field === 'place_id') {
		return {
			optionsTemplate: PLACE_M2O_DISPLAY_TEMPLATE,
			displayTemplate: PLACE_M2O_DISPLAY_TEMPLATE
		};
	}
	return {};
}

export async function reconcileTourStepPlaceDisplayMeta(
	database: DatabaseLike,
	fieldsService: FieldsServiceLike,
	collectionsService: CollectionsServiceLike,
	stateFields: DirectusStateField[],
	logger: ScaffoldLogger
): Promise<{ repaired: string[]; errors: string[] }> {
	const knex = database as MetaKnex;
	const repaired: string[] = [];
	const errors: string[] = [];

	for (const { collection, field } of FIELD_TARGETS) {
		const desired = stateFields.find((f) => f.collection === collection && f.field === field);
		if (!desired?.meta) {
			continue;
		}

		const row = (await knex
			.select(['options', 'display_options'])
			.from('directus_fields')
			.where({ collection, field })
			.first()) as { options?: unknown; display_options?: unknown } | undefined;

		if (!row) {
			continue;
		}

		const wantOptions = desired.meta.options as Record<string, unknown> | undefined;
		const wantDisplay = desired.meta.display_options as Record<string, unknown> | undefined;

		if (!templatesNeedRepair(row.options, row.display_options, wantOptions, wantDisplay)) {
			continue;
		}

		const label = `${collection}.${field}`;
		try {
			await fieldsService.updateField(collection, field, {
				meta: {
					...(wantOptions ? { options: wantOptions } : {}),
					...(wantDisplay ? { display_options: wantDisplay } : {})
				}
			});
			logger.info(`[krk-tours] Repaired tour step place display meta: ${label}`);
			repaired.push(label);
		} catch (error: unknown) {
			const err = error as { message?: string };
			errors.push(`${label}: ${err?.message ?? 'updateField failed'}`);
		}
	}

	const tourStepsCollection = directusState.collections.find((c) => c.collection === 'tour_steps');
	const wantDisplayTemplate = tourStepsCollection?.meta?.display_template as string | undefined;

	if (
		wantDisplayTemplate &&
		(await collectionExists(database, 'tour_steps'))
	) {
		const row = (await knex
			.select('display_template')
			.from('directus_collections')
			.where({ collection: 'tour_steps' })
			.first()) as { display_template?: string | null } | undefined;

		if ((row?.display_template ?? null) !== wantDisplayTemplate) {
			try {
				await collectionsService.updateOne('tour_steps', {
					meta: { display_template: wantDisplayTemplate }
				});
				logger.info('[krk-tours] Repaired tour_steps collection display_template');
				repaired.push('tour_steps.display_template');
			} catch (error: unknown) {
				const err = error as { message?: string };
				errors.push(`tour_steps.display_template: ${err?.message ?? 'updateOne failed'}`);
			}
		}
	}

	return { repaired, errors };
}
