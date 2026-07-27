import { describe, expect, it } from 'vitest';

import {
	fieldSpecialContainsM2m,
	junctionFieldMetaNeedsRepair
} from '../../src/scaffold/reconcile-junction-field-meta.js';

describe('junctionFieldMetaNeedsRepair', () => {
	it('flags list-m2m interface on junction scalar FK', () => {
		expect(
			junctionFieldMetaNeedsRepair(
				{ interface: 'list-m2m', hidden: false, special: null },
				{ hidden: true, interface: null }
			)
		).toBe(true);
	});

	it('flags special m2m on junction scalar', () => {
		expect(
			junctionFieldMetaNeedsRepair(
				{ interface: null, hidden: true, special: ['m2m'] },
				{ hidden: true, interface: null }
			)
		).toBe(true);
	});

	it('passes when meta matches desired hidden scalar', () => {
		expect(
			junctionFieldMetaNeedsRepair(
				{ interface: null, hidden: true, special: null },
				{ hidden: true, interface: null }
			)
		).toBe(false);
	});
});

describe('fieldSpecialContainsM2m', () => {
	it('detects m2m in array special', () => {
		expect(fieldSpecialContainsM2m(['m2m'])).toBe(true);
		expect(fieldSpecialContainsM2m(['cast-json'])).toBe(false);
	});
});
