import { describe, expect, it } from 'vitest';
import {
	buildMailerLiteSubscriberParams,
	MAILERLITE_GROUP_IDS,
	resolveCheckoutEmail,
	splitCustomerName,
	type StripeCheckoutSessionObject
} from '../../src/mailerlite-guidebook-payload.ts';

describe('splitCustomerName', () => {
	it('splits first and last name', () => {
		expect(splitCustomerName('Anna Virtanen')).toEqual({
			firstName: 'Anna',
			lastName: 'Virtanen'
		});
	});

	it('handles single name', () => {
		expect(splitCustomerName('Anna')).toEqual({
			firstName: 'Anna',
			lastName: null
		});
	});

	it('handles empty name', () => {
		expect(splitCustomerName('')).toEqual({
			firstName: null,
			lastName: null
		});
	});
});

describe('buildMailerLiteSubscriberParams', () => {
	const baseSession: StripeCheckoutSessionObject = {
		customer_details: {
			email: 'buyer@example.com',
			name: 'Anna Virtanen'
		}
	};

	it('maps default buyer groups', () => {
		const params = buildMailerLiteSubscriberParams(baseSession, 'buyer@example.com');

		expect(params.groups).toEqual([
			MAILERLITE_GROUP_IDS.buyersVersionTwo,
			MAILERLITE_GROUP_IDS.buyers,
			MAILERLITE_GROUP_IDS.krakowTips
		]);
		expect(params.fields).toEqual({ name: 'Anna', last_name: 'Virtanen' });
		expect(params.email).toBe('buyer@example.com');
		expect(params.status).toBe('active');
		expect(params.subscribed_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
	});

	it('adds murals group for mural bonus code', () => {
		const session: StripeCheckoutSessionObject = {
			...baseSession,
			custom_fields: [
				{
					key: 'bonus',
					label: { custom: 'Bonus', type: 'text' },
					text: {
						default_value: null,
						maximum_length: null,
						minimum_length: null,
						value: 'muraali'
					},
					type: 'text'
				}
			]
		};

		const params = buildMailerLiteSubscriberParams(session, 'buyer@example.com');
		expect(params.groups).toContain(MAILERLITE_GROUP_IDS.murals);
	});

	it('adds murals group for muurali bonus spelling', () => {
		const session: StripeCheckoutSessionObject = {
			...baseSession,
			custom_fields: [
				{
					key: 'bonus',
					label: { custom: 'Bonus', type: 'text' },
					text: {
						default_value: null,
						maximum_length: null,
						minimum_length: null,
						value: 'Muurali'
					},
					type: 'text'
				}
			]
		};

		const params = buildMailerLiteSubscriberParams(session, 'buyer@example.com');
		expect(params.groups).toContain(MAILERLITE_GROUP_IDS.murals);
	});
});

describe('resolveCheckoutEmail', () => {
	it('prefers customer_details email', () => {
		expect(
			resolveCheckoutEmail({
				customer_details: { email: 'details@example.com' },
				customer_email: 'fallback@example.com'
			})
		).toBe('details@example.com');
	});

	it('falls back to customer_email', () => {
		expect(
			resolveCheckoutEmail({
				customer_email: 'fallback@example.com'
			})
		).toBe('fallback@example.com');
	});
});
