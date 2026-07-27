type KnexLike = {
	select: (columns: string | string[]) => {
		from: (table: string) => {
			where: (criteria: Record<string, string>) => {
				first: () => Promise<unknown>;
			};
		};
	};
};

export async function readColumnDataType(
	database: unknown,
	tableName: string,
	columnName: string,
	tableSchema = 'public'
): Promise<string | null> {
	const knex = database as KnexLike;
	const row = (await knex
		.select('data_type')
		.from('information_schema.columns')
		.where({
			table_schema: tableSchema,
			table_name: tableName,
			column_name: columnName
		})
		.first()) as { data_type?: string } | undefined;

	return row?.data_type ?? null;
}

export async function physicalTableExists(
	database: unknown,
	tableName: string,
	tableSchema = 'public'
): Promise<boolean> {
	const knex = database as KnexLike;
	const row = (await knex
		.select('table_name')
		.from('information_schema.tables')
		.where({
			table_schema: tableSchema,
			table_name: tableName
		})
		.first()) as { table_name?: string } | undefined;

	return Boolean(row?.table_name);
}
