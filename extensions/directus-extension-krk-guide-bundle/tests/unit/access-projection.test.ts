import { describe, expect, it } from 'vitest';
import {
	grantIsEffectiveNow,
	projectAccessForGuidebook,
	type GrantRecord
} from '../../src/core/index.js';

describe('access projection', () => {
	it('merges lifetime purchase and subscription capabilities', () => {
		const grants: GrantRecord[] = [
			{
				id: '1',
				user_id: 'u1',
				guidebook_id: 'g1',
				capabilities: ['catalog', 'pdf'],
				status: 'active',
				source_type: 'migration',
				source_id: 'a',
				valid_from: null,
				valid_until: null
			},
			{
				id: '2',
				user_id: 'u1',
				guidebook_id: 'g1',
				capabilities: ['catalog'],
				status: 'revoked',
				source_type: 'stripe_subscription',
				source_id: 'b',
				valid_from: null,
				valid_until: null
			}
		];

		const projection = projectAccessForGuidebook('u1', 'g1', grants);
		expect(projection.can_catalog).toBe(true);
		expect(projection.can_pdf).toBe(true);
	});

	it('ignores inactive grants', () => {
		const grant: GrantRecord = {
			id: '1',
			user_id: 'u1',
			guidebook_id: 'g1',
			capabilities: ['catalog', 'pdf'],
			status: 'refunded',
			source_type: 'stripe_checkout',
			source_id: 'sess',
			valid_from: null,
			valid_until: null
		};
		expect(grantIsEffectiveNow(grant)).toBe(false);
	});
});
