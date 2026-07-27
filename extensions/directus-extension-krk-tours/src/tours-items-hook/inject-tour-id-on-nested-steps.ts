import { normalizeTourSavePayload } from './normalize-tour-save-payload.js';

export type TourStepPayload = Record<string, unknown> & {
	tour_id?: string | null;
};

export type TourPayloadWithSteps = Record<string, unknown> & {
	steps?: TourStepPayload[];
};

/** @deprecated Use normalizeTourSavePayload */
export function injectTourIdOnNestedSteps(
	payload: TourPayloadWithSteps,
	tourId: string | undefined
): TourPayloadWithSteps {
	return normalizeTourSavePayload(payload, tourId) as TourPayloadWithSteps;
}
