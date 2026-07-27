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

function specialIncludesM2o(special: unknown): boolean {
	if (!Array.isArray(special)) {
		return false;
	}
	return special.includes('m2o');
}

export async function reconcileTourStepTourIdMeta(
	database: unknown,
	fieldsService: FieldsServiceLike,
	stateFields: DirectusStateField[],
	logger: ScaffoldLogger
): Promise<string | null> {
	const knex = database as MetaKnex;
	const desired = stateFields.find(
		(f) => f.collection === 'tour_steps' && f.field === 'tour_id'
	);
	if (!desired?.meta) {
		return null;
	}

	const row = (await knex
		.select(['special', 'hidden'])
		.from('directus_fields')
		.where({ collection: 'tour_steps', field: 'tour_id' })
		.first()) as { special?: unknown; hidden?: boolean | null } | undefined;

	if (!row) {
		return null;
	}

	const wantHidden = (desired.meta.hidden as boolean | undefined) ?? true;
	const wantSpecial = (desired.meta.special as string[] | undefined) ?? ['m2o'];

	const needsRepair =
		!specialIncludesM2o(row.special) || (row.hidden ?? false) !== wantHidden;

	if (!needsRepair) {
		return null;
	}

	try {
		await fieldsService.updateField('tour_steps', 'tour_id', {
			meta: {
				...desired.meta,
				hidden: wantHidden,
				special: wantSpecial
			}
		});
		logger.info('[krk-tours] Repaired tour_steps.tour_id field meta (hidden m2o parent FK)');
		return 'tour_steps.tour_id';
	} catch (error: unknown) {
		const err = error as { message?: string };
		return `tour_steps.tour_id: ${err?.message ?? 'updateField failed'}`;
	}
}
