import { defineEndpoint } from '@directus/extensions-sdk';
import Stripe from 'stripe';
import type { Accountability } from '@directus/types';
import type { OfferRecord } from '@krk/guidebooks-core';

const DEFAULT_APP_ORIGIN = 'https://app.krakovanopas.fi';

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
	admin: true,
	app: false,
	ip: null,
	origin: null
});

const isNonEmptyString = (value: unknown): value is string =>
	typeof value === 'string' && value.trim().length > 0;

const resolveAppOrigin = (): string => {
	const configured = process.env.APP_ORIGIN?.trim();
	return configured && configured.length > 0 ? configured.replace(/\/$/, '') : DEFAULT_APP_ORIGIN;
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

export default defineEndpoint((router, { services, getSchema }) => {
	router.post('/checkout-session', async (req, res) => {
		const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
		if (!stripeSecretKey) {
			res.status(500).send({ error: 'STRIPE_SECRET_KEY is not configured' });
			return;
		}

		const userId = req.accountability?.user;
		if (!userId) {
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

		const offerSlug =
			body.offerSlug?.trim() ||
			(body.guidebookSlug === 'krakow' ? 'krakow-lifetime' : undefined) ||
			'krakow-lifetime';

		const offer = await resolveOfferBySlug({
			services: services as Parameters<typeof resolveOfferBySlug>[0]['services'],
			getSchema,
			offerSlug
		});

		const fallbackPrice = process.env.STRIPE_GUIDEBOOK_PRICE_ID;
		const priceId = offer?.stripe_price_id ?? fallbackPrice;

		if (!priceId) {
			res.status(400).send({ error: 'Active offer or Stripe price not configured' });
			return;
		}

		const locale = isNonEmptyString(body.locale) ? body.locale.trim() : 'fi';
		const guidebookId = offer?.guidebook_id ?? body.guidebookSlug ?? 'unknown';
		const offerId = offer?.id ?? 'legacy-env-price';

		try {
			const stripe = new Stripe(stripeSecretKey);
			const session = await stripe.checkout.sessions.create({
				mode: offer?.stripe_mode === 'subscription' ? 'subscription' : 'payment',
				line_items: [{ price: priceId, quantity: 1 }],
				success_url: checkoutUrls.successUrl,
				cancel_url: checkoutUrls.cancelUrl,
				locale: locale === 'fi' || locale === 'en' ? locale : 'fi',
				client_reference_id: userId,
				metadata: {
					source: 'app',
					directus_user_id: userId,
					guidebook_id: String(guidebookId),
					offer_id: String(offerId)
				}
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
});
