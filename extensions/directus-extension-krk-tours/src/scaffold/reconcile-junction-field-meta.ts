import type { DirectusStateField, ScaffoldLogger } from './types.js';
import { TOURS_REGIONS_JUNCTION } from './m2m-junction-constants.js';

export type DirectusFieldMetaRow = {
	interface?: string | null;
	hidden?: boolean | null;
	special?: unknown;
};

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

export function fieldSpecialContainsM2m(special: unknown): boolean {
	if (special == null) {
		return false;
	}
	if (Array.isArray(special)) {
		return special.includes('m2m');
	}
	if (typeof special === 'string') {
		return special.includes('m2m');
	}
	return false;
}

/** Junction FK columns must not use M2M interface or special on the scalar field. */
export function junctionFieldMetaNeedsRepair(
	existing: DirectusFieldMetaRow,
	desired: { hidden?: boolean; interface?: string | null }
): boolean {
	const wantHidden = desired.hidden ?? false;
	const wantInterface = desired.interface ?? null;

	if (existing.interface === 'list-m2m') {
		return true;
	}
	if (fieldSpecialContainsM2m(existing.special)) {
		return true;
	}
	if ((existing.hidden ?? false) !== wantHidden) {
		return true;
	}
	if ((existing.interface ?? null) !== wantInterface && wantInterface === null && existing.interface) {
		return true;
	}

	return false;
}

export type JunctionMetaRepairResult = {
	repaired: string[];
	skipped: string[];
	errors: string[];
};

export async function reconcileJunctionFieldMeta(
	database: unknown,
	fieldsService: FieldsServiceLike,
	stateFields: DirectusStateField[],
	logger: ScaffoldLogger
): Promise<JunctionMetaRepairResult> {
	const knex = database as MetaKnex;
	const result: JunctionMetaRepairResult = { repaired: [], skipped: [], errors: [] };

	const junctionFields = stateFields.filter(
		(f) => f.collection === TOURS_REGIONS_JUNCTION && f.schema?.foreign_key_table
	);

	for (const field of junctionFields) {
		const row = (await knex
			.select(['interface', 'hidden', 'special'])
			.from('directus_fields')
			.where({ collection: field.collection, field: field.field })
			.first()) as DirectusFieldMetaRow | undefined;

		if (!row) {
			result.skipped.push(`${field.collection}.${field.field}: no directus_fields row`);
			continue;
		}

		const desiredMeta = {
			hidden: (field.meta?.hidden as boolean | undefined) ?? true,
			interface: (field.meta?.interface as string | null | undefined) ?? null
		};

		if (!junctionFieldMetaNeedsRepair(row, desiredMeta)) {
			continue;
		}

		try {
			await fieldsService.updateField(field.collection, field.field, {
				meta: {
					...field.meta,
					hidden: desiredMeta.hidden,
					interface: desiredMeta.interface,
					special: null
				}
			});
			result.repaired.push(`${field.collection}.${field.field}`);
			logger.info(
				`[krk-tours] Repaired junction field meta: ${field.collection}.${field.field} (hidden, no list-m2m)`
			);
		} catch (error: unknown) {
			const err = error as { message?: string };
			result.errors.push(
				`${field.collection}.${field.field}: ${err?.message ?? 'updateField failed'}`
			);
		}
	}

	return result;
}
