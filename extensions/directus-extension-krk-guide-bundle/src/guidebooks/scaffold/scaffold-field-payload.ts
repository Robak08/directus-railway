import type { DirectusStateField } from './types.js';

const TOURS_PLACES_REGIONS = 'tours_places_regions';
const JUNCTION_FK_FIELDS = new Set(['tours_id', 'places_regions_id']);

/** Omit FK hints on initial create so RelationsService owns M2M junction legs. */
export function schemaForFieldCreate(
	collection: string,
	field: DirectusStateField
): Record<string, unknown> | null | undefined {
	if (field.schema === null || field.schema === undefined) {
		return field.schema;
	}

	if (collection === TOURS_PLACES_REGIONS && JUNCTION_FK_FIELDS.has(field.field)) {
		const {
			foreign_key_table: _foreignKeyTable,
			foreign_key_column: _foreignKeyColumn,
			...schemaWithoutFk
		} = field.schema;

		return schemaWithoutFk;
	}

	return field.schema;
}

export function buildFieldPayloadForCreate(
	collection: string,
	field: DirectusStateField
): Record<string, unknown> {
	const fieldData: Record<string, unknown> = {
		field: field.field,
		type: field.type,
		meta: field.meta
	};

	const schema = schemaForFieldCreate(collection, field);
	if (schema !== null && schema !== undefined) {
		fieldData.schema = schema;
	}

	return fieldData;
}
