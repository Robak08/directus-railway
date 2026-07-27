export type NestedAlterations = {
	create?: Record<string, unknown>[];
	update?: Record<string, unknown>[];
	delete?: (string | number)[];
};

function isNestedAlterations(value: unknown): value is NestedAlterations {
	if (value == null || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	return 'create' in value || 'update' in value || 'delete' in value;
}

function setParentFkIfNull(
	record: Record<string, unknown>,
	field: string,
	parentId: string | number
): void {
	if (record[field] == null) {
		record[field] = parentId;
	}
}

function injectTranslationsParent(
	translations: unknown,
	parentField: string,
	parentId: string | number | undefined
): void {
	if (parentId == null || parentId === '') {
		return;
	}

	if (Array.isArray(translations)) {
		for (const row of translations) {
			if (row != null && typeof row === 'object') {
				setParentFkIfNull(row as Record<string, unknown>, parentField, parentId);
			}
		}
		return;
	}

	if (!isNestedAlterations(translations)) {
		return;
	}

	for (const bucket of ['create', 'update'] as const) {
		const items = translations[bucket];
		if (!Array.isArray(items)) {
			continue;
		}
		for (const row of items) {
			if (row != null && typeof row === 'object') {
				setParentFkIfNull(row, parentField, parentId);
			}
		}
	}
}

function normalizeStepRecord(step: Record<string, unknown>, tourId: string): void {
	setParentFkIfNull(step, 'tour_id', tourId);

	const stepId = step.id;
	if (stepId != null && step.translations != null) {
		injectTranslationsParent(
			step.translations,
			'tour_steps_id',
			typeof stepId === 'string' || typeof stepId === 'number' ? stepId : undefined
		);
	}
}

function forEachStepRecord(
	steps: unknown,
	visit: (step: Record<string, unknown>) => void
): void {
	if (steps == null) {
		return;
	}

	if (Array.isArray(steps)) {
		for (const step of steps) {
			if (step != null && typeof step === 'object' && !Array.isArray(step)) {
				visit(step as Record<string, unknown>);
			}
		}
		return;
	}

	if (!isNestedAlterations(steps)) {
		return;
	}

	for (const bucket of ['create', 'update'] as const) {
		const items = steps[bucket];
		if (!Array.isArray(items)) {
			continue;
		}
		for (const step of items) {
			if (step != null && typeof step === 'object') {
				visit(step);
			}
		}
	}
}

/** Studio nested saves often omit hidden parent FKs or send explicit null. */
export function normalizeTourSavePayload(
	payload: Record<string, unknown>,
	tourId: string | undefined
): Record<string, unknown> {
	if (!tourId) {
		return payload;
	}

	if (payload.translations != null) {
		injectTranslationsParent(payload.translations, 'tours_id', tourId);
	}

	forEachStepRecord(payload.steps, (step) => normalizeStepRecord(step, tourId));

	return payload;
}

/** On direct tour_steps writes, drop explicit null parent FK so partial updates do not clear it. */
export function normalizeTourStepItemPayload(
	payload: Record<string, unknown>
): Record<string, unknown> {
	if (payload.tour_id === null) {
		delete payload.tour_id;
	}

	if (payload.translations != null) {
		const stepId = payload.id;
		const parentId =
			typeof stepId === 'string' || typeof stepId === 'number' ? stepId : undefined;
		if (parentId != null) {
			injectTranslationsParent(payload.translations, 'tour_steps_id', parentId);
		}
	}

	return payload;
}
