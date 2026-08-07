import { defineHook } from "@directus/extensions-sdk";
import { readInnerFile } from "../utils/files.js";
import { reconcileScaffoldMeta } from "./reconcile-scaffold-meta.js";

type DirectusStateCollection = {
  collection: string;
  meta?: Record<string, unknown>;
  schema?: Record<string, unknown> | null;
};

type DirectusStateField = {
  collection: string;
  field: string;
  type: string;
  meta?: Record<string, unknown>;
  schema?: {
    foreign_key_table?: string | null;
    [key: string]: unknown;
  } | null;
};

type DirectusStateRelation = {
  collection: string;
  field: string;
  related_collection: string;
  schema?: {
    constraint_name?: string | null;
    [key: string]: unknown;
  } | null;
  meta?: Record<string, unknown>;
};

type RelationsServiceLike = {
  createOne: (data: DirectusStateRelation) => Promise<unknown>;
};

type DatabaseLike = {
  select: (columns?: string | string[]) => {
    from: (table: string) => {
      where: (criteria: Record<string, string>) => {
        first: () => Promise<unknown>;
      };
    };
  };
};

/**
 * Sort collections so FK targets are created before dependents.
 * Falls back to the order defined in directus-state.json as tiebreaker.
 */
export function sortCollectionsByDependency(
  collections: DirectusStateCollection[],
  fields: DirectusStateField[],
): DirectusStateCollection[] {
  const customCollections = new Set(collections.map((c) => c.collection));
  const indexByName = new Map(
    collections.map((c, index) => [c.collection, index]),
  );
  const dependencies = new Map<string, Set<string>>();

  for (const collection of collections) {
    dependencies.set(collection.collection, new Set());
  }

  for (const field of fields) {
    const target = field.schema?.foreign_key_table;
    if (!target || !customCollections.has(target)) continue;
    if (field.collection === target) continue;
    dependencies.get(field.collection)?.add(target);
  }

  const inDegree = new Map<string, number>();
  const dependents = new Map<string, Set<string>>();

  for (const collection of collections) {
    inDegree.set(collection.collection, 0);
    dependents.set(collection.collection, new Set());
  }

  for (const [collection, deps] of dependencies) {
    inDegree.set(collection, deps.size);
    for (const dep of deps) {
      dependents.get(dep)?.add(collection);
    }
  }

  const queue = collections
    .filter((c) => (inDegree.get(c.collection) ?? 0) === 0)
    .sort(
      (a, b) =>
        (indexByName.get(a.collection) ?? 0) -
        (indexByName.get(b.collection) ?? 0),
    );

  const sorted: DirectusStateCollection[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    const next = Array.from(dependents.get(current.collection) ?? []).sort(
      (a, b) => (indexByName.get(a) ?? 0) - (indexByName.get(b) ?? 0),
    );

    for (const dependent of next) {
      const degree = (inDegree.get(dependent) ?? 1) - 1;
      inDegree.set(dependent, degree);
      if (degree === 0) {
        const item = collections.find((c) => c.collection === dependent);
        if (item) queue.push(item);
      }
    }

    queue.sort(
      (a, b) =>
        (indexByName.get(a.collection) ?? 0) -
        (indexByName.get(b.collection) ?? 0),
    );
  }

  if (sorted.length !== collections.length) {
    const sortedNames = new Set(sorted.map((c) => c.collection));
    for (const collection of collections) {
      if (!sortedNames.has(collection.collection)) {
        sorted.push(collection);
      }
    }
  }

  return sorted;
}

export async function relationExists(
  database: DatabaseLike,
  collection: string,
  field: string,
): Promise<boolean> {
  const row = await database
    .select("id")
    .from("directus_relations")
    .where({
      many_collection: collection,
      many_field: field,
    })
    .first();

  return Boolean(row);
}

export function prepareRelationData(
  relation: DirectusStateRelation,
): DirectusStateRelation {
  const relationData = { ...relation };
  if (relationData.schema?.constraint_name === null) {
    const { constraint_name: _removed, ...schema } = relationData.schema;
    relationData.schema = schema;
  }
  return relationData;
}

