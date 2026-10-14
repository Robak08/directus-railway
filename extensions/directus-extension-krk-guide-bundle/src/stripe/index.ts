import { defineEndpoint } from '@directus/extensions-sdk';
import Stripe from 'stripe';
import type { Accountability } from '@directus/types';
import type { OfferRecord } from '../core/index.js';
import type { DirectusRequest } from './directus-request.js';

const DEFAULT_APP_ORIGIN = 'https://app.krakovanopas.fi';
const CHECKOUT_SERVICE_HEADER = 'x-checkout-service-key';

type CheckoutSessionBody = {
	successUrl?: string;
	cancelUrl?: string;
	locale?: string;
	offerSlug?: string;
	guidebookSlug?: string;
};

const adminAccountability = (): Accountability => ({
	user: null,
	role: null,
	roles: [],
	admin: true,
	app: false,
	ip: null
});

const isNonEmptyString = (value: unknown): value is string =>
	typeof value === 'string' && value.trim().length > 0;

const resolveAppOrigin = (): string => {
	const configured = process.env.APP_ORIGIN?.trim();
	return configured && configured.length > 0 ? configured.replace(/\/$/, '') : DEFAULT_APP_ORIGIN;
};

const resolveCheckoutServiceSecret = (): string | null => {
	const configured = process.env.CHECKOUT_SERVICE_SECRET?.trim();
	return configured && configured.length > 0 ? configured : null;
};

const allowLegacyEnvPrice = (): boolean => {
	const raw = process.env.CHECKOUT_ALLOW_LEGACY_ENV_PRICE?.trim();
	return raw === 'true' || raw === '1';
};

const isAllowedRedirect = (url: string, origin: string): boolean => {
	try {
		return new URL(url).origin === new URL(origin).origin;
	} catch {
		return false;
	}
};

const resolveCheckoutUrls = (body: CheckoutSessionBody, origin: string) => {
	const successUrl = isNonEmptyString(body.successUrl)
		? body.successUrl.trim()
		: `${origin}/osto/onnistui?session_id={CHECKOUT_SESSION_ID}`;
	const cancelUrl = isNonEmptyString(body.cancelUrl)
		? body.cancelUrl.trim()
		: `${origin}/osto/peruutettu`;

	if (!isAllowedRedirect(successUrl, origin) || !isAllowedRedirect(cancelUrl, origin)) {
		throw new Error('Redirect URLs must stay on the configured APP_ORIGIN');
	}

	return { successUrl, cancelUrl };
};

const resolveOfferBySlug = async (params: {
	services: {
		ItemsService: new (
			collection: string,
			options: { schema: unknown; accountability?: Accountability | null }
		) => {
			readByQuery: (query: Record<string, unknown>) => Promise<OfferRecord[]>;
		};
	};
	getSchema: () => Promise<unknown>;
	offerSlug: string;
}): Promise<OfferRecord | null> => {
	const schema = await params.getSchema();
	const items = new params.services.ItemsService('guidebook_offers', {
		schema,
		accountability: adminAccountability()
	});

	const rows = await items.readByQuery({
		filter: {
			_and: [{ slug: { _eq: params.offerSlug } }, { status: { _eq: 'active' } }]
		},
		limit: 1
	});

	return rows[0] ?? null;
};

const resolveDefaultOfferSlug = (body: CheckoutSessionBody): string => {
	if (isNonEmptyString(body.offerSlug)) {
		return body.offerSlug.trim();
	}

	if (body.guidebookSlug === 'krakow') {
		return 'krakow-lifetime';
	}

	return 'krakow-lifetime';
};

const isGuestCheckoutAuthorized = (req: {
	headers: Record<string, string | string[] | undefined>;
}): boolean => {
	const secret = resolveCheckoutServiceSecret();
	if (!secret) {
		return false;
	}

	const header = req.headers[CHECKOUT_SERVICE_HEADER];
	const provided = Array.isArray(header) ? header[0] : header;
	return typeof provided === 'string' && provided === secret;
};

