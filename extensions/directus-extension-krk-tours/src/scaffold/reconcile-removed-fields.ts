import type { DirectusStateField, ScaffoldLogger } from './types.js';

export type RemovedFieldSpec = {
	collection: string;
	field: string;
};

type FieldsServiceLike = {
	readOne: (collection: string, field: string) => Promise<unknown>;
	deleteField: (collection: string, field: string) => Promise<void>;
};

export type ReconcileRemovedFieldsResult = {
	removed: string[];
	errors: string[];
};

/** Fields dropped from desired state but may still exist on existing Directus instances. */
export const REMOVED_FIELDS: RemovedFieldSpec[] = [
	{ collection: 'tour_steps', field: 'estimated_duration_minutes' }
];

export function desiredFieldKeys(fields: DirectusStateField[]): Set<string> {
	const keys = new Set<string>();
	for (const field of fields) {
		keys.add(`${field.collection}.${field.field}`);
	}
	return keys;
}

export async function reconcileRemovedFields(
	fieldsService: FieldsServiceLike,
	desiredFields: DirectusStateField[],
	removedSpecs: RemovedFieldSpec[],
	logger: ScaffoldLogger
): Promise<ReconcileRemovedFieldsResult> {
	const result: ReconcileRemovedFieldsResult = { removed: [], errors: [] };
	const desired = desiredFieldKeys(desiredFields);

	for (const { collection, field } of removedSpecs) {
		const key = `${collection}.${field}`;
		if (desired.has(key)) {
			continue;
		}

		try {
			await fieldsService.readOne(collection, field);
		} catch {
			continue;
		}

		try {
			await fieldsService.deleteField(collection, field);
			result.removed.push(key);
			logger.info(`[krk-tours] Removed obsolete field ${key}`);
		} catch (error: unknown) {
			const err = error as { message?: string };
			const message = `Failed to remove field '${key}': ${err?.message ?? 'unknown'}`;
			logger.error(`[krk-tours] ${message}`, error);
			result.errors.push(message);
		}
	}

	return result;
}
