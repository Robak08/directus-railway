import { describe, expect, it } from 'vitest';
import { directusState } from '../../src/guidebooks/scaffold/directus-state-data.js';
import {
	GUIDEBOOK_BRANDING_FIELDS_BASE,
	GUIDEBOOK_BRANDING_FIELDS_WITH_PDF,
	PUBLISHED_GUIDEBOOK_LISTING_FIELDS
} from '../../src/guidebooks/endpoint/guidebook-query-fields.js';

const guidebookScalarFields = new Set(
	directusState.fields
		.filter((field) => field.collection === 'guidebooks' && field.type !== 'alias')
		.map((field) => field.field)
);

describe('guidebook public endpoint field lists', () => {
	it('listing fields are defined on guidebooks in scaffold state', () => {
		for (const field of PUBLISHED_GUIDEBOOK_LISTING_FIELDS) {
			expect(guidebookScalarFields.has(field), `missing guidebooks.${field}`).toBe(true);
		}
	});

	it('branding fields are defined on guidebooks in scaffold state', () => {
		for (const field of GUIDEBOOK_BRANDING_FIELDS_WITH_PDF) {
			expect(guidebookScalarFields.has(field), `missing guidebooks.${field}`).toBe(true);
		}
	});

	it('branding base fields omit pdf metadata only', () => {
		expect(GUIDEBOOK_BRANDING_FIELDS_BASE).toEqual(
			GUIDEBOOK_BRANDING_FIELDS_WITH_PDF.filter(
				(field) => field !== 'pdf_version' && field !== 'pdf_updated'
			)
		);
	});
});