export default defineEndpoint((router, { services, getSchema }) => {
	router.post('/checkout-session', async (req, res) => {
		const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
		if (!stripeSecretKey) {
			res.status(500).send({ error: 'STRIPE_SECRET_KEY is not configured' });
			return;
		}

		const directusReq = req as DirectusRequest;
		const userId = directusReq.accountability?.user;
		const guestAuthorized = !userId && isGuestCheckoutAuthorized(req);

		if (!userId && !guestAuthorized) {
			res.status(401).send({ error: 'Authentication required' });
			return;
		}

		const body = (req.body ?? {}) as CheckoutSessionBody;
		const origin = resolveAppOrigin();

		let checkoutUrls: { successUrl: string; cancelUrl: string };
		try {
			checkoutUrls = resolveCheckoutUrls(body, origin);
		} catch (error: unknown) {
			res.status(400).send({ error: error instanceof Error ? error.message : 'Invalid URLs' });
			return;
		}

		const offerSlug = resolveDefaultOfferSlug(body);
		const offer = await resolveOfferBySlug({
			services: services as Parameters<typeof resolveOfferBySlug>[0]['services'],
			getSchema,
			offerSlug
		});

		if (!offer?.stripe_price_id) {
			if (!allowLegacyEnvPrice()) {
				res.status(400).send({ error: 'Active offer or Stripe price not configured' });
				return;
			}
		}

		const fallbackPrice = process.env.STRIPE_GUIDEBOOK_PRICE_ID;
		const priceId = offer?.stripe_price_id ?? fallbackPrice;

		if (!priceId) {
			res.status(400).send({ error: 'Active offer or Stripe price not configured' });
			return;
		}

		const locale = isNonEmptyString(body.locale) ? body.locale.trim() : 'fi';
		const guidebookId = offer?.guidebook_id ?? body.guidebookSlug ?? 'unknown';
		const offerId = offer?.id ?? 'legacy-env-price';
		const metadata: Record<string, string> = {
			source: userId ? 'app' : 'app_guest',
			guidebook_id: String(guidebookId),
			offer_id: String(offerId)
		};

		if (userId) {
			metadata.directus_user_id = String(userId);
		}

		try {
			const stripe = new Stripe(stripeSecretKey);
			const session = await stripe.checkout.sessions.create({
				mode: offer?.stripe_mode === 'subscription' ? 'subscription' : 'payment',
				line_items: [{ price: priceId, quantity: 1 }],
				success_url: checkoutUrls.successUrl,
				cancel_url: checkoutUrls.cancelUrl,
				locale: locale === 'fi' || locale === 'en' ? locale : 'fi',
				customer_creation: 'always',
				...(userId ? { client_reference_id: String(userId) } : {}),
				metadata
			});

			if (!session.url) {
				res.status(500).send({ error: 'Stripe did not return a checkout URL' });
				return;
			}

			res.send({ url: session.url, sessionId: session.id });
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Checkout session creation failed';
			res.status(500).send({ error: message });
		}
	});

	router.get('/checkout-session/:sessionId/status', async (req, res) => {
		if (!isGuestCheckoutAuthorized(req)) {
			res.status(403).send({ error: 'Forbidden' });
			return;
		}

		const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
		if (!stripeSecretKey) {
			res.status(500).send({ error: 'STRIPE_SECRET_KEY is not configured' });
			return;
		}

		const sessionId = req.params.sessionId?.trim();
		if (!sessionId) {
			res.status(400).send({ error: 'Missing session id' });
			return;
		}

		try {
			const stripe = new Stripe(stripeSecretKey);
			const session = await stripe.checkout.sessions.retrieve(sessionId);
			const paid = session.payment_status === 'paid' || session.status === 'complete';

			const schema = await getSchema();
			const grants = new services.ItemsService('customer_guidebook_grants', {
				schema,
				accountability: adminAccountability()
			});
			const grantRows = await grants.readByQuery({
				filter: {
					_and: [
						{ source_type: { _eq: 'stripe_checkout' } },
						{ source_id: { _eq: sessionId } }
					]
				},
				limit: 1
			});

			res.send({
				paid,
				complete: session.status === 'complete',
				fulfillment: grantRows.length > 0 ? 'granted' : paid ? 'pending' : 'unknown'
			});
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Status lookup failed';
			res.status(500).send({ error: message });
		}
	});

	router.post('/billing-portal', async (req, res) => {
		const userId = (req as DirectusRequest).accountability?.user;
		if (!userId) {
			res.status(401).send({ error: 'Authentication required' });
			return;
		}

		const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
		if (!stripeSecretKey) {
			res.status(500).send({ error: 'STRIPE_SECRET_KEY is not configured' });
			return;
		}

		const schema = await getSchema();
		const profiles = new services.ItemsService('customer_profiles', {
			schema,
			accountability: adminAccountability()
		});

		const rows = await profiles.readByQuery({
			filter: { user_id: { _eq: userId } },
			limit: 1,
			fields: ['stripe_customer_id']
		});

		const stripeCustomerId = rows[0]?.stripe_customer_id;
		if (!stripeCustomerId || typeof stripeCustomerId !== 'string') {
			res.status(400).send({ error: 'Stripe customer not found' });
			return;
		}

		const origin = resolveAppOrigin();
		const returnUrl =
			process.env.STRIPE_BILLING_PORTAL_RETURN_URL?.trim() || `${origin}/oma-tili/profiili`;

		try {
			const stripe = new Stripe(stripeSecretKey);
			const portal = await stripe.billingPortal.sessions.create({
				customer: stripeCustomerId,
				return_url: returnUrl
			});
			res.send({ url: portal.url });
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Billing portal failed';
			res.status(500).send({ error: message });
		}
	});
});
