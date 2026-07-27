import { defineHook } from '@directus/extensions-sdk';
import { runScaffold, toursCollectionMissing } from '../scaffold/run-scaffold.js';
import type { DatabaseLike, ScaffoldLogger } from '../scaffold/types.js';

export default defineHook(({ init }, { services, database, getSchema, logger }) => {
	init('routes.custom.after', async () => {
		const db = database as DatabaseLike;
		const log = logger as ScaffoldLogger;

		if (!(await toursCollectionMissing(db))) {
			log.debug('[krk-tours] tours collection exists; skipping auto-scaffold');
			return;
		}

		log.info('[krk-tours] tours collection missing; running auto-scaffold');
		await runScaffold({
			services,
			database,
			getSchema,
			logger: log
		});
	});
});
