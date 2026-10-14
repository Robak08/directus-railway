import type { Accountability } from '@directus/types';
import {
	isPaidCheckoutSession,
	resolveCapabilitiesFromOffer,
	type OfferRecord,
	upsertGrant,
	rebuildAccessForUserGuidebook,
	type DirectusServices
} from '@krk/guidebooks-core';

const adminAccountability = (): Accountability => ({
	user: null,
	role: null,
	roles: [],
	admin: true,
	app: false,
	ip: null
});

type ItemsServiceLike = {
	readByQuery: (query: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
	readOne: (key: string) => Promise<Record<string, unknown>>;
	createOne: (data: Record<string, unknown>) => Promise<Record<string, unknown>>;
	updateOne: (key: string, data: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

export type GuideWebhookServices = DirectusServices & {
	UsersService: new (options: { schema: unknown; accountability?: Accountability | null }) => {
		readByQuery: (query: Record<string, unknown>) => Promise<{ id: string; email: string | null }[]>;
	};
};

export type WebhookLedgerAdmission = 'new' | 'retry' | 'duplicate';

const isTerminalWebhookStatus = (status: unknown): boolean =>
	status === 'processed' || status === 'ignored';

const isActiveOffer = (offer: OfferRecord): boolean => offer.status === 'active';

export const admitStripeWebhookEvent = async (params: {
	services: GuideWebhookServices;
	getSchema: () => Promise<unknown>;
	stripeEventId: string;
	eventType: string;
}): Promise<WebhookLedgerAdmission> => {
	const schema = await params.getSchema();
	const items = new params.services.ItemsService('stripe_webhook_events', {
		schema: schema as object,
		accountability: adminAccountability()
	});

	const existing = await items.readByQuery({
		filter: { stripe_event_id: { _eq: params.stripeEventId } },
		limit: 1
	});

	const row = existing[0];
	if (row) {
		if (isTerminalWebhookStatus(row.status)) {
			return 'duplicate';
		}

		await items.updateOne(String(row.id), {
			status: 'processing',
			event_type: params.eventType
		});
		return 'retry';
	}

	await items.createOne({
		stripe_event_id: params.stripeEventId,
		event_type: params.eventType,
		status: 'processing'
	});

	return 'new';
};

export const markStripeWebhookEventStatus = async (params: {
	services: GuideWebhookServices;
	getSchema: () => Promise<unknown>;
	stripeEventId: string;
	status: 'processed' | 'ignored' | 'failed';
}): Promise<void> => {
	const schema = await params.getSchema();
	const items = new params.services.ItemsService('stripe_webhook_events', {
		schema: schema as object,
		accountability: adminAccountability()
	});

	const existing = await items.readByQuery({
		filter: { stripe_event_id: { _eq: params.stripeEventId } },
		limit: 1
	});

	if (existing.length === 0) {
		return;
	}

	const row = existing[0];
	if (!row) {
		return;
	}

	await items.updateOne(String(row.id), {
		status: params.status
	});
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
		schema: schema as object,
		accountability: adminAccountability()
	}) as ItemsServiceLike;

	if (offerId && offerId !== 'legacy-env-price') {
		try {
			const offer = (await items.readOne(offerId)) as OfferRecord;
			return isActiveOffer(offer) ? offer : null;
		} catch {
			// fall through
		}
	}

	const rows = (await items.readByQuery({
		filter: {
			_and: [{ slug: { _eq: 'krakow-lifetime' } }, { status: { _eq: 'active' } }]
		},
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
		schema: schema as object,
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

	if (!isActiveOffer(params.offer)) {
		throw new Error('Offer is not active');
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
