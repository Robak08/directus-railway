/** Knex-style query builder (Directus database). */
type SchemaKnex = {
	select: (
		columns: string | Record<string, string>
	) => {
		from: (table: string) => {
			join: (
				table: string,
				callback: (this: { on: (a: string, b: string) => { andOn: (a: string, b: string) => void } }) => void
			) => {
				join: (
					table: string,
					callback: (this: { on: (a: string, b: string) => { andOn: (a: string, b: string) => void } }) => void
				) => {
					where: (criteria: Record<string, string>) => {
						first: () => Promise<unknown>;
					};
				};
			};
		};
	};
};

export type FieldForeignKey = {
	foreign_key_table: string | null;
	foreign_key_column: string | null;
};

/**
 * Directus 12+ no longer stores FK targets on `directus_fields`; read from Postgres constraints.
 */
export async function readFieldForeignKey(
	database: unknown,
	collection: string,
	field: string,
	tableSchema = 'public'
): Promise<FieldForeignKey> {
	const knex = database as SchemaKnex;
	const row = (await knex
		.select({
			foreign_key_table: 'ccu.table_name',
			foreign_key_column: 'ccu.column_name'
		})
		.from('information_schema.table_constraints as tc')
		.join('information_schema.key_column_usage as kcu', function (this: {
			on: (a: string, b: string) => { andOn: (a: string, b: string) => void };
		}) {
			this.on('tc.constraint_name', 'kcu.constraint_name').andOn(
				'tc.table_schema',
				'kcu.table_schema'
			);
		})
		.join('information_schema.constraint_column_usage as ccu', function (this: {
			on: (a: string, b: string) => { andOn: (a: string, b: string) => void };
		}) {
			this.on('ccu.constraint_name', 'tc.constraint_name').andOn(
				'ccu.table_schema',
				'tc.table_schema'
			);
		})
		.where({
			'tc.constraint_type': 'FOREIGN KEY',
			'kcu.table_schema': tableSchema,
			'kcu.table_name': collection,
			'kcu.column_name': field
		})
		.first()) as { foreign_key_table?: string; foreign_key_column?: string } | undefined;

	if (!row?.foreign_key_table || !row?.foreign_key_column) {
		return { foreign_key_table: null, foreign_key_column: null };
	}

	return {
		foreign_key_table: row.foreign_key_table,
		foreign_key_column: row.foreign_key_column
	};
}
