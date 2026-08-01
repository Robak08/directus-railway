import { defineEndpoint } from '@directus/extensions-sdk';
import Stripe from 'stripe';

const DEFAULT_APP_ORIGIN = 'https://app.krakovanopas.fi';

type CheckoutSessionBody = {
	successUrl?: string;
	cancelUrl?: string;
	locale?: string;
};

const isNonEmptyString = (value: unknown): value is string =>
	typeof value === 'string' && value.trim().length > 0;

const resolveAppOrigin = (): string => {
	const configured = process.env.APP_ORIGIN?.trim();
	return configured && configured.length > 0 ? configured.replace(/\/$/, '') : DEFAULT_APP_ORIGIN;
};

const resolveCheckoutUrls = (body: CheckoutSessionBody): { successUrl: string; cancelUrl: string } => {
	const origin = resolveAppOrigin();
	const successUrl = isNonEmptyString(body.successUrl)
		? body.successUrl.trim()
		: `${origin}/osto/onnistui?session_id={CHECKOUT_SESSION_ID}`;
	const cancelUrl = isNonEmptyString(body.cancelUrl)
		? body.cancelUrl.trim()
		: `${origin}/osto/peruutettu`;

	return { successUrl, cancelUrl };
};

export default defineEndpoint((router) => {
	router.post('/checkout-session', async (req, res) => {
		const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
		const priceId = process.env.STRIPE_GUIDEBOOK_PRICE_ID;

		if (!stripeSecretKey) {
			res.status(500).send({ error: 'STRIPE_SECRET_KEY is not configured' });
			return;
		}

		if (!priceId) {
			res.status(500).send({ error: 'STRIPE_GUIDEBOOK_PRICE_ID is not configured' });
			return;
		}

		const body = (req.body ?? {}) as CheckoutSessionBody;
		const { successUrl, cancelUrl } = resolveCheckoutUrls(body);
		const locale = isNonEmptyString(body.locale) ? body.locale.trim() : 'fi';

		try {
			const stripe = new Stripe(stripeSecretKey);

			const session = await stripe.checkout.sessions.create({
				mode: 'payment',
				line_items: [{ price: priceId, quantity: 1 }],
				success_url: successUrl,
				cancel_url: cancelUrl,
				locale: locale === 'fi' || locale === 'en' ? locale : 'fi',
				metadata: {
					source: 'app'
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
