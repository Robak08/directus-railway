export type TourStepPayload = Record<string, unknown> & {
	tour_id?: string | null;
};

export type TourPayloadWithSteps = Record<string, unknown> & {
	steps?: TourStepPayload[];
};

/** Studio O2M saves often omit hidden parent FK; fill before NOT NULL validation. */
export function injectTourIdOnNestedSteps(
	payload: TourPayloadWithSteps,
	tourId: string | undefined
): TourPayloadWithSteps {
	if (!tourId || !Array.isArray(payload.steps)) {
		return payload;
	}

	for (const step of payload.steps) {
		if (step == null || typeof step !== 'object') {
			continue;
		}
		if (step.tour_id == null) {
			step.tour_id = tourId;
		}
	}

	return payload;
}
