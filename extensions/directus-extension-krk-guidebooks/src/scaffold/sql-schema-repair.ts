import { readColumnDataType } from './column-introspection.js';
import type { DirectusStateField, ScaffoldLogger } from './types.js';

type KnexDatabase = {
	schema: {
		alterTable: (
			table: string,
			callback: (table: {
				dropColumn: (name: string) => void;
				uuid: (name: string) => { notNullable: () => void };
			}) => void
		) => Promise<void>;
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(table: string): any;
	raw: (sql: string) => { then?: unknown };
};

async function countTableRows(database: KnexDatabase, table: string): Promise<number> {
	const row = (await database(table).count('* as count').first()) as { count?: string | number } | undefined;
	const value = row?.count ?? 0;
	return typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
}

export type SqlRepairResult = {
	applied: string[];
	skipped: string[];
	errors: string[];
};

/**
 * Repairs known Krakovan Opas drift using information_schema + row counts (no guessing).
 * Only mutates when referenced PK type is known and the table is empty.
 */
export async function repairSchemaFromDatabase(
	database: unknown,
	fields: DirectusStateField[],
	logger: ScaffoldLogger
): Promise<SqlRepairResult> {
	const knex = database as KnexDatabase;
	const result: SqlRepairResult = { applied: [], skipped: [], errors: [] };

	const repairs: Array<{
		collection: string;
		column: string;
		fkTable: string;
		fkColumn: string;
	}> = [];

	for (const field of fields) {
		const fkTable = field.schema?.foreign_key_table;
		if (!fkTable || field.type !== 'uuid') continue;
		const fkColumn = (field.schema?.foreign_key_column as string | undefined) ?? 'id';
		repairs.push({
			collection: field.collection,
			column: field.field,
			fkTable,
			fkColumn
		});
	}

	for (const { collection, column, fkTable, fkColumn } of repairs) {
		const pkType = await readColumnDataType(database, fkTable, fkColumn);
		const columnType = await readColumnDataType(database, collection, column);

		if (!pkType) {
			result.skipped.push(`${collection}.${column}: cannot read ${fkTable}.${fkColumn} type`);
			continue;
		}

		if (pkType !== 'uuid') {
			result.skipped.push(`${collection}.${column}: ${fkTable}.${fkColumn} is ${pkType}, not uuid`);
			continue;
		}

		const rowCount = await countTableRows(knex, collection);

		if (!columnType) {
			if (rowCount > 0) {
				result.errors.push(
					`${collection}.${column} missing but table has ${rowCount} row(s); add column manually`
				);
				continue;
			}
			try {
				await knex.schema.alterTable(collection, (table) => {
					table.uuid(column).notNullable();
				});
				result.applied.push(`ADD ${collection}.${column} uuid NOT NULL`);
				logger.info(`[krk-tours] SQL repair: added ${collection}.${column} uuid`);
			} catch (error: unknown) {
				const err = error as { message?: string };
				result.errors.push(`ADD ${collection}.${column}: ${err?.message ?? 'unknown'}`);
			}
			continue;
		}

		if (columnType === pkType) {
			continue;
		}

		if (rowCount > 0) {
			result.errors.push(
				`${collection}.${column} is ${columnType}, need ${pkType}, but ${rowCount} row(s) prevent auto ALTER`
			);
			continue;
		}

		try {
			await knex.schema.alterTable(collection, (table) => {
				table.dropColumn(column);
			});
			await knex.schema.alterTable(collection, (table) => {
				table.uuid(column).notNullable();
			});
			result.applied.push(`RECREATE ${collection}.${column} as uuid (was ${columnType})`);
			logger.info(`[krk-tours] SQL repair: recreated ${collection}.${column} as uuid`);
		} catch (error: unknown) {
			const err = error as { message?: string };
			result.errors.push(`RECREATE ${collection}.${column}: ${err?.message ?? 'unknown'}`);
		}
	}

	// Junction FK field must not use special=m2m on the scalar column (Directus drift).
	try {
		await knex('directus_fields')
			.where({ collection: 'tours_places_regions', field: 'places_regions_id' })
			.update({ special: null, interface: null, hidden: true });
	} catch {
		// non-fatal
	}

	return result;
}
