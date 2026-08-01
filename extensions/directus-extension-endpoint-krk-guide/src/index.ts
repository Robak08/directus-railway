import { defineEndpoint } from '@directus/extensions-sdk';
import {
	resolveCheckoutEmail,
	subscribeGuidebookBuyerToMailerLite,
	type StripeCheckoutSessionObject
} from './mailerlite-guidebook.js';
import { provisionCustomerFromCheckout } from './provision-customer.js';

type StripeWebhookEvent = {
	type?: string;
	data?: {
		object?: StripeCheckoutSessionObject & {
			payment_status?: string;
			customer?: string | null;
		};
	};
};

const isCheckoutSessionCompleted = (event: StripeWebhookEvent): boolean => {
	return event.type === 'checkout.session.completed';
};

const isPaidCheckoutSession = (
	session: StripeCheckoutSessionObject & { payment_status?: string }
): boolean => {
	if (session.status === 'complete') {
		return true;
	}

	return session.payment_status === 'paid';
};

export default defineEndpoint((router, { services, getSchema, logger }) => {
	router.post('/guide-webhook', async (req, res) => {
		try {
			const event = (req.body ?? {}) as StripeWebhookEvent;
			const session = event.data?.object;

			if (!session || !isCheckoutSessionCompleted(event) || !isPaidCheckoutSession(session)) {
				throw new Error('Wrong payload - 403');
			}

			const email = resolveCheckoutEmail(session);
			if (!email) {
				throw new Error('Missing customer email');
			}

			subscribeGuidebookBuyerToMailerLite(session).catch((error: unknown) => {
				if ((error as { response?: { data?: unknown } }).response?.data) {
					console.log((error as { response: { data: unknown } }).response.data);
				}
				console.log('/guide-webhook mailerlite err', error);
			});

			provisionCustomerFromCheckout({
				session,
				services: services as import('./provision-customer.js').DirectusServices,
				getSchema,
				logger
			}).catch((provisionError: unknown) => {
				logger.error('[krk-guide] User provisioning failed', provisionError);
			});

			res.send({ received: true });
		} catch (err: unknown) {
			console.log('/guide-webhook err', err);
			res.send({ received: true, mes: String(err) });
		}
	});
});
