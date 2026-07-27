import { defineHook } from '@directus/extensions-sdk';
import {
	injectTourIdOnNestedSteps,
	type TourPayloadWithSteps
} from './inject-tour-id-on-nested-steps.js';

type FilterMeta = {
	keys?: string[];
};

function resolveTourId(payload: TourPayloadWithSteps, meta: FilterMeta): string | undefined {
	const key = meta.keys?.[0];
	if (typeof key === 'string' && key.length > 0) {
		return key;
	}
	const id = payload.id;
	return typeof id === 'string' && id.length > 0 ? id : undefined;
}

export default defineHook(({ filter }) => {
	const apply = (payload: TourPayloadWithSteps, meta: FilterMeta) => {
		const tourId = resolveTourId(payload, meta);
		return injectTourIdOnNestedSteps(payload, tourId);
	};

	filter('tours.items.create', (payload, meta) => apply(payload as TourPayloadWithSteps, meta));
	filter('tours.items.update', (payload, meta) => apply(payload as TourPayloadWithSteps, meta));
});
