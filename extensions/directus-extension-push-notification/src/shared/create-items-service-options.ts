export type HookServiceContext = {
  schema: unknown;
  database: unknown;
  accountability?: unknown;
};

export function createItemsServiceOptions(context: HookServiceContext) {
  const { schema, database, accountability } = context;

  return {
    schema: schema!,
    knex: database,
    accountability: accountability ?? { admin: true },
  };
}
