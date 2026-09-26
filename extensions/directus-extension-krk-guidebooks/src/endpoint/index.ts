import { defineEndpoint } from '@directus/extensions-sdk';
import { runScaffold } from '../scaffold/run-scaffold.js';
import { runMigrationPhase, runMigrationThrough, getMigrationStatus } from '../migration/runner.js';
import type { MigrationPhase } from '../../../krk-guidebooks-core/src/migration-config.js';
import {
	loadGuidebookCalendarPayload,
	loadPublishedGuidebookBySlug
} from './calendar.js';
import { createServiceAccountability, userHasPdfAccess } from '../access/grant-service.js';
import type { ScaffoldLogger } from '../scaffold/types.js';

function requireAdmin(
	req: { accountability?: { admin?: boolean } | null },
	res: { status: (code: number) => { send: (body: unknown) => void } }
) {
	if (!req.accountability?.admin) {
		res.status(403).send({ error: 'Admin access required' });
		return false;
	}
	return true;
}

function requireUser(
	req: { accountability?: { user?: string | null } | null },
	res: { status: (code: number) => { send: (body: unknown) => void } }
) {
	if (!req.accountability?.user) {
		res.status(401).send({ error: 'Authentication required' });
		return false;
	}
	return true;
}

export default defineEndpoint((router, { services, database, getSchema, logger }) => {
	const log = logger as ScaffoldLogger;

	router.post('/scaffold', async (req, res) => {
		if (!requireAdmin(req, res)) return;
		const summary = await runScaffold({ services, database, getSchema, logger: log });
		res.send({ ok: summary.errors.length === 0, summary });
	});

	router.get('/migration/status', async (req, res) => {
		if (!requireAdmin(req, res)) return;
		const status = await getMigrationStatus(database);
		res.send(status);
	});

	router.post('/migration/run', async (req, res) => {
		if (!requireAdmin(req, res)) return;
		const body = (req.body ?? {}) as { phase?: MigrationPhase; through?: MigrationPhase };
		try {
			const result = body.through
				? await runMigrationThrough({
						services,
						database,
						getSchema,
						logger: log,
						through: body.through
					})
				: await runMigrationPhase({
						services,
						database,
						getSchema,
						logger: log,
						phase: body.phase ?? 'preflight'
					});
			res.send(result);
		} catch (error: unknown) {
			const err = error as Error;
			res.status(500).send({ error: err.message });
		}
	});

	router.get('/', async (_req, res) => {
		const schema = await getSchema();
		const items = new services.ItemsService('guidebooks', {
			schema,
			accountability: createServiceAccountability()
		});
		const rows = await items.readByQuery({
			filter: { status: { _eq: 'published' } },
			sort: ['sort', 'title'],
			fields: [
				'id',
				'slug',
				'title',
				'daisy_theme',
				'marketing_url',
				'seo_title',
				'seo_description'
			],
			limit: -1
		});
		res.send({ guidebooks: rows });
	});

	router.get('/:slug/branding', async (req, res) => {
		try {
			const guidebook = await loadPublishedGuidebookBySlug({
				services,
				getSchema,
				slug: req.params.slug
			});
			if (!guidebook) {
				res.status(404).send({ error: 'Guidebook not found' });
				return;
			}

			const schema = await getSchema();
			const items = new services.ItemsService('guidebooks', {
				schema,
				accountability: createServiceAccountability()
			});
			const row = await items.readOne(guidebook.id, {
				fields: [
					'id',
					'slug',
					'title',
					'daisy_theme',
					'marketing_url',
					'seo_title',
					'seo_description',
					'pdf_version',
					'pdf_updated'
				]
			});
			res.send(row);
		} catch (error: unknown) {
			const err = error as Error;
			log.error(`[krk-guidebooks] /${req.params.slug}/branding failed: ${err.message}`);
			res.status(500).send({ error: 'Failed to load guidebook branding' });
		}
	});

	router.get('/:slug/calendar', async (req, res) => {
		try {
			const guidebook = await loadPublishedGuidebookBySlug({
				services,
				getSchema,
				slug: req.params.slug
			});
			if (!guidebook) {
				res.status(404).send({ error: 'Guidebook not found' });
				return;
			}

			const payload = await loadGuidebookCalendarPayload({
				services,
				getSchema,
				guidebookId: guidebook.id
			});
			res.setHeader('Cache-Control', 'public, max-age=300');
			res.send(payload);
		} catch (error: unknown) {
			const err = error as Error;
			log.error(`[krk-guidebooks] /${req.params.slug}/calendar failed: ${err.message}`);
			res.status(500).send({ error: 'Failed to load guidebook calendar' });
		}
	});

	router.get('/me/access', async (req, res) => {
		if (!requireUser(req, res)) return;

		try {
			const schema = await getSchema();
			const items = new services.ItemsService('customer_guidebook_access', {
				schema,
				accountability: req.accountability
			});
			const rows = await items.readByQuery({
				filter: { user_id: { _eq: req.accountability!.user } },
				fields: [
					'guidebook_id',
					'guidebook_id.id',
					'can_catalog',
					'can_pdf',
					'guidebook_id.slug',
					'guidebook_id.title',
					'guidebook_id.daisy_theme'
				],
				limit: -1
			});
			res.send({ access: rows });
		} catch (error: unknown) {
			const err = error as Error;
			log.error(`[krk-guidebooks] /me/access failed: ${err.message}`);
			res.status(500).send({ error: 'Failed to load guidebook access' });
		}
	});

	router.get('/:slug/pdf', async (req, res) => {
		if (!requireUser(req, res)) return;

		try {
			const guidebook = await loadPublishedGuidebookBySlug({
				services,
				getSchema,
				slug: req.params.slug
			});
			if (!guidebook) {
				res.status(404).send({ error: 'Guidebook not found' });
				return;
			}

			const allowed = await userHasPdfAccess({
				services,
				getSchema,
				userId: req.accountability!.user!,
				guidebookId: guidebook.id
			});
			if (!allowed) {
				res.status(403).send({ error: 'PDF access not granted for this guidebook' });
				return;
			}

			const schema = await getSchema();
			const items = new services.ItemsService('guidebooks', {
				schema,
				accountability: createServiceAccountability()
			});
			const row = (await items.readOne(guidebook.id, {
				fields: ['pdf_file']
			})) as { pdf_file?: string | null };

			if (!row.pdf_file) {
				res.status(404).send({ error: 'PDF not configured' });
				return;
			}

			res.setHeader('Cache-Control', 'private, no-store');
			res.send({
				fileId: row.pdf_file,
				downloadPath: `/assets/${row.pdf_file}?download`
			});
		} catch (error: unknown) {
			const err = error as Error;
			log.error(`[krk-guidebooks] /${req.params.slug}/pdf failed: ${err.message}`);
			res.status(500).send({ error: 'Failed to load guidebook PDF metadata' });
		}
	});
});