export async function ensureRelations(
  database: DatabaseLike,
  relationsService: RelationsServiceLike,
  relations: DirectusStateRelation[],
  logger: {
    debug: (msg: string) => void;
    info: (msg: string) => void;
    error: (msg: string) => void;
  },
): Promise<{ created: number; failed: string[] }> {
  let created = 0;
  const failed: string[] = [];

  for (const relation of relations) {
    const relationKey = `${relation.collection}.${relation.field}`;

    try {
      const exists = await relationExists(
        database,
        relation.collection,
        relation.field,
      );

      if (exists) {
        logger.debug(
          `[DB Configuration] Relation '${relationKey}' already exists, skipping`,
        );
        continue;
      }

      logger.debug(
        `[DB Configuration] Creating relation '${relationKey}' -> ${relation.related_collection}`,
      );

      await relationsService.createOne(prepareRelationData(relation));
      created++;
      logger.info(
        `[DB Configuration] Relation '${relationKey}' created successfully`,
      );
    } catch (error: unknown) {
      const err = error as { message?: string; code?: string; stack?: string };

      if (
        err?.message &&
        (err.message.includes("already exists") ||
          err.message.includes("duplicate"))
      ) {
        logger.debug(`[DB Configuration] Relation '${relationKey}' already exists`);
        continue;
      }

      failed.push(`${relationKey} -> ${relation.related_collection}`);
      logger.error(
        `[DB Configuration] FAILED to create relation '${relationKey}' -> ${relation.related_collection}`,
      );
      logger.error(`[DB Configuration] Error message: ${err?.message}`);
      logger.error(`[DB Configuration] Error code: ${err?.code}`);
      if (err?.stack) {
        logger.error(`[DB Configuration] Stack trace: ${err.stack}`);
      }
    }
  }

  return { created, failed };
}

export async function validateRelations(
  database: DatabaseLike,
  relations: DirectusStateRelation[],
): Promise<string[]> {
  const missing: string[] = [];

  for (const relation of relations) {
    const exists = await relationExists(
      database,
      relation.collection,
      relation.field,
    );

    if (!exists) {
      missing.push(`${relation.collection}.${relation.field}`);
    }
  }

  return missing;
}

