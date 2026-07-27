import type {
	DatabaseLike,
	DirectusStateCollection,
	DirectusStateField,
	DirectusStateRelation,
	ExistingRelationRow,
	RelationSnapshot,
	RelationsServiceLike,
	ScaffoldLogger
} from './types.js';
import { readFieldForeignKey } from './read-field-foreign-key.js';

export function sortCollectionsByDependency(
	collections: DirectusStateCollection[],
	fields: DirectusStateField[]
): DirectusStateCollection[] {
	const customCollections = new Set(collections.map((c) => c.collection));
	const indexByName = new Map(collections.map((c, index) => [c.collection, index]));
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
			(a, b) => (indexByName.get(a.collection) ?? 0) - (indexByName.get(b.collection) ?? 0)
		);

	const sorted: DirectusStateCollection[] = [];

	while (queue.length > 0) {
		const current = queue.shift()!;
		sorted.push(current);

		const next = Array.from(dependents.get(current.collection) ?? []).sort(
			(a, b) => (indexByName.get(a) ?? 0) - (indexByName.get(b) ?? 0)
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
			(a, b) => (indexByName.get(a.collection) ?? 0) - (indexByName.get(b.collection) ?? 0)
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

export function snapshotFromExisting(row: ExistingRelationRow): RelationSnapshot {
	return {
		related_collection: row.related_collection,
		foreign_key_table: row.foreign_key_table,
		foreign_key_column: row.foreign_key_column,
		junction_field: row.junction_field,
		one_field: row.one_field
	};
}

export function relationNeedsRepair(
	existing: RelationSnapshot,
	desired: DirectusStateRelation
): boolean {
	if (existing.related_collection !== desired.related_collection) {
		return true;
	}

	const desiredSchema = desired.schema ?? {};
	if (
		desiredSchema.foreign_key_table != null &&
		existing.foreign_key_table !== desiredSchema.foreign_key_table
	) {
		return true;
	}
	if (
		desiredSchema.foreign_key_column != null &&
		existing.foreign_key_column !== desiredSchema.foreign_key_column
	) {
		return true;
	}

	const desiredMeta = desired.meta ?? {};
	if (Object.prototype.hasOwnProperty.call(desiredMeta, 'junction_field')) {
		const want = (desiredMeta.junction_field ?? null) as string | null;
		if ((existing.junction_field ?? null) !== want) {
			return true;
		}
	}
	if (Object.prototype.hasOwnProperty.call(desiredMeta, 'one_field')) {
		const want = (desiredMeta.one_field ?? null) as string | null;
		if ((existing.one_field ?? null) !== want) {
			return true;
		}
	}

	return false;
}

export async function relationExists(
	database: DatabaseLike,
	collection: string,
	field: string
): Promise<boolean> {
	const row = await readRelationRow(database, collection, field);
	return row !== null;
}

export async function readRelationRow(
	database: DatabaseLike,
	collection: string,
	field: string
): Promise<ExistingRelationRow | null> {

	const relationRow = (await database
		.select(['id', 'one_collection', 'junction_field', 'one_field'])
		.from('directus_relations')
		.where({
			many_collection: collection,
			many_field: field
		})
		.first()) as
		| {
				id: number;
				one_collection: string | null;
				junction_field: string | null;
				one_field: string | null;
		  }
		| undefined;

	if (!relationRow) {
		return null;
	}

	const fk = await readFieldForeignKey(database, collection, field);

	return {
		id: relationRow.id,
		related_collection: relationRow.one_collection,
		junction_field: relationRow.junction_field,
		one_field: relationRow.one_field,
		foreign_key_table: fk.foreign_key_table,
		foreign_key_column: fk.foreign_key_column
	};
}

export function prepareRelationData(relation: DirectusStateRelation): DirectusStateRelation {
	const relationData = { ...relation };
	if (relationData.schema?.constraint_name === null) {
		const { constraint_name: _removed, ...schema } = relationData.schema;
		relationData.schema = schema;
	}
	return relationData;
}

export type EnsureRelationsResult = {
	created: number;
	repaired: number;
	unchanged: number;
	failed: string[];
};

export async function ensureOrRepairRelations(
	database: DatabaseLike,
	relationsService: RelationsServiceLike,
	relations: DirectusStateRelation[],
	logger: ScaffoldLogger
): Promise<EnsureRelationsResult> {
	let created = 0;
	let repaired = 0;
	let unchanged = 0;
	const failed: string[] = [];

	for (const relation of relations) {
		const relationKey = `${relation.collection}.${relation.field}`;

		try {
			const existing = await readRelationRow(database, relation.collection, relation.field);

			if (!existing) {
				await relationsService.createOne(prepareRelationData(relation));
				created++;
				logger.info(`[krk-tours] Relation '${relationKey}' created`);
				continue;
			}

			const snapshot = snapshotFromExisting(existing);
			if (!relationNeedsRepair(snapshot, relation)) {
				unchanged++;
				logger.debug(`[krk-tours] Relation '${relationKey}' OK, skipping`);
				continue;
			}

			await relationsService.updateOne(existing.id, prepareRelationData(relation));
			repaired++;
			logger.info(`[krk-tours] Relation '${relationKey}' repaired`);
		} catch (error: unknown) {
			const err = error as { message?: string };

			if (
				err?.message &&
				(err.message.includes('already exists') || err.message.includes('duplicate'))
			) {
				logger.debug(`[krk-tours] Relation '${relationKey}' already exists`);
				unchanged++;
				continue;
			}

			failed.push(`${relationKey} -> ${relation.related_collection}`);
			logger.error(`[krk-tours] Failed relation '${relationKey}'`, error);
		}
	}

	return { created, repaired, unchanged, failed };
}

/** @deprecated Use ensureOrRepairRelations */
export async function ensureRelations(
	database: DatabaseLike,
	relationsService: RelationsServiceLike,
	relations: DirectusStateRelation[],
	logger: ScaffoldLogger
): Promise<{ created: number; failed: string[] }> {
	const result = await ensureOrRepairRelations(
		database,
		relationsService,
		relations,
		logger
	);
	return { created: result.created, failed: result.failed };
}

export async function validateRelations(
	database: DatabaseLike,
	relations: DirectusStateRelation[]
): Promise<string[]> {
	const missing: string[] = [];

	for (const relation of relations) {
		const exists = await relationExists(database, relation.collection, relation.field);
		if (!exists) {
			missing.push(`${relation.collection}.${relation.field}`);
		}
	}

	return missing;
}

export async function collectionExists(
	database: DatabaseLike,
	collection: string
): Promise<boolean> {
	const row = await database
		.select('collection')
		.from('directus_collections')
		.where({ collection })
		.first();

	return Boolean(row);
}

