import MailerLite from '@mailerlite/mailerlite-nodejs';
import {
	buildMailerLiteSubscriberParams,
	resolveCheckoutEmail,
	type StripeCheckoutSessionObject
} from './mailerlite-guidebook-payload.js';

export {
	MAILERLITE_GROUP_IDS,
	buildMailerLiteSubscriberParams,
	resolveCheckoutEmail,
	splitCustomerName,
	type MailerLiteCustomField,
	type MailerLiteSubscriberParams,
	type StripeCheckoutSessionObject
} from './mailerlite-guidebook-payload.js';

export const subscribeGuidebookBuyerToMailerLite = async (
	session: StripeCheckoutSessionObject
): Promise<void> => {
	if (!process.env.MAILERLITE_API_KEY) {
		throw new Error('Config err: MAILERLITE_API_KEY missing');
	}

	const email = resolveCheckoutEmail(session);
	if (!email) {
		throw new Error('Missing customer email');
	}

	const mailerlite = new MailerLite({
		api_key: process.env.MAILERLITE_API_KEY
	});

	const mailerParams = buildMailerLiteSubscriberParams(session, email);

	try {
		const response = await mailerlite.subscribers.createOrUpdate(mailerParams);
		if (!response) {
			throw new Error(`Mailerlite subscriber error, ${email}`);
		}
	} catch (error: unknown) {
		const mailerliteError = error as { response?: { data?: unknown } };
		if (mailerliteError.response?.data) {
			console.log(mailerliteError.response.data);
		}
		throw new Error(`Mailerlite subscriber error, ${email}`);
	}
};
