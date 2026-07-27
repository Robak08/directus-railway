import { describe, expect, it } from 'vitest';

import {
	normalizeTourSavePayload,
	normalizeTourStepItemPayload
} from '../../src/tours-items-hook/normalize-tour-save-payload.js';

const TOUR_ID = '99ac7d98-4be0-42ec-aca1-f40240be061d';

describe('normalizeTourSavePayload', () => {
	it('fills tour_id on steps array', () => {
		const payload = {
			steps: [
				{ id: 1, place_id: 'a', tour_id: null },
				{ id: 2, place_id: 'b' }
			]
		};

		normalizeTourSavePayload(payload, TOUR_ID);

		expect(payload.steps[0].tour_id).toBe(TOUR_ID);
		expect(payload.steps[1].tour_id).toBe(TOUR_ID);
	});

	it('fills tour_id on steps alterations update bucket', () => {
		const payload = {
			steps: {
				create: [],
				update: [{ id: 3, tour_id: null, place_id: 'x' }],
				delete: []
			}
		};

		normalizeTourSavePayload(payload, TOUR_ID);

		expect(payload.steps.update[0].tour_id).toBe(TOUR_ID);
	});

	it('fills tours_id on tour translations create', () => {
		const payload = {
			translations: {
				create: [{ languages_code: 'fi-FI', title: 'Test', slug: 'test' }],
				update: [],
				delete: []
			}
		};

		normalizeTourSavePayload(payload, TOUR_ID);

		expect(payload.translations.create[0].tours_id).toBe(TOUR_ID);
	});

	it('fills tour_steps_id on nested step translations when step has id', () => {
		const payload = {
			steps: {
				update: [
					{
						id: 7,
						tour_id: null,
						translations: {
							create: [{ languages_code: 'fi-FI', note: 'Hei' }]
						}
					}
				]
			}
		};

		normalizeTourSavePayload(payload, TOUR_ID);

		expect(payload.steps.update[0].tour_id).toBe(TOUR_ID);
		expect(payload.steps.update[0].translations.create[0].tour_steps_id).toBe(7);
	});

	it('no-ops without tour id', () => {
		const payload = { steps: [{ tour_id: null }] };
		normalizeTourSavePayload(payload, undefined);
		expect(payload.steps[0].tour_id).toBeNull();
	});
});

describe('normalizeTourStepItemPayload', () => {
	it('removes explicit null tour_id', () => {
		const payload = { id: 1, tour_id: null, place_id: 'p' };
		normalizeTourStepItemPayload(payload);
		expect('tour_id' in payload).toBe(false);
	});
});
