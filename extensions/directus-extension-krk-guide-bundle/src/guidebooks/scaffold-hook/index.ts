import { defineHook } from '@directus/extensions-sdk';
import { runScaffold, guidebooksDomainMissing } from '../scaffold/run-scaffold.js';
import type { ExtensionHandlerServices } from '../../core/index.js';
import type { DatabaseLike, ScaffoldLogger } from '../scaffold/types.js';

export default defineHook(({ init }, { services, database, getSchema, logger }) => {
	init('routes.custom.after', async () => {
		if (process.env.KRK_GUIDEBOOKS_AUTO_SCAFFOLD !== 'true') {
			return;
		}

		const db = database as DatabaseLike;
		const log = logger as ScaffoldLogger;

		if (!(await guidebooksDomainMissing(db))) {
			log.debug('[krk-guidebooks] guidebooks collection exists; skipping auto-scaffold');
			return;
		}

		log.info('[krk-guidebooks] guidebooks collection missing; running auto-scaffold');
		await runScaffold({
			services: services as unknown as ExtensionHandlerServices,
			database,
			getSchema,
			logger: log
		});
	});
});
