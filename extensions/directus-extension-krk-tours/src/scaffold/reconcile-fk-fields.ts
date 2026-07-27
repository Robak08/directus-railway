import { readColumnDataType } from './column-introspection.js';
import { buildFieldPayloadForCreate } from './scaffold-field-payload.js';
import type { DirectusStateField, ScaffoldLogger } from './types.js';

type FieldsServiceWithUpdate = {
	updateField: (
		collection: string,
		field: string,
		data: Record<string, unknown>
	) => Promise<unknown>;
};

/** Align FK column types with referenced PK before RelationsService.createOne. */
export async function reconcileForeignKeyField(
	fieldsService: FieldsServiceWithUpdate,
	database: unknown,
	field: DirectusStateField,
	logger: ScaffoldLogger
): Promise<string | null> {
	const fkTable = field.schema?.foreign_key_table;
	if (!fkTable) return null;

	const fkColumn = (field.schema?.foreign_key_column as string | undefined) ?? 'id';
	const pkType = await readColumnDataType(database, fkTable, fkColumn);
	const columnType = await readColumnDataType(database, field.collection, field.field);

	if (!pkType) {
		return `Cannot read ${fkTable}.${fkColumn} type for ${field.collection}.${field.field}`;
	}

	if (!columnType) {
		return null;
	}

	if (columnType === pkType) {
		return null;
	}

	const payload = buildFieldPayloadForCreate(field.collection, field);

	try {
		await fieldsService.updateField(field.collection, field.field, payload);
		logger.info(
			`[krk-tours] Updated ${field.collection}.${field.field} from ${columnType} to match ${fkTable}.${fkColumn} (${pkType})`
		);
		return null;
	} catch (error: unknown) {
		const err = error as { message?: string };
		const message =
			`${field.collection}.${field.field} is ${columnType} but ${fkTable}.${fkColumn} is ${pkType}; ` +
			`could not auto-align (${err?.message ?? 'unknown'}). Fix column type in Data Model.`;
		logger.error(`[krk-tours] ${message}`, error);
		return message;
	}
}
