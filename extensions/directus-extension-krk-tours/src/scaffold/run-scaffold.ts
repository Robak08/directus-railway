import { directusState } from './directus-state-data.js';
import { assertPlacesRegionsIdIsUuid } from './places-regions-prerequisite.js';
import {
	collectionExists,
	ensureOrRepairRelations,
	sortCollectionsByDependency,
	validateRelations
} from './relation-helpers.js';
import { buildFieldPayloadForCreate } from './scaffold-field-payload.js';
import { reconcileJunctionFieldMeta } from './reconcile-junction-field-meta.js';
import { removeGhostNestedJunctions } from './remove-ghost-nested-junction.js';
import { validateToursRegionsJunctionRelations } from './validate-critical-relations.js';
import { validateToursRegionsM2mUiGraph } from './validate-m2m-ui-graph.js';
import { applyTourPermissions } from './permissions.js';
import { ensureFieldColumnExists, reconcileForeignKeyField } from './reconcile-fk-fields.js';
import { repairSchemaFromDatabase } from './sql-schema-repair.js';
import type {
	DatabaseLike,
	DirectusStateField,
	RelationsServiceLike,
	ScaffoldLogger,
	ScaffoldSummary
} from './types.js';

type CollectionsServiceLike = {
	readOne: (collection: string) => Promise<unknown>;
	createOne: (data: Record<string, unknown>) => Promise<unknown>;
	deleteOne: (collection: string) => Promise<unknown>;
};

type FieldsServiceLike = {
	readOne: (collection: string, field: string) => Promise<unknown>;
	createField: (collection: string, data: Record<string, unknown>) => Promise<unknown>;
	updateField: (collection: string, field: string, data: Record<string, unknown>) => Promise<unknown>;
};