export default defineHook(
  ({ init }, { services, database, getSchema, logger }) => {
    const { CollectionsService, FieldsService, RelationsService } = services;
    init("routes.custom.after", async () => {
      const startTime = Date.now();
      logger.info("[DB Configuration] Starting database configuration");

      const directusState = JSON.parse(
        readInnerFile("directus-state.json").toString(),
      );

      logger.debug("[DB Configuration] State file loaded successfully");

      let collectionsCreated = 0;
      let fieldsCreated = 0;
      let relationsCreated = 0;
      let failedRelations: string[] = [];

      const collections = directusState.collections
        ? Array.isArray(directusState.collections)
          ? directusState.collections
          : [directusState.collections]
        : [];
      const fields = directusState.fields
        ? Array.isArray(directusState.fields)
          ? directusState.fields
          : [directusState.fields]
        : [];
      const relations = directusState.relations
        ? Array.isArray(directusState.relations)
          ? directusState.relations
          : [directusState.relations]
        : [];

      const sortedCollections = sortCollectionsByDependency(collections, fields);

      // STEP 1: Create collections WITH their fields in a single call
      // This prevents Directus from auto-creating a basic 'id' field
      if (sortedCollections.length > 0) {
        const collectionsService = new CollectionsService({
          knex: database,
          schema: await getSchema(),
        });

        for (const collection of sortedCollections) {
          try {
            await collectionsService.readOne(collection.collection);
            logger.info(
              `[DB Configuration] Collection '${collection.collection}' already exists, skipping`,
            );
          } catch (e: unknown) {
            // Get all fields for this collection
            const collectionFields = fields.filter(
              (f: DirectusStateField) =>
                f.collection === collection.collection,
            );

            logger.info(
              `[DB Configuration] Creating collection '${collection.collection}' with ${collectionFields.length} field(s)`,
            );

            // Create collection WITH fields - prevents auto-creation of basic id field
            try {
              await collectionsService.createOne({
                collection: collection.collection,
                meta: collection.meta,
                schema: collection.schema || null,
                fields: collectionFields.map(
                  (field: DirectusStateField) => {
                    const fieldData: Record<string, unknown> = {
                      field: field.field,
                      type: field.type,
                      meta: field.meta,
                    };

                    // Only add schema if not null (alias fields don't have schema)
                    if (field.schema !== null && field.schema !== undefined) {
                      fieldData.schema = field.schema;
                    }

                    return fieldData;
                  },
                ),
              });
              collectionsCreated++;
              fieldsCreated += collectionFields.length;

              logger.info(
                `[DB Configuration] Collection '${collection.collection}' created successfully with ${collectionFields.length} field(s)`,
              );
            } catch (createError: unknown) {
              const err = createError as { message?: string; code?: string };
              // Se já existe, ignorar (pode ter sido criada por outra extensão)
              if (
                err?.message?.includes("already exists") ||
                err?.code === "23505" || // Duplicate key
                err?.code === "42P07" || // Duplicate table
                err?.code === "42P16" // Multiple primary keys
              ) {
                logger.warn(
                  `[DB Configuration] Collection '${collection.collection}' already exists (created by another extension?), skipping`,
                );
              } else {
                logger.error(
                  `[DB Configuration] Error creating collection '${collection.collection}':`,
                  createError,
                );
                // Não fazer throw - continuar com outras coleções
              }
            }
          }
        }

        if (collectionsCreated > 0) {
          logger.info(
            `[DB Configuration] Created ${collectionsCreated} collection(s) with ${fieldsCreated} field(s)`,
          );
        }
      }

      // STEP 2: Add any missing fields to existing collections
      // This handles cases where collections existed but fields were added later
      if (fields.length > 0) {
        // Refresh schema after collections creation
        const updatedSchema = await getSchema({ database: database });

        const fieldsService = new FieldsService({
          knex: database,
          schema: updatedSchema,
        });

        let additionalFieldsCreated = 0;

        for (const field of fields) {
          try {
            await fieldsService.readOne(field.collection, field.field);
            logger.debug(
              `[DB Configuration] Field '${field.field}' in '${field.collection}' already exists`,
            );
          } catch (e: unknown) {
            logger.debug(
              `[DB Configuration] Creating field '${field.field}' in collection '${field.collection}'`,
            );

            const fieldData: Record<string, unknown> = {
              field: field.field,
              type: field.type,
              meta: field.meta,
            };

            if (field.schema !== null && field.schema !== undefined) {
              fieldData.schema = field.schema;
            }

            await fieldsService.createField(
              field.collection,
              fieldData as Parameters<typeof fieldsService.createField>[1],
            );
            additionalFieldsCreated++;

            logger.debug(
              `[DB Configuration] Field '${field.field}' created successfully`,
            );
          }
        }

        if (additionalFieldsCreated > 0) {
          logger.info(
            `[DB Configuration] Added ${additionalFieldsCreated} additional field(s)`,
          );
        }
      }

      // STEP 3: Create or repair relations
      if (relations.length > 0) {
        const updatedSchema = await getSchema({ database: database });

        const relationsService = new RelationsService({
          knex: database,
          schema: updatedSchema,
        });

        const relationResult = await ensureRelations(
          database,
          relationsService as unknown as RelationsServiceLike,
          relations,
          logger,
        );
        relationsCreated = relationResult.created;
        failedRelations = relationResult.failed;

        if (relationsCreated > 0) {
          logger.info(
            `[DB Configuration] Created ${relationsCreated} relation(s)`,
          );
        }

        const missingRelations = await validateRelations(database, relations);

        if (missingRelations.length > 0) {
          logger.error(
            `[DB Configuration] Missing ${missingRelations.length} relation(s) after apply: ${missingRelations.join(", ")}`,
          );
        } else {
          logger.info(
            `[DB Configuration] All ${relations.length} expected relation(s) are present`,
          );
        }
      }

      if (failedRelations.length > 0) {
        logger.error(
          `[DB Configuration] Failed to create ${failedRelations.length} relation(s): ${failedRelations.join("; ")}`,
        );
      }

      // STEP 3b: Repair drifted field meta on existing installs
      if (fields.length > 0) {
        const schemaForMeta = await getSchema({ database: database });
        const fieldsServiceForMeta = new FieldsService({
          knex: database,
          schema: schemaForMeta,
        });

        const metaRepair = await reconcileScaffoldMeta(
          database,
          fieldsServiceForMeta,
          fields,
          logger,
        );

        if (metaRepair.repaired.length > 0) {
          logger.info(
            `[DB Configuration] Repaired ${metaRepair.repaired.length} field meta(s): ${metaRepair.repaired.join(", ")}`,
          );
        }

        for (const metaError of metaRepair.errors) {
          logger.warn(`[DB Configuration] Field meta repair failed: ${metaError}`);
        }
      }

      // STEP 4: Populate languages collection with default languages
      await setupDefaultLanguages({ services, database, getSchema, logger });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const totalChanges =
        collectionsCreated + fieldsCreated + relationsCreated;

      if (totalChanges > 0) {
        logger.info(
          `[DB Configuration] Completed: ${collectionsCreated} collections, ${fieldsCreated} fields, ${relationsCreated} relations (${elapsed}s)`,
        );
      } else {
        logger.debug(
          "[DB Configuration] No changes needed - schema up to date",
        );
      }

      // Force schema refresh
      try {
        await getSchema({ database: database });
        logger.debug("[DB Configuration] Schema refreshed");
      } catch (error: unknown) {
        logger.warn(
          `[DB Configuration] Error refreshing schema: ${(error as Error).message}`,
        );
      }
    });
  },
);

