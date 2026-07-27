import type { DirectusStateField, ScaffoldLogger } from './types.js';

type FieldsServiceLike = {
	updateField: (collection: string, field: string, data: Record<string, unknown>) => Promise<unknown>;
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

type FieldRow = {
	special?: unknown;
	hidden?: boolean | null;
	required?: boolean | null;
};

const HIDDEN_PARENT_FK_FIELDS: { collection: string; field: string }[] = [
	{ collection: 'tour_steps', field: 'tour_id' },
	{ collection: 'tours_translations', field: 'tours_id' },
	{ collection: 'tours_translations', field: 'languages_code' },
	{ collection: 'tour_steps_translations', field: 'tour_steps_id' },
	{ collection: 'tour_steps_translations', field: 'languages_code' }
];

function specialIncludesM2o(special: unknown): boolean {
	if (!Array.isArray(special)) {
		return false;
	}
	return special.includes('m2o');
}

function metaNeedsRepair(existing: FieldRow, desired: DirectusStateField): boolean {
	const wantHidden = (desired.meta?.hidden as boolean | undefined) ?? true;
	const wantSpecial = (desired.meta?.special as string[] | undefined) ?? ['m2o'];
	const wantRequired = (desired.meta?.required as boolean | undefined) ?? false;

	if ((existing.hidden ?? false) !== wantHidden) {
		return true;
	}
	if (!specialIncludesM2o(existing.special)) {
		return true;
	}
	if ((existing.required ?? false) !== wantRequired) {
		return true;
	}
	if (wantSpecial.length > 0 && !specialIncludesM2o(existing.special)) {
		return true;
	}

	return false;
}

export async function reconcileHiddenParentFkMeta(
	database: unknown,
	fieldsService: FieldsServiceLike,
	stateFields: DirectusStateField[],
	logger: ScaffoldLogger
): Promise<{ repaired: string[]; errors: string[] }> {
	const knex = database as MetaKnex;
	const repaired: string[] = [];
	const errors: string[] = [];

	for (const { collection, field } of HIDDEN_PARENT_FK_FIELDS) {
		const desired = stateFields.find((f) => f.collection === collection && f.field === field);
		if (!desired?.meta) {
			continue;
		}

		const row = (await knex
			.select(['special', 'hidden', 'required'])
			.from('directus_fields')
			.where({ collection, field })
			.first()) as FieldRow | undefined;

		if (!row) {
			continue;
		}

		if (!metaNeedsRepair(row, desired)) {
			continue;
		}

		const label = `${collection}.${field}`;
		try {
			await fieldsService.updateField(collection, field, {
				meta: {
					...desired.meta,
					hidden: (desired.meta.hidden as boolean | undefined) ?? true,
					special: (desired.meta.special as string[] | undefined) ?? ['m2o'],
					required: (desired.meta.required as boolean | undefined) ?? false
				}
			});
			logger.info(`[krk-tours] Repaired hidden parent FK meta: ${label}`);
			repaired.push(label);
		} catch (error: unknown) {
			const err = error as { message?: string };
			errors.push(`${label}: ${err?.message ?? 'updateField failed'}`);
		}
	}

	return { repaired, errors };
}

function translationOptionsNeedRepair(
	existingOptions: unknown,
	desiredOptions: Record<string, unknown> | undefined
): boolean {
	if (!desiredOptions) {
		return false;
	}
	if (existingOptions == null || typeof existingOptions !== 'object') {
		return true;
	}
	const existing = existingOptions as Record<string, unknown>;
	if (existing.languageField !== desiredOptions.languageField) {
		return true;
	}
	if (existing.userLanguage !== desiredOptions.userLanguage) {
		return true;
	}
	if (existing.defaultLanguage !== desiredOptions.defaultLanguage) {
		return true;
	}
	return false;
}

export async function reconcileTranslationsInterfaceMeta(
	database: unknown,
	fieldsService: FieldsServiceLike,
	stateFields: DirectusStateField[],
	logger: ScaffoldLogger
): Promise<{ repaired: string[]; errors: string[] }> {
	const knex = database as MetaKnex;
	const repaired: string[] = [];
	const errors: string[] = [];

	for (const collection of ['tours', 'tour_steps'] as const) {
		const desired = stateFields.find((f) => f.collection === collection && f.field === 'translations');
		if (!desired?.meta) {
			continue;
		}

		const row = (await knex
			.select(['options', 'display_options'])
			.from('directus_fields')
			.where({ collection, field: 'translations' })
			.first()) as { options?: unknown; display_options?: unknown } | undefined;

		if (!row) {
			continue;
		}

		const wantOptions = desired.meta.options as Record<string, unknown> | undefined;
		const wantDisplay = desired.meta.display_options as Record<string, unknown> | undefined;
		const needsOptions = translationOptionsNeedRepair(row.options, wantOptions);
		const needsDisplay =
			collection === 'tours' &&
			wantDisplay != null &&
			translationOptionsNeedRepair(row.display_options, wantDisplay);

		if (!needsOptions && !needsDisplay) {
			continue;
		}

		const label = `${collection}.translations`;
		try {
			await fieldsService.updateField(collection, 'translations', {
				meta: {
					options: wantOptions,
					...(needsDisplay ? { display_options: wantDisplay } : {})
				}
			});
			logger.info(`[krk-tours] Repaired translations interface meta: ${label}`);
			repaired.push(label);
		} catch (error: unknown) {
			const err = error as { message?: string };
			errors.push(`${label}: ${err?.message ?? 'updateField failed'}`);
		}
	}

	return { repaired, errors };
}

/** @deprecated Use reconcileHiddenParentFkMeta */
export async function reconcileTourStepTourIdMeta(
	database: unknown,
	fieldsService: FieldsServiceLike,
	stateFields: DirectusStateField[],
	logger: ScaffoldLogger
): Promise<string | null> {
	const { repaired, errors } = await reconcileHiddenParentFkMeta(
		database,
		fieldsService,
		stateFields,
		logger
	);
	if (errors.some((e) => e.startsWith('tour_steps.tour_id'))) {
		return errors.find((e) => e.startsWith('tour_steps.tour_id')) ?? null;
	}
	if (repaired.includes('tour_steps.tour_id')) {
		return 'tour_steps.tour_id';
	}
	return null;
}
