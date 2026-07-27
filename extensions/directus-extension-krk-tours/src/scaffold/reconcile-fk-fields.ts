import { physicalTableExists, readColumnDataType } from './column-introspection.js';
import { buildFieldPayloadForCreate } from './scaffold-field-payload.js';
import type { DirectusStateField, ScaffoldLogger } from './types.js';

type FieldsServiceLike = {
	readOne: (collection: string, field: string) => Promise<unknown>;
	createField: (collection: string, data: Record<string, unknown>) => Promise<unknown>;
	updateField: (
		collection: string,
		field: string,
		data: Record<string, unknown>
	) => Promise<unknown>;
};

type KnexDatabase = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(table: string): any;
	schema: {
		alterTable: (table: string, callback: (table: { dropColumn: (name: string) => void }) => void) => Promise<void>;
	};
};

async function countTableRows(database: KnexDatabase, table: string): Promise<number> {
	if (!(await physicalTableExists(database, table))) {
		return 0;
	}
	const row = (await database(table).count('* as count').first()) as { count?: string | number } | undefined;
	const value = row?.count ?? 0;
	return typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
}

/** Create or materialize DB column from Directus field state. */
export async function ensureFieldColumnExists(
	fieldsService: FieldsServiceLike,
	database: unknown,
	field: DirectusStateField,
	logger: ScaffoldLogger
): Promise<string | null> {
	if (!field.schema || field.type === 'alias') {
		return null;
	}

	const columnType = await readColumnDataType(database, field.collection, field.field);
	if (columnType) {
		return null;
	}

	const payload = buildFieldPayloadForCreate(field.collection, field);

	try {
		await fieldsService.readOne(field.collection, field.field);
		await fieldsService.updateField(field.collection, field.field, payload);
		logger.info(
			`[krk-tours] Materialized missing DB column ${field.collection}.${field.field}`
		);
	} catch {
		try {
			await fieldsService.createField(field.collection, payload);
			logger.info(`[krk-tours] Created DB column ${field.collection}.${field.field}`);
		} catch (error: unknown) {
			const err = error as { message?: string };
			const message = `Missing column ${field.collection}.${field.field} and create failed: ${err?.message ?? 'unknown'}`;
			logger.error(`[krk-tours] ${message}`, error);
			return message;
		}
	}

	const after = await readColumnDataType(database, field.collection, field.field);
	if (!after) {
		return `Column ${field.collection}.${field.field} still missing after field create/update`;
	}

	return null;
}

/** Align FK column types with referenced PK before RelationsService.createOne. */
export async function reconcileForeignKeyField(
	fieldsService: FieldsServiceLike,
	database: unknown,
	field: DirectusStateField,
	logger: ScaffoldLogger
): Promise<string | null> {
	const fkTable = field.schema?.foreign_key_table;
	if (!fkTable) return null;

	const fkColumn = (field.schema?.foreign_key_column as string | undefined) ?? 'id';
	const pkType = await readColumnDataType(database, fkTable, fkColumn);
	let columnType = await readColumnDataType(database, field.collection, field.field);

	if (!pkType) {
		return `Cannot read ${fkTable}.${fkColumn} type for ${field.collection}.${field.field}`;
	}

	if (!columnType) {
		const ensured = await ensureFieldColumnExists(fieldsService, database, field, logger);
		if (ensured) return ensured;
		columnType = await readColumnDataType(database, field.collection, field.field);
		if (!columnType) {
			return `Column ${field.collection}.${field.field} missing before relation create`;
		}
	}

	if (columnType === pkType) {
		return null;
	}

	const payload = buildFieldPayloadForCreate(field.collection, field);
	const knex = database as KnexDatabase;
	const rowCount = await countTableRows(knex, field.collection);

	if (rowCount === 0) {
		try {
			await knex.schema.alterTable(field.collection, (table) => {
				table.dropColumn(field.field);
			});
			await fieldsService.updateField(field.collection, field.field, payload);
			logger.info(
				`[krk-tours] Recreated ${field.collection}.${field.field} as ${pkType} (table was empty)`
			);
			return null;
		} catch (dropRecreateError: unknown) {
			const err = dropRecreateError as { message?: string };
			logger.warn(
				`[krk-tours] Drop/recreate ${field.collection}.${field.field} failed (${err?.message ?? 'unknown'}), trying updateField`
			);
		}
	}

	try {
		await fieldsService.updateField(field.collection, field.field, payload);
		const after = await readColumnDataType(database, field.collection, field.field);
		if (after === pkType) {
			logger.info(
				`[krk-tours] Updated ${field.collection}.${field.field} to ${pkType} via FieldsService`
			);
			return null;
		}
	} catch (error: unknown) {
		const err = error as { message?: string };
		const message =
			`${field.collection}.${field.field} is ${columnType} but ${fkTable}.${fkColumn} is ${pkType}` +
			(rowCount > 0 ? ` (${rowCount} row(s) block auto-migrate)` : '') +
			`; ${err?.message ?? 'updateField failed'}. Fix type in Data Model.`;
		logger.error(`[krk-tours] ${message}`, error);
		return message;
	}

	const message =
		`${field.collection}.${field.field} is ${columnType} but ${fkTable}.${fkColumn} is ${pkType}` +
		(rowCount > 0 ? ` (${rowCount} row(s))` : '') +
		'. Fix column type in Data Model, then re-run scaffold.';
	logger.error(`[krk-tours] ${message}`);
	return message;
}
