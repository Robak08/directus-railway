import { directusState } from './directus-state-data.js';
import {
	collectionExists,
	ensureOrRepairRelations,
	sortCollectionsByDependency,
	validateRelations
} from './relation-helpers.js';
import { buildFieldPayloadForCreate } from './scaffold-field-payload.js';
import { ensureFieldColumnExists, reconcileForeignKeyField } from './reconcile-fk-fields.js';
import { reconcileRemovedFields, REMOVED_FIELDS } from './reconcile-removed-fields.js';
import { repairSchemaFromDatabase } from './sql-schema-repair.js';
import type { ExtensionHandlerServices } from '../../core/index.js';
import type {
	DatabaseLike,
	DirectusStateField,
	FieldsServiceLike,
	RelationsServiceLike,
	ScaffoldLogger,
	ScaffoldSummary
} from './types.js';

type CollectionsServiceLike = {
	readOne: (collection: string) => Promise<unknown>;
	createOne: (data: Record<string, unknown>) => Promise<unknown>;
};

type ScaffoldContext = {
	services: ExtensionHandlerServices;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	database: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	getSchema: (options?: { database?: any }) => Promise<unknown>;
	logger: ScaffoldLogger;
};

export async function guidebooksDomainMissing(database: DatabaseLike): Promise<boolean> {
	return !(await collectionExists(database, 'guidebooks'));
}

export async function runScaffold(context: ScaffoldContext): Promise<ScaffoldSummary> {
	const { services, database, getSchema, logger } = context;
	const summary: ScaffoldSummary = {
		collectionsCreated: 0,
		fieldsCreated: 0,
		fieldsRemoved: [],
		relationsCreated: 0,
		relationsRepaired: 0,
		relationsUnchanged: 0,
		permissionsCreated: 0,
		failedRelations: [],
		errors: []
	};

	const { CollectionsService, FieldsService, RelationsService } = services;
	const { collections, fields, relations } = directusState;
	const sortedCollections = sortCollectionsByDependency(collections, fields);

	logger.info('[krk-guidebooks] Starting guidebooks schema scaffold');

	if (sortedCollections.length > 0) {
		const collectionsService = new CollectionsService({
			knex: database,
			schema: (await getSchema()) as object
		});

		for (const collection of sortedCollections) {
			try {
				await collectionsService.readOne(collection.collection);
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
				} catch (createError: unknown) {
					const err = createError as { message?: string };
					summary.errors.push(
						`Failed to create collection '${collection.collection}': ${err?.message ?? 'unknown'}`
					);
				}
			}
		}
	}

	if (fields.length > 0) {
		const updatedSchema = await getSchema({ database });
		const fieldsService = new FieldsService({
			knex: database,
			schema: updatedSchema as object as object
		});

		for (const field of fields) {
			try {
				await fieldsService.readOne(field.collection, field.field);
			} catch {
				try {
					await fieldsService.createField(
						field.collection,
						buildFieldPayloadForCreate(field.collection, field)
					);
					summary.fieldsCreated++;
				} catch (fieldError: unknown) {
					const err = fieldError as { message?: string };
					summary.errors.push(
						`Failed field '${field.collection}.${field.field}': ${err?.message ?? 'unknown'}`
					);
				}
			}
		}

		const removedFields = await reconcileRemovedFields(
			fieldsService as FieldsServiceLike,
			fields,
			REMOVED_FIELDS,
			logger
		);
		summary.fieldsRemoved.push(...removedFields.removed);
		summary.errors.push(...removedFields.errors);
	}

	if (relations.length > 0) {
		await repairSchemaFromDatabase(database, fields, logger);

		const bogusGuidebookAliasFields = ['places', 'events', 'tours', 'places_regions', 'tips'];
		for (const field of bogusGuidebookAliasFields) {
			try {
				await database('directus_relations')
					.where({ many_collection: 'guidebooks', many_field: field })
					.delete();
			} catch {
				// ignore cleanup failures
			}
		}

		let updatedSchema = await getSchema({ database });
		const fieldsServiceForRelations = new FieldsService({
			knex: database,
			schema: updatedSchema as object
		});

		const physicalFields = fields.filter((field) => field.schema && field.type !== 'alias');
		for (const field of physicalFields) {
			const columnError = await ensureFieldColumnExists(
				fieldsServiceForRelations as FieldsServiceLike,
				database,
				field,
				logger
			);
			if (columnError) summary.errors.push(columnError);
		}

		updatedSchema = await getSchema({ database });
		const relationsService = new RelationsService({
			knex: database,
			schema: updatedSchema as object
		});

		const relationResult = await ensureOrRepairRelations(
			database as DatabaseLike,
			relationsService,
			relations,
			logger
		);
		summary.relationsCreated += relationResult.created;
		summary.relationsRepaired += relationResult.repaired;
		summary.relationsUnchanged += relationResult.unchanged;
		summary.failedRelations.push(...relationResult.failed);

		const missingRelations = await validateRelations(database as DatabaseLike, relations);
		if (missingRelations.length > 0) {
			summary.errors.push(
				`Missing relations after scaffold: ${missingRelations.join(', ')}`
			);
		}
	}

	return summary;
}
