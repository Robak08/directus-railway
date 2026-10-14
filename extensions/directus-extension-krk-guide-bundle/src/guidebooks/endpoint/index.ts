import { defineEndpoint } from '@directus/extensions-sdk';
import { runScaffold } from '../scaffold/run-scaffold.js';
import { runMigrationPhase, runMigrationThrough, getMigrationStatus } from '../migration/runner.js';
import type { MigrationPhase } from '../../core/index.js';
import {
	loadGuidebookCalendarPayload,
	loadPublishedGuidebookBySlug
} from './calendar.js';
import {
	createServiceAccountability,
	userHasPdfAccess,
	type DirectusServices
} from '../access/grant-service.js';
import type { ScaffoldLogger } from '../scaffold/types.js';
import type { DirectusRequest } from '../directus-request.js';
import type { ExtensionHandlerServices } from '../../core/index.js';

const extensionServices = (services: unknown): ExtensionHandlerServices =>
	services as ExtensionHandlerServices;

function requireAdmin(
	req: DirectusRequest,
	res: { status: (code: number) => { send: (body: unknown) => void } }
) {
	if (!req.accountability?.admin) {
		res.status(403).send({ error: 'Admin access required' });
		return false;
	}
	return true;
}

function requireUser(
	req: DirectusRequest,
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
		if (!requireAdmin(req as unknown as DirectusRequest, res)) return;
		const summary = await runScaffold({
			services: extensionServices(services),
			database,
			getSchema,
			logger: log
		});
		res.send({ ok: summary.errors.length === 0, summary });
	});

	router.get('/migration/status', async (req, res) => {
		if (!requireAdmin(req as unknown as DirectusRequest, res)) return;
		const status = await getMigrationStatus(database);
		res.send(status);
	});

	router.post('/migration/run', async (req, res) => {
		if (!requireAdmin(req as unknown as DirectusRequest, res)) return;
		const body = (req.body ?? {}) as { phase?: MigrationPhase; through?: MigrationPhase };
		try {
			const result = body.through
				? await runMigrationThrough({
						services: extensionServices(services),
						database,
						getSchema,
						logger: log,
						through: body.through
					})
				: await runMigrationPhase({
						services: extensionServices(services),
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
				services: extensionServices(services),
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
			} as ConstructorParameters<typeof services.ItemsService>[1]);
			const brandingFieldsWithPdf = [
				'id',
				'slug',
				'title',
				'daisy_theme',
				'marketing_url',
				'seo_title',
				'seo_description',
				'pdf_version',
				'pdf_updated'
			];
			const brandingFieldsBase = brandingFieldsWithPdf.filter(
				(field) => field !== 'pdf_version' && field !== 'pdf_updated'
			);

			let row: Record<string, unknown>;
			try {
				row = (await items.readOne(guidebook.id, {
					fields: brandingFieldsWithPdf
				})) as Record<string, unknown>;
			} catch {
				row = (await items.readOne(guidebook.id, {
					fields: brandingFieldsBase
				})) as Record<string, unknown>;
			}
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
				services: extensionServices(services),
				getSchema,
				slug: req.params.slug
			});
			if (!guidebook) {
				res.status(404).send({ error: 'Guidebook not found' });
				return;
			}

			const payload = await loadGuidebookCalendarPayload({
				services: extensionServices(services),
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
		const directusReq = req as unknown as DirectusRequest;
		if (!requireUser(directusReq, res)) return;

		try {
			const schema = await getSchema();
			const items = new services.ItemsService('customer_guidebook_access', {
				schema,
				accountability: directusReq.accountability
			});
			const rows = await items.readByQuery({
				filter: { user_id: { _eq: directusReq.accountability!.user } },
				fields: [
					'guidebook_id',
					'guidebook_id.id',
					'can_catalog',
					'can_pdf',
					'guidebook_id.slug',
					'guidebook_id.title',
					'guidebook_id.daisy_theme',
					'guidebook_id.calendar_enabled'
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
		const directusReq = req as unknown as DirectusRequest;
		if (!requireUser(directusReq, res)) return;

		try {
			const guidebook = await loadPublishedGuidebookBySlug({
				services: extensionServices(services),
				getSchema,
				slug: req.params.slug
			});
			if (!guidebook) {
				res.status(404).send({ error: 'Guidebook not found' });
				return;
			}

			const allowed = await userHasPdfAccess({
				services: services as unknown as DirectusServices,
				getSchema,
				userId: directusReq.accountability!.user!,
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
