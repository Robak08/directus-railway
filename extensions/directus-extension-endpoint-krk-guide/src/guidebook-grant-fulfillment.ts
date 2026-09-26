import type { Accountability } from '@directus/types';
import {
	isPaidCheckoutSession,
	resolveCapabilitiesFromOffer,
	type OfferRecord
} from '@krk/guidebooks-core';
import type { GrantRecord } from '@krk/guidebooks-core';
import { projectAccessForGuidebook } from '@krk/guidebooks-core';

const adminAccountability = (): Accountability => ({
	user: null,
	role: null,
	admin: true,
	app: false,
	ip: null,
	origin: null
});

type ItemsServiceLike = {
	readByQuery: (query: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
	readOne: (key: string) => Promise<Record<string, unknown>>;
	createOne: (data: Record<string, unknown>) => Promise<Record<string, unknown>>;
	updateOne: (key: string, data: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

export type GuideWebhookServices = {
	ItemsService: new (
		collection: string,
		options: { schema: unknown; accountability?: Accountability | null }
	) => ItemsServiceLike;
	UsersService: new (options: { schema: unknown; accountability?: Accountability | null }) => {
		readByQuery: (query: Record<string, unknown>) => Promise<{ id: string; email: string | null }[]>;
	};
};

export const recordStripeWebhookEvent = async (params: {
	services: GuideWebhookServices;
	getSchema: () => Promise<unknown>;
	stripeEventId: string;
	eventType: string;
}): Promise<'new' | 'duplicate'> => {
	const schema = await params.getSchema();
	const items = new params.services.ItemsService('stripe_webhook_events', {
		schema,
		accountability: adminAccountability()
	});

	const existing = await items.readByQuery({
		filter: { stripe_event_id: { _eq: params.stripeEventId } },
		limit: 1
	});

	if (existing.length > 0) return 'duplicate';

	await items.createOne({
		stripe_event_id: params.stripeEventId,
		event_type: params.eventType,
		status: 'received'
	});

	return 'new';
};

export const resolveOfferForSession = async (params: {
	services: GuideWebhookServices;
	getSchema: () => Promise<unknown>;
	session: {
		metadata?: Record<string, string | null | undefined> | null;
	};
}): Promise<OfferRecord | null> => {
	const offerId = params.session.metadata?.offer_id;
	const schema = await params.getSchema();
	const items = new params.services.ItemsService('guidebook_offers', {
		schema,
		accountability: adminAccountability()
	});

	if (offerId && offerId !== 'legacy-env-price') {
		try {
			return (await items.readOne(offerId)) as OfferRecord;
		} catch {
			// fall through
		}
	}

	const rows = (await items.readByQuery({
		filter: { slug: { _eq: 'krakow-lifetime' } },
		limit: 1
	})) as OfferRecord[];

	return rows[0] ?? null;
};

export const resolveDirectusUserIdForSession = async (params: {
	services: GuideWebhookServices;
	getSchema: () => Promise<unknown>;
	session: {
		client_reference_id?: string | null;
		metadata?: Record<string, string | null | undefined> | null;
	};
	email: string;
}): Promise<string | null> => {
	const fromMetadata = params.session.metadata?.directus_user_id;
	if (typeof fromMetadata === 'string' && fromMetadata.length > 0) {
		return fromMetadata;
	}

	if (params.session.client_reference_id) {
		return params.session.client_reference_id;
	}

	const schema = await params.getSchema();
	const users = new params.services.UsersService({
		schema,
		accountability: adminAccountability()
	});

	const rows = await users.readByQuery({
		filter: { email: { _eq: params.email.toLowerCase() } },
		limit: 1
	});

	return rows[0]?.id ?? null;
};

export const fulfillGuidebookGrantFromCheckout = async (params: {
	services: GuideWebhookServices;
	getSchema: () => Promise<unknown>;
	session: {
		id: string;
		status?: string | null;
		payment_status?: string | null;
		metadata?: Record<string, string | null | undefined> | null;
		client_reference_id?: string | null;
	};
	userId: string;
	offer: OfferRecord;
}): Promise<void> => {
	if (!isPaidCheckoutSession(params.session)) {
		throw new Error('Unpaid checkout session');
	}

	const schema = await params.getSchema();
	const accountability = adminAccountability();
	const grants = new params.services.ItemsService('customer_guidebook_grants', {
		schema,
		accountability
	});
	const access = new params.services.ItemsService('customer_guidebook_access', {
		schema,
		accountability
	});

	const capabilities = resolveCapabilitiesFromOffer(params.offer);
	const existing = await grants.readByQuery({
		filter: {
			_and: [
				{ source_type: { _eq: 'stripe_checkout' } },
				{ source_id: { _eq: params.session.id } },
				{ guidebook_id: { _eq: params.offer.guidebook_id } }
			]
		},
		limit: 1
	});

	if (existing.length === 0) {
		await grants.createOne({
			user_id: params.userId,
			guidebook_id: params.offer.guidebook_id,
			capabilities,
			status: 'active',
			source_type: 'stripe_checkout',
			source_id: params.session.id,
			offer_id: params.offer.id,
			valid_from: new Date().toISOString(),
			valid_until: null
		});
	}

	const grantRows = (await grants.readByQuery({
		filter: {
			_and: [
				{ user_id: { _eq: params.userId } },
				{ guidebook_id: { _eq: params.offer.guidebook_id } }
			]
		},
		limit: -1
	})) as GrantRecord[];

	const projection = projectAccessForGuidebook(
		params.userId,
		params.offer.guidebook_id,
		grantRows
	);

	const accessRows = await access.readByQuery({
		filter: {
			_and: [
				{ user_id: { _eq: params.userId } },
				{ guidebook_id: { _eq: params.offer.guidebook_id } }
			]
		},
		limit: 1
	});

	const payload = {
		can_catalog: projection.can_catalog,
		can_pdf: projection.can_pdf,
		projection_version: 1,
		reconciled_at: new Date().toISOString()
	};

	if (accessRows.length === 0) {
		await access.createOne({
			user_id: params.userId,
			guidebook_id: params.offer.guidebook_id,
			...payload
		});
	} else {
		await access.updateOne(String(accessRows[0].id), payload);
	}
};
