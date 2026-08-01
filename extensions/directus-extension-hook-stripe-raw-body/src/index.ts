import { defineHook } from '@directus/extensions-sdk';
import express from 'express';

const STRIPE_WEBHOOK_PATH = '/krk-guide/guide-webhook';

const isStripeWebhookRequest = (originalUrl: string, method: string): boolean => {
	return method === 'POST' && originalUrl.startsWith(STRIPE_WEBHOOK_PATH);
};

export default defineHook(({ init }) => {
	init('middlewares.before', async ({ app }) => {
		app.use(
			express.json({
				verify: (req, _res, buf) => {
					if (isStripeWebhookRequest(req.originalUrl, req.method)) {
						(req as express.Request & { rawBody?: string }).rawBody = buf.toString('utf8');
					}
				}
			})
		);
	});
});