/**
 * Setup default languages (pt-BR, en-US, es-ES)
 */
async function setupDefaultLanguages({
  services,
  database,
  getSchema,
  logger,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  services: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  database: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getSchema: (options?: { database?: any }) => Promise<any>;
  logger: {
    info: (msg: string) => void;
    debug: (msg: string) => void;
    warn: (msg: string) => void;
  };
}) {
  logger.info("[DB Configuration] 🌍 Setting up default languages...");

  const { ItemsService } = services as {
    ItemsService: new (
      collection: string,
      context: unknown,
    ) => {
      createOne: (data: unknown) => Promise<unknown>;
    };
  };

  // All languages officially supported by Directus
  const defaultLanguages = [
    { code: "af-ZA", name: "Afrikaans", direction: "ltr" },
    { code: "ar-SA", name: "العربية", direction: "rtl" },
    { code: "bg-BG", name: "Български", direction: "ltr" },
    { code: "ca-ES", name: "Català", direction: "ltr" },
    { code: "cs-CZ", name: "Čeština", direction: "ltr" },
    { code: "da-DK", name: "Dansk", direction: "ltr" },
    { code: "de-DE", name: "Deutsch", direction: "ltr" },
    { code: "el-GR", name: "Ελληνικά", direction: "ltr" },
    { code: "en-US", name: "English", direction: "ltr" },
    { code: "es-ES", name: "Español", direction: "ltr" },
    { code: "et-EE", name: "Eesti", direction: "ltr" },
    { code: "eu-ES", name: "Euskara", direction: "ltr" },
    { code: "fa-IR", name: "فارسی", direction: "rtl" },
    { code: "fi-FI", name: "Suomi", direction: "ltr" },
    { code: "fr-FR", name: "Français", direction: "ltr" },
    { code: "he-IL", name: "עברית", direction: "rtl" },
    { code: "hi-IN", name: "हिन्दी", direction: "ltr" },
    { code: "hr-HR", name: "Hrvatski", direction: "ltr" },
    { code: "hu-HU", name: "Magyar", direction: "ltr" },
    { code: "id-ID", name: "Bahasa Indonesia", direction: "ltr" },
    { code: "is-IS", name: "Íslenska", direction: "ltr" },
    { code: "it-IT", name: "Italiano", direction: "ltr" },
    { code: "ja-JP", name: "日本語", direction: "ltr" },
    { code: "ko-KR", name: "한국어", direction: "ltr" },
    { code: "lt-LT", name: "Lietuvių", direction: "ltr" },
    { code: "lv-LV", name: "Latviešu", direction: "ltr" },
    { code: "mk-MK", name: "Македонски", direction: "ltr" },
    { code: "ms-MY", name: "Bahasa Melayu", direction: "ltr" },
    { code: "nb-NO", name: "Norsk Bokmål", direction: "ltr" },
    { code: "nl-NL", name: "Nederlands", direction: "ltr" },
    { code: "nn-NO", name: "Norsk Nynorsk", direction: "ltr" },
    { code: "pl-PL", name: "Polski", direction: "ltr" },
    { code: "pt-BR", name: "Português (Brasil)", direction: "ltr" },
    { code: "pt-PT", name: "Português (Portugal)", direction: "ltr" },
    { code: "ro-RO", name: "Română", direction: "ltr" },
    { code: "ru-RU", name: "Русский", direction: "ltr" },
    { code: "sk-SK", name: "Slovenčina", direction: "ltr" },
    { code: "sl-SI", name: "Slovenščina", direction: "ltr" },
    { code: "sr-RS", name: "Српски", direction: "ltr" },
    { code: "sv-SE", name: "Svenska", direction: "ltr" },
    { code: "th-TH", name: "ไทย", direction: "ltr" },
    { code: "tr-TR", name: "Türkçe", direction: "ltr" },
    { code: "uk-UA", name: "Українська", direction: "ltr" },
    { code: "vi-VN", name: "Tiếng Việt", direction: "ltr" },
    { code: "zh-CN", name: "简体中文", direction: "ltr" },
    { code: "zh-TW", name: "繁體中文", direction: "ltr" },
  ];

  try {
    // Check if language collection exists
    const knex = database as {
      select: (columns: string | string[]) => {
        from: (table: string) => {
          where: (
            column: string,
            value: string,
          ) => { first: () => Promise<unknown> };
        };
      };
    };

    const collectionExists = await knex
      .select("collection")
      .from("directus_collections")
      .where("collection", "languages")
      .first();

    if (!collectionExists) {
      logger.warn(
        "[DB Configuration] ⚠️  Languages collection does not exist, skipping language setup",
      );
      return;
    }

    // Get current schema
    const currentSchema = await getSchema({ database });

    // Create ItemsService for languages collection
    const languagesService = new ItemsService("languages", {
      schema: currentSchema,
      knex: database,
    });

    let languagesCreated = 0;

    for (const language of defaultLanguages) {
      try {
        // Check if language already exists
        const existingLanguage = await knex
          .select("*")
          .from("languages")
          .where("code", language.code)
          .first();

        if (existingLanguage) {
          logger.debug(
            `[DB Configuration] ⏭️  Language ${language.code} (${language.name}) already exists`,
          );
          continue;
        }

        // Create language
        await languagesService.createOne(language);
        languagesCreated++;
        logger.info(
          `[DB Configuration] ✅ Language ${language.code} (${language.name}) created`,
        );
      } catch (error: unknown) {
        logger.warn(
          `[DB Configuration] ❌ Error creating language ${language.code}: ${(error as Error).message}`,
        );
      }
    }

    if (languagesCreated > 0) {
      logger.info(
        `[DB Configuration] ✅ Created ${languagesCreated} default language(s)`,
      );
    } else {
      logger.info("[DB Configuration] ℹ️  All default languages already exist");
    }
  } catch (error: unknown) {
    logger.warn(
      `[DB Configuration] ❌ Error setting up languages: ${(error as Error).message}`,
    );
  }
}
