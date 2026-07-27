import { describe, expect, it, vi } from 'vitest';

import {
	expectedPlaceDisplayTemplatesForField,
	reconcileTourStepPlaceDisplayMeta
} from '../../src/scaffold/reconcile-tour-step-place-display-meta.js';
import {
	PLACE_M2O_DISPLAY_TEMPLATE,
	TOUR_STEP_PLACE_DISPLAY_TEMPLATE
} from '../../src/scaffold/directus-state-data.js';
import type { DirectusStateField } from '../../src/scaffold/types.js';

const logger = {
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn()
};

const stateFields: DirectusStateField[] = [
	{
		collection: 'tours',
		field: 'steps',
		type: 'alias',
		meta: {
			options: {
				template: TOUR_STEP_PLACE_DISPLAY_TEMPLATE,
				enableCreate: true,
				enableSelect: true,
				enableDelete: true
			},
			display_options: {
				template: TOUR_STEP_PLACE_DISPLAY_TEMPLATE
			}
		}
	},
	{
		collection: 'tour_steps',
		field: 'place_id',
		type: 'uuid',
		meta: {
			options: { template: PLACE_M2O_DISPLAY_TEMPLATE },
			display_options: { template: PLACE_M2O_DISPLAY_TEMPLATE }
		}
	}
];

function knexMock(
	rows: Record<string, { options?: unknown; display_options?: unknown } | { display_template?: string }>
) {
	return {
		select: (_columns: string | string[]) => ({
			from: (table: string) => ({
				where: (criteria: Record<string, string>) => ({
					first: async () => {
						if (table === 'directus_collections' && criteria.collection === 'tour_steps') {
							return rows.tour_steps_collection ?? undefined;
						}
						const key = `${criteria.collection}.${criteria.field}`;
						return rows[key];
					}
				})
			})
		})
	};
}

vi.mock('../../src/scaffold/relation-helpers.js', () => ({
	collectionExists: vi.fn().mockResolvedValue(true)
}));

describe('reconcileTourStepPlaceDisplayMeta', () => {
	it('repairs tours.steps when template is outdated', async () => {
		const updateField = vi.fn().mockResolvedValue(undefined);
		const updateOne = vi.fn().mockResolvedValue(undefined);
		const database = knexMock({
			'tours.steps': {
				options: { template: '{{place_id.title}}' },
				display_options: { template: '{{place_id.title}}' }
			},
			'tour_steps.place_id': {
				options: { template: PLACE_M2O_DISPLAY_TEMPLATE },
				display_options: { template: PLACE_M2O_DISPLAY_TEMPLATE }
			},
			tour_steps_collection: { display_template: TOUR_STEP_PLACE_DISPLAY_TEMPLATE }
		});

		const result = await reconcileTourStepPlaceDisplayMeta(
			database as never,
			{ updateField },
			{ updateOne },
			stateFields,
			logger
		);

		expect(updateField).toHaveBeenCalledWith('tours', 'steps', {
			meta: expect.objectContaining({
				options: expect.objectContaining({
					template: TOUR_STEP_PLACE_DISPLAY_TEMPLATE
				}),
				display_options: expect.objectContaining({
					template: TOUR_STEP_PLACE_DISPLAY_TEMPLATE
				})
			})
		});
		expect(result.repaired).toContain('tours.steps');
	});

	it('skips update when templates already match', async () => {
		const updateField = vi.fn();
		const updateOne = vi.fn();
		const database = knexMock({
			'tours.steps': {
				options: { template: TOUR_STEP_PLACE_DISPLAY_TEMPLATE },
				display_options: { template: TOUR_STEP_PLACE_DISPLAY_TEMPLATE }
			},
			'tour_steps.place_id': {
				options: { template: PLACE_M2O_DISPLAY_TEMPLATE },
				display_options: { template: PLACE_M2O_DISPLAY_TEMPLATE }
			},
			tour_steps_collection: { display_template: TOUR_STEP_PLACE_DISPLAY_TEMPLATE }
		});

		const result = await reconcileTourStepPlaceDisplayMeta(
			database as never,
			{ updateField },
			{ updateOne },
			stateFields,
			logger
		);

		expect(updateField).not.toHaveBeenCalled();
		expect(updateOne).not.toHaveBeenCalled();
		expect(result.repaired).toEqual([]);
	});
});

describe('expectedPlaceDisplayTemplatesForField', () => {
	it('returns nested place template for tours.steps', () => {
		expect(expectedPlaceDisplayTemplatesForField('tours', 'steps')).toEqual({
			optionsTemplate: TOUR_STEP_PLACE_DISPLAY_TEMPLATE,
			displayTemplate: TOUR_STEP_PLACE_DISPLAY_TEMPLATE
		});
	});
});
