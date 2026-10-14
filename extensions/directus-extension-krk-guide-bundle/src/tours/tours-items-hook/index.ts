import { defineHook } from '@directus/extensions-sdk';
import {
	normalizeTourSavePayload,
	normalizeTourStepItemPayload
} from './normalize-tour-save-payload.js';

type FilterMeta = {
	keys?: string[];
};

function resolveTourId(payload: Record<string, unknown>, meta: FilterMeta): string | undefined {
	const key = meta.keys?.[0];
	if (typeof key === 'string' && key.length > 0) {
		return key;
	}
	const id = payload.id;
	return typeof id === 'string' && id.length > 0 ? id : undefined;
}

export default defineHook(({ filter }) => {
	const applyTour = (payload: Record<string, unknown>, meta: FilterMeta) => {
		const tourId = resolveTourId(payload, meta);
		return normalizeTourSavePayload(payload, tourId);
	};

	filter('tours.items.create', (payload, meta) =>
		applyTour(payload as Record<string, unknown>, meta)
	);
	filter('tours.items.update', (payload, meta) =>
		applyTour(payload as Record<string, unknown>, meta)
	);

	filter('tour_steps.items.create', (payload) =>
		normalizeTourStepItemPayload(payload as Record<string, unknown>)
	);
	filter('tour_steps.items.update', (payload) =>
		normalizeTourStepItemPayload(payload as Record<string, unknown>)
	);
});
