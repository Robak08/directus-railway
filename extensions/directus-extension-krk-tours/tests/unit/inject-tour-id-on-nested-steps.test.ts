import { describe, expect, it } from 'vitest';

import { injectTourIdOnNestedSteps } from '../../src/tours-items-hook/inject-tour-id-on-nested-steps.js';

const TOUR_ID = '99ac7d98-4be0-42ec-aca1-f40240be061d';

describe('injectTourIdOnNestedSteps', () => {
	it('fills null and undefined tour_id on nested steps', () => {
		const payload = {
			steps: [
				{ id: 1, place_id: 'a', tour_id: null },
				{ id: 2, place_id: 'b' },
				{ id: 3, place_id: 'c', tour_id: TOUR_ID }
			]
		};

		injectTourIdOnNestedSteps(payload, TOUR_ID);

		expect(payload.steps[0].tour_id).toBe(TOUR_ID);
		expect(payload.steps[1].tour_id).toBe(TOUR_ID);
		expect(payload.steps[2].tour_id).toBe(TOUR_ID);
	});

	it('no-ops without steps or tour id', () => {
		const payload = { steps: [{ tour_id: null }] };
		injectTourIdOnNestedSteps(payload, undefined);
		expect(payload.steps[0].tour_id).toBeNull();

		const empty = { status: 'published' };
		injectTourIdOnNestedSteps(empty, TOUR_ID);
		expect(empty).toEqual({ status: 'published' });
	});
});
