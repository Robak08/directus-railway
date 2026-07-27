import { defineEndpoint } from '@directus/extensions-sdk';
import { runScaffold } from '../scaffold/run-scaffold.js';
import type { ScaffoldLogger } from '../scaffold/types.js';
import { seedTours } from '../seed/seed-tours.js';

function requireAdmin(req: { accountability?: { admin?: boolean } | null }, res: { status: (code: number) => { send: (body: unknown) => void } }) {
	if (!req.accountability?.admin) {
		res.status(403).send({ error: 'Admin access required' });
		return false;
	}
	return true;
}

export default defineEndpoint((router, { services, database, getSchema, logger }) => {
	const log = logger as ScaffoldLogger;

	router.post('/scaffold', async (req, res) => {
		if (!requireAdmin(req, res)) return;

		try {
			const summary = await runScaffold({
				services,
				database,
				getSchema,
				logger: log
			});
			res.send({ ok: summary.errors.length === 0, summary });
		} catch (error: unknown) {
			const err = error as Error;
			log.error('[krk-tours] Scaffold endpoint failed', error);
			res.status(500).send({ error: err.message });
		}
	});

	router.post('/seed', async (req, res) => {
		if (!requireAdmin(req, res)) return;

		try {
			const summary = await seedTours({
				services,
				database,
				getSchema,
				logger: log
			});
			res.send({
				ok: summary.errors.length === 0,
				summary
			});
		} catch (error: unknown) {
			const err = error as Error;
			log.error('[krk-tours] Seed endpoint failed', error);
			res.status(500).send({ error: err.message });
		}
	});
});
