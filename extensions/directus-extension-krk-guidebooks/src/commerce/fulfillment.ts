import type { Accountability } from '@directus/types';
import {
	isPaidCheckoutSession,
	resolveCapabilitiesFromOffer,
	type OfferRecord
} from '@krk/guidebooks-core';
import {
	rebuildAccessForUserGuidebook,
	upsertGrant,
	type DirectusServices
} from '../access/grant-service.js';

export type CheckoutSessionLike = {
	id: string;
	status?: string | null;
	payment_status?: string | null;
	metadata?: Record<string, string | null | undefined> | null;
	client_reference_id?: string | null;
	customer?: string | null;
};

export const resolveOfferBySlugOrId = async (params: {
	services: DirectusServices;
	getSchema: () => Promise<unknown>;
	offerSlug?: string | null;
	offerId?: string | null;
}): Promise<OfferRecord | null> => {
	const schema = await params.getSchema();
	const items = new params.services.ItemsService('guidebook_offers', {
		schema,
		accountability: { admin: true } as Accountability
	});

	if (params.offerId) {
		try {
			return (await items.readOne(params.offerId)) as OfferRecord;
		} catch {
			return null;
		}
	}

	if (!params.offerSlug) return null;

	const rows = (await items.readByQuery({
		filter: {
			_and: [{ slug: { _eq: params.offerSlug } }, { status: { _eq: 'active' } }]
		},
		limit: 1
	})) as OfferRecord[];

	return rows[0] ?? null;
};

export const fulfillCheckoutSessionGrant = async (params: {
	services: DirectusServices;
	getSchema: () => Promise<unknown>;
	session: CheckoutSessionLike;
	userId: string;
	offer: OfferRecord;
}): Promise<void> => {
	if (!isPaidCheckoutSession(params.session)) {
		throw new Error('Checkout session is not paid');
	}

	const capabilities = resolveCapabilitiesFromOffer(params.offer);

	await upsertGrant({
		services: params.services,
		getSchema: params.getSchema,
		data: {
			user_id: params.userId,
			guidebook_id: params.offer.guidebook_id,
			capabilities,
			source_type: 'stripe_checkout',
			source_id: params.session.id,
			offer_id: params.offer.id,
			status: 'active',
			valid_from: new Date().toISOString(),
			valid_until: null
		}
	});

	await rebuildAccessForUserGuidebook({
		services: params.services,
		getSchema: params.getSchema,
		userId: params.userId,
		guidebookId: params.offer.guidebook_id
	});
};

export const recordStripeWebhookEvent = async (params: {
	services: DirectusServices;
	getSchema: () => Promise<unknown>;
	stripeEventId: string;
	eventType: string;
	status: 'received' | 'processing' | 'processed' | 'ignored' | 'failed';
}): Promise<'new' | 'duplicate'> => {
	const schema = await params.getSchema();
	const items = new params.services.ItemsService('stripe_webhook_events', {
		schema,
		accountability: { admin: true } as Accountability
	});

	const existing = await items.readByQuery({
		filter: { stripe_event_id: { _eq: params.stripeEventId } },
		limit: 1
	});

	if (existing.length > 0) {
		return 'duplicate';
	}

	await items.createOne({
		stripe_event_id: params.stripeEventId,
		event_type: params.eventType,
		status: params.status
	});

	return 'new';
};

export const markStripeWebhookProcessed = async (params: {
	services: DirectusServices;
	getSchema: () => Promise<unknown>;
	stripeEventId: string;
	status: 'processed' | 'ignored' | 'failed';
}): Promise<void> => {
	const schema = await params.getSchema();
	const items = new params.services.ItemsService('stripe_webhook_events', {
		schema,
		accountability: { admin: true } as Accountability
	});

	const existing = await items.readByQuery({
		filter: { stripe_event_id: { _eq: params.stripeEventId } },
		limit: 1
	});

	if (existing.length === 0) return;

	await items.updateOne(existing[0].id, { status: params.status });
};
