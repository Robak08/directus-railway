import { defineEndpoint } from '@directus/extensions-sdk';
import { isPaidCheckoutSession as isPaidGuidebookCheckoutSession } from '@krk/guidebooks-core';
import Stripe from 'stripe';
import {
	resolveCheckoutEmail,
	subscribeGuidebookBuyerToMailerLite,
	type StripeCheckoutSessionObject
} from '../mailerlite-guidebook.js';
import { provisionCustomerFromCheckout } from '../provision-customer.js';
import {
	admitStripeWebhookEvent,
	fulfillGuidebookGrantFromCheckout,
	markStripeWebhookEventStatus,
	resolveDirectusUserIdForSession,
	resolveOfferForSession
} from '../guidebook-grant-fulfillment.js';

type StripeWebhookRequest = {
	rawBody?: string;
	headers: {
		'stripe-signature'?: string | string[];
	};
};

type StripeCheckoutSession = StripeCheckoutSessionObject & {
	payment_status?: string;
	customer?: string | null;
	status?: string | null;
};

const isCheckoutSessionCompleted = (event: Stripe.Event): event is Stripe.Event & {
	data: { object: StripeCheckoutSession };
} => {
	return event.type === 'checkout.session.completed';
};

const resolveWebhookSecret = (): string | null => {
	const configured = process.env.STRIPE_VERIFICATION_SECRET?.trim();
	return configured && configured.length > 0 ? configured : null;
};

const resolveStripeSignature = (
	header: string | string[] | undefined
): string | null => {
	if (typeof header === 'string' && header.trim().length > 0) {
		return header;
	}

	if (Array.isArray(header) && typeof header[0] === 'string' && header[0].trim().length > 0) {
		return header[0];
	}

	return null;
};

const verifyStripeEvent = (
	req: StripeWebhookRequest,
	logger: { error: (message: string, error?: unknown) => void }
): Stripe.Event => {
	const webhookSecret = resolveWebhookSecret();
	if (!webhookSecret) {
		throw new Error('Config err: STRIPE_VERIFICATION_SECRET missing');
	}

	const rawBody = req.rawBody;
	if (!rawBody || rawBody.length === 0) {
		throw new Error('Missing raw request body');
	}

	const signature = resolveStripeSignature(req.headers['stripe-signature']);
	if (!signature) {
		throw new Error('Missing stripe-signature header');
	}

	try {
		return Stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
	} catch (error: unknown) {
		logger.error('[krk-guide] Stripe webhook signature verification failed', error);
		throw new Error('Webhook signature verification failed');
	}
};

export default defineEndpoint((router, { services, getSchema, logger }) => {
	router.post('/guide-webhook', async (req, res) => {
		let event: Stripe.Event;

		try {
			event = verifyStripeEvent(req as StripeWebhookRequest, logger);
		} catch (error: unknown) {
			logger.error('[krk-guide] Webhook verification rejected', error);
			return res.status(400).send({ received: false, error: String(error) });
		}

		if (!isCheckoutSessionCompleted(event)) {
			logger.info(`[krk-guide] Ignoring Stripe event type: ${event.type}`);
			return res.send({ received: true, ignored: true });
		}

		const session = event.data.object;
		if (!isPaidGuidebookCheckoutSession(session)) {
			logger.info('[krk-guide] Ignoring unpaid checkout session');
			return res.send({ received: true, ignored: true });
		}

		const email = resolveCheckoutEmail(session);
		if (!email) {
			logger.error('[krk-guide] Missing customer email on checkout.session.completed');
			return res.status(500).send({ received: false, error: 'Missing customer email' });
		}

		const webhookServices =
			services as unknown as import('../guidebook-grant-fulfillment.js').GuideWebhookServices;

		try {
			const ledger = await admitStripeWebhookEvent({
				services: webhookServices,
				getSchema,
				stripeEventId: event.id,
				eventType: event.type
			});

			if (ledger === 'duplicate') {
				logger.info('[krk-guide] Duplicate Stripe event; skipping side effects');
				return res.send({ received: true, duplicate: true });
			}

			await subscribeGuidebookBuyerToMailerLite(session);
			await provisionCustomerFromCheckout({
				session,
				services: services as unknown as import('../provision-customer.js').DirectusServices,
				getSchema,
				logger
			});

			const offer = await resolveOfferForSession({
				services: webhookServices,
				getSchema,
				session
			});

			const userId = await resolveDirectusUserIdForSession({
				services: webhookServices,
				getSchema,
				session,
				email
			});

			if (!offer) {
				throw new Error('Missing active offer for checkout session');
			}

			if (!userId) {
				throw new Error('Missing Directus user binding for grant fulfillment');
			}

			await fulfillGuidebookGrantFromCheckout({
				services: webhookServices,
				getSchema,
				session,
				userId,
				offer
			});

			await markStripeWebhookEventStatus({
				services: webhookServices,
				getSchema,
				stripeEventId: event.id,
				status: 'processed'
			});

			return res.send({ received: true, retried: ledger === 'retry' });
		} catch (error: unknown) {
			logger.error('[krk-guide] Webhook fulfillment failed', error);
			await markStripeWebhookEventStatus({
				services: webhookServices,
				getSchema,
				stripeEventId: event.id,
				status: 'failed'
			}).catch(() => undefined);
			return res.status(500).send({ received: false, error: String(error) });
		}
	});
});