type ScaffoldContext = {
	services: {
		CollectionsService: new (context: unknown) => CollectionsServiceLike;
		FieldsService: new (context: unknown) => FieldsServiceLike;
		RelationsService: new (context: unknown) => RelationsServiceLike;
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	database: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	getSchema: (options?: { database?: any }) => Promise<unknown>;
	logger: ScaffoldLogger;
};

export async function toursCollectionMissing(database: DatabaseLike): Promise<boolean> {
	return !(await collectionExists(database, 'tours'));
}

export async function assertPrerequisites(
	database: DatabaseLike,
	logger: ScaffoldLogger
): Promise<string[]> {
	const errors: string[] = [];
	for (const required of ['places', 'places_regions', 'languages']) {
		if (!(await collectionExists(database, required))) {
			const message = `Required collection '${required}' is missing`;
			logger.error(`[krk-tours] ${message}`);
			errors.push(message);
		}
	}
	return errors;
}

export async function runScaffold(context: ScaffoldContext): Promise<ScaffoldSummary> {
	const { services, database, getSchema, logger } = context;
	const summary: ScaffoldSummary = {
		collectionsCreated: 0,
		fieldsCreated: 0,
		relationsCreated: 0,
		relationsRepaired: 0,
		relationsUnchanged: 0,
		permissionsCreated: 0,
		failedRelations: [],
		errors: []
	};

	const prerequisiteErrors = await assertPrerequisites(database as DatabaseLike, logger);
	const placesRegionsIdTypeError = await assertPlacesRegionsIdIsUuid(database, logger);
	if (placesRegionsIdTypeError) {
		prerequisiteErrors.push(placesRegionsIdTypeError);
	}
	if (prerequisiteErrors.length > 0) {
		summary.errors.push(...prerequisiteErrors);
		return summary;
	}

	const startTime = Date.now();
	logger.info('[krk-tours] Starting tours schema scaffold');

	const { CollectionsService, FieldsService, RelationsService } = services;
	const collections = directusState.collections;
	const fields = directusState.fields;
	const relations = directusState.relations;
	const sortedCollections = sortCollectionsByDependency(collections, fields);

	if (sortedCollections.length > 0) {
		const collectionsService = new CollectionsService({
			knex: database,
			schema: await getSchema()
		});

		for (const collection of sortedCollections) {
			try {
				await collectionsService.readOne(collection.collection);
				logger.info(
					`[krk-tours] Collection '${collection.collection}' already exists, skipping create`
				);
			} catch {
				const collectionFields = fields.filter((f) => f.collection === collection.collection);

				try {
					await collectionsService.createOne({
						collection: collection.collection,
						meta: collection.meta,
						schema: collection.schema || null,
						fields: collectionFields.map((field: DirectusStateField) =>
							buildFieldPayloadForCreate(collection.collection, field)
						)
					});
					summary.collectionsCreated++;
					summary.fieldsCreated += collectionFields.length;
					logger.info(
						`[krk-tours] Created collection '${collection.collection}' with ${collectionFields.length} field(s)`
					);
				} catch (createError: unknown) {
					const err = createError as { message?: string; code?: string };
					if (
						err?.message?.includes('already exists') ||
						err?.code === '23505' ||
						err?.code === '42P07' ||
						err?.code === '42P16'
					) {
						logger.warn(
							`[krk-tours] Collection '${collection.collection}' already exists, continuing`
						);
					} else {
						const message = `Failed to create collection '${collection.collection}': ${err?.message ?? 'unknown error'}`;
						logger.error(`[krk-tours] ${message}`, createError);
						summary.errors.push(message);
					}
				}
			}
		}
	}

	if (fields.length > 0) {
		const updatedSchema = await getSchema({ database });
		const fieldsService = new FieldsService({
			knex: database,
			schema: updatedSchema
		});

		for (const field of fields) {
			try {
				await fieldsService.readOne(field.collection, field.field);
			} catch {
				const fieldData = buildFieldPayloadForCreate(field.collection, field);

				try {
					await fieldsService.createField(field.collection, fieldData);
					summary.fieldsCreated++;
				} catch (fieldError: unknown) {
					const err = fieldError as { message?: string };
					const message = `Failed field '${field.collection}.${field.field}': ${err?.message ?? 'unknown'}`;
					logger.error(`[krk-tours] ${message}`, fieldError);
					summary.errors.push(message);
				}
			}
		}
	}

	if (relations.length > 0) {
		const sqlRepair = await repairSchemaFromDatabase(database, fields, logger);
		if (sqlRepair.applied.length > 0) {
			logger.info(`[krk-tours] SQL schema repairs: ${sqlRepair.applied.join('; ')}`);
		}
		for (const repairError of sqlRepair.errors) {
			summary.errors.push(`SQL repair: ${repairError}`);
		}

		let updatedSchema = await getSchema({ database });
		const fieldsServiceForRelations = new FieldsService({
			knex: database,
			schema: updatedSchema
		});

		const physicalFields = fields.filter((field) => field.schema && field.type !== 'alias');
		for (const field of physicalFields) {
			const columnError = await ensureFieldColumnExists(
				fieldsServiceForRelations,
				database,
				field,
				logger
			);
			if (columnError) {
				summary.errors.push(columnError);
			}
		}

		updatedSchema = await getSchema({ database });
		const fieldsServiceAfterColumns = new FieldsService({
			knex: database,
			schema: updatedSchema
		});

		const fkFields = fields.filter((field) => field.schema?.foreign_key_table);
		for (const field of fkFields) {
			const fkError = await reconcileForeignKeyField(
				fieldsServiceAfterColumns,
				database,
				field,
				logger
			);
			if (fkError) {
				summary.errors.push(fkError);
			}
		}

		updatedSchema = await getSchema({ database });
		const collectionsServiceForCleanup = new CollectionsService({
			knex: database,
			schema: updatedSchema
		});

		const ghostCleanup = await removeGhostNestedJunctions(
			database as DatabaseLike,
			collectionsServiceForCleanup,
			logger
		);
		if (ghostCleanup.removed.length > 0) {
			logger.info(`[krk-tours] Ghost junction cleanup: ${ghostCleanup.removed.join('; ')}`);
		}
		for (const ghostError of ghostCleanup.errors) {
			summary.errors.push(`Ghost junction: ${ghostError}`);
		}

		updatedSchema = await getSchema({ database });
		const fieldsServiceForMeta = new FieldsService({
			knex: database,
			schema: updatedSchema
		});
		const metaRepair = await reconcileJunctionFieldMeta(
			database,
			fieldsServiceForMeta,
			fields,
			logger
		);
		if (metaRepair.repaired.length > 0) {
			logger.info(`[krk-tours] Junction meta repaired: ${metaRepair.repaired.join(', ')}`);
		}
		for (const metaError of metaRepair.errors) {
			summary.errors.push(`Junction meta: ${metaError}`);
		}

		updatedSchema = await getSchema({ database });
		const relationsService = new RelationsService({
			knex: database,
			schema: updatedSchema
		});

		const relationResult = await ensureOrRepairRelations(
			database as DatabaseLike,
			relationsService,
			relations,
			logger
		);
		summary.relationsCreated = relationResult.created;
		summary.relationsRepaired = relationResult.repaired;
		summary.relationsUnchanged = relationResult.unchanged;
		summary.failedRelations = relationResult.failed;

		const missingRelations = await validateRelations(database as DatabaseLike, relations);
		if (missingRelations.length > 0) {
			const message = `Missing relations after scaffold: ${missingRelations.join(', ')}`;
			logger.error(`[krk-tours] ${message}`);
			summary.errors.push(message);
		}

		const missingJunctionRelations = await validateToursRegionsJunctionRelations(
			database as DatabaseLike,
			logger
		);
		if (missingJunctionRelations.length > 0) {
			const message = `tours.regions M2M junction incomplete: ${missingJunctionRelations.join(', ')}`;
			summary.errors.push(message);
		}

		const uiGraphErrors = await validateToursRegionsM2mUiGraph(database as DatabaseLike, logger);
		summary.errors.push(...uiGraphErrors);
	}

	try {
		const permissionsCreated = await applyTourPermissions({
			database,
			logger
		});
		summary.permissionsCreated = permissionsCreated;
	} catch (permissionError: unknown) {
		const err = permissionError as Error;
		const message = `Permissions setup failed: ${err.message}`;
		logger.warn(`[krk-tours] ${message}`);
		summary.errors.push(message);
	}

	try {
		await getSchema({ database });
	} catch {
		// non-fatal
	}

	const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
	logger.info(
		`[krk-tours] Scaffold finished in ${elapsed}s (${summary.collectionsCreated} collections, ${summary.fieldsCreated} fields, ${summary.relationsCreated} relations created, ${summary.relationsRepaired} repaired, ${summary.relationsUnchanged} unchanged, ${summary.permissionsCreated} permissions)`
	);

	return summary;
}
