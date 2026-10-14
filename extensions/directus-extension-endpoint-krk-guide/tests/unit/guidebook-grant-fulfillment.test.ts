import { describe, expect, it } from 'vitest';
import {
	admitStripeWebhookEvent,
	fulfillGuidebookGrantFromCheckout,
	markStripeWebhookEventStatus,
	resolveOfferForSession
} from '../../src/guidebook-grant-fulfillment.ts';
import type { GuideWebhookServices } from '../../src/guidebook-grant-fulfillment.ts';

const offer = {
	id: 'offer-1',
	guidebook_id: 'guide-1',
	slug: 'krakow-lifetime',
	status: 'active',
	capabilities: ['catalog', 'pdf'] as const,
	stripe_price_id: 'price_1',
	stripe_mode: 'payment' as const
};

const createMockServices = (): {
	services: GuideWebhookServices;
	ledger: Record<string, unknown>[];
	grants: Record<string, unknown>[];
	access: Record<string, unknown>[];
	offers: Record<string, unknown>[];
} => {
	const ledger: Record<string, unknown>[] = [];
	const grants: Record<string, unknown>[] = [];
	const access: Record<string, unknown>[] = [];
	const offers: Record<string, unknown>[] = [offer];

	class ItemsService {
		collection: string;

		constructor(collection: string) {
			this.collection = collection;
		}

		async readByQuery(query: Record<string, unknown>): Promise<Record<string, unknown>[]> {
			const filter = query.filter as Record<string, unknown>;
			const rows =
				this.collection === 'stripe_webhook_events'
					? ledger
					: this.collection === 'customer_guidebook_grants'
						? grants
						: this.collection === 'customer_guidebook_access'
							? access
							: this.collection === 'guidebook_offers'
								? offers
								: [];

			if (!filter) return rows;

			return rows.filter((row) => {
				if ('stripe_event_id' in filter) {
					const clause = filter.stripe_event_id as { _eq: string };
					return row.stripe_event_id === clause._eq;
				}

				if ('_and' in filter) {
					const clauses = filter._and as Record<string, unknown>[];
					return clauses.every((clause) => {
						const key = Object.keys(clause)[0];
						const op = clause[key] as { _eq: unknown };
						return row[key] === op._eq;
					});
				}

				return true;
			});
		}

		async readOne(key: string): Promise<Record<string, unknown>> {
			const row = offers.find((entry) => entry.id === key);
			if (!row) throw new Error('not found');
			return row;
		}

		async createOne(data: Record<string, unknown>): Promise<Record<string, unknown>> {
			const row = { id: `${this.collection}-${Date.now()}`, ...data };
			if (this.collection === 'stripe_webhook_events') ledger.push(row);
			if (this.collection === 'customer_guidebook_grants') grants.push(row);
			if (this.collection === 'customer_guidebook_access') access.push(row);
			return row;
		}

		async updateOne(key: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
			const rows =
				this.collection === 'stripe_webhook_events'
					? ledger
					: this.collection === 'customer_guidebook_grants'
						? grants
						: access;
			const index = rows.findIndex((row) => row.id === key);
			if (index === -1) throw new Error('not found');
			rows[index] = { ...rows[index], ...data };
			return rows[index];
		}
	}

	const services = {
		ItemsService,
		UsersService: class {
			async readByQuery() {
				return [];
			}
		}
	} as GuideWebhookServices;

	return { services, ledger, grants, access, offers };
};

describe('admitStripeWebhookEvent', () => {
	it('admits a new event', async () => {
		const { services, ledger } = createMockServices();
		const admission = await admitStripeWebhookEvent({
			services,
			getSchema: async () => ({}),
			stripeEventId: 'evt_1',
			eventType: 'checkout.session.completed'
		});

		expect(admission).toBe('new');
		expect(ledger).toHaveLength(1);
		expect(ledger[0].status).toBe('processing');
	});

	it('returns duplicate for processed events', async () => {
		const { services, ledger } = createMockServices();
		ledger.push({ id: 'ledger-1', stripe_event_id: 'evt_1', status: 'processed' });

		const admission = await admitStripeWebhookEvent({
			services,
			getSchema: async () => ({}),
			stripeEventId: 'evt_1',
			eventType: 'checkout.session.completed'
		});

		expect(admission).toBe('duplicate');
	});

	it('returns retry for failed events', async () => {
		const { services, ledger } = createMockServices();
		ledger.push({ id: 'ledger-1', stripe_event_id: 'evt_1', status: 'failed' });

		const admission = await admitStripeWebhookEvent({
			services,
			getSchema: async () => ({}),
			stripeEventId: 'evt_1',
			eventType: 'checkout.session.completed'
		});

		expect(admission).toBe('retry');
		expect(ledger[0].status).toBe('processing');
	});
});

describe('resolveOfferForSession', () => {
	it('returns active offer from metadata', async () => {
		const { services } = createMockServices();
		const resolved = await resolveOfferForSession({
			services,
			getSchema: async () => ({}),
			session: { metadata: { offer_id: 'offer-1' } }
		});

		expect(resolved?.id).toBe('offer-1');
	});

	it('ignores inactive offers', async () => {
		const { services, offers } = createMockServices();
		offers[0] = { ...offer, status: 'archived' };

		const resolved = await resolveOfferForSession({
			services,
			getSchema: async () => ({}),
			session: { metadata: { offer_id: 'offer-1' } }
		});

		expect(resolved).toBeNull();
	});
});

describe('fulfillGuidebookGrantFromCheckout', () => {
	it('creates grant and access projection for paid session', async () => {
		const { services, grants, access } = createMockServices();

		await fulfillGuidebookGrantFromCheckout({
			services,
			getSchema: async () => ({}),
			session: { id: 'cs_1', payment_status: 'paid' },
			userId: 'user-1',
			offer
		});

		expect(grants).toHaveLength(1);
		expect(grants[0].source_id).toBe('cs_1');
		expect(access).toHaveLength(1);
		expect(access[0].can_catalog).toBe(true);
	});

	it('is idempotent for duplicate checkout session', async () => {
		const { services, grants } = createMockServices();

		await fulfillGuidebookGrantFromCheckout({
			services,
			getSchema: async () => ({}),
			session: { id: 'cs_1', payment_status: 'paid' },
			userId: 'user-1',
			offer
		});
		await fulfillGuidebookGrantFromCheckout({
			services,
			getSchema: async () => ({}),
			session: { id: 'cs_1', payment_status: 'paid' },
			userId: 'user-1',
			offer
		});

		expect(grants).toHaveLength(1);
	});

	it('rejects unpaid sessions', async () => {
		const { services } = createMockServices();

		await expect(
			fulfillGuidebookGrantFromCheckout({
				services,
				getSchema: async () => ({}),
				session: { id: 'cs_1', payment_status: 'unpaid' },
				userId: 'user-1',
				offer
			})
		).rejects.toThrow(/Unpaid/);
	});
});

describe('markStripeWebhookEventStatus', () => {
	it('updates ledger status', async () => {
		const { services, ledger } = createMockServices();
		ledger.push({ id: 'ledger-1', stripe_event_id: 'evt_1', status: 'processing' });

		await markStripeWebhookEventStatus({
			services,
			getSchema: async () => ({}),
			stripeEventId: 'evt_1',
			status: 'failed'
		});

		expect(ledger[0].status).toBe('failed');
	});
});
