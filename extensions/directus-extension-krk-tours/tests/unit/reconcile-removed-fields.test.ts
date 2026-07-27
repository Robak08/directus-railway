import { describe, expect, it, vi } from 'vitest';

import {
	desiredFieldKeys,
	reconcileRemovedFields,
	REMOVED_FIELDS
} from '../../src/scaffold/reconcile-removed-fields.js';
import type { DirectusStateField } from '../../src/scaffold/types.js';

const logger = {
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn()
};

describe('reconcileRemovedFields', () => {
	it('deletes fields that are in REMOVED_FIELDS but not in desired state', async () => {
		const desired: DirectusStateField[] = [
			{ collection: 'tour_steps', field: 'sort', type: 'integer' }
		];
		const deleteField = vi.fn().mockResolvedValue(undefined);
		const fieldsService = {
			readOne: vi.fn().mockResolvedValue({ field: 'estimated_duration_minutes' }),
			deleteField
		};

		const result = await reconcileRemovedFields(
			fieldsService,
			desired,
			REMOVED_FIELDS,
			logger
		);

		expect(deleteField).toHaveBeenCalledWith('tour_steps', 'estimated_duration_minutes');
		expect(result.removed).toEqual(['tour_steps.estimated_duration_minutes']);
		expect(result.errors).toEqual([]);
	});

	it('skips delete when field is not present', async () => {
		const desired: DirectusStateField[] = [];
		const deleteField = vi.fn();
		const fieldsService = {
			readOne: vi.fn().mockRejectedValue(new Error('not found')),
			deleteField
		};

		const result = await reconcileRemovedFields(
			fieldsService,
			desired,
			REMOVED_FIELDS,
			logger
		);

		expect(deleteField).not.toHaveBeenCalled();
		expect(result.removed).toEqual([]);
	});

	it('desiredFieldKeys includes collection.field pairs', () => {
		const keys = desiredFieldKeys([
			{ collection: 'places', field: 'estimated_duration_minutes', type: 'integer' }
		]);
		expect(keys.has('places.estimated_duration_minutes')).toBe(true);
	});
});
