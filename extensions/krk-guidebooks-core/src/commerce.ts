import type { GuidebookCapability } from './access.js';

export type CheckoutSessionLike = {
	id: string;
	status?: string | null;
	payment_status?: string | null;
	metadata?: Record<string, string | null | undefined> | null;
	client_reference_id?: string | null;
};

export const isPaidCheckoutSession = (session: unknown): session is CheckoutSessionLike => {
	if (!session || typeof session !== 'object') {
		return false;
	}
	const s = session as CheckoutSessionLike;
	if (typeof s.id !== 'string') {
		return false;
	}
	if (s.payment_status === 'paid') {
		return true;
	}
	if (s.status === 'complete') {
		return s.payment_status !== 'unpaid';
	}
	return false;
};

export type OfferRecord = {
	id: string;
	guidebook_id: string;
	slug: string;
	status: string;
	capabilities: GuidebookCapability[];
	stripe_price_id: string | null;
	stripe_mode: 'payment' | 'subscription';
};

export const resolveCapabilitiesFromOffer = (offer: OfferRecord): GuidebookCapability[] => {
	if (Array.isArray(offer.capabilities) && offer.capabilities.length > 0) {
		return offer.capabilities;
	}
	return offer.stripe_mode === 'subscription' ? ['catalog'] : ['catalog', 'pdf'];
};

export type StripeEventLedgerInput = {
	stripe_event_id: string;
	event_type: string;
	status: 'received' | 'processing' | 'processed' | 'ignored' | 'failed';
};
