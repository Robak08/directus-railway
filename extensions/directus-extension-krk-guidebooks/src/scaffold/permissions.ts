import type { ScaffoldLogger } from './types.js';

type PermissionsContext = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	database: any;
	logger: ScaffoldLogger;
};

/**
 * Customer read access to own projection rows and published guidebook branding fields.
 * Full catalog gating remains in Directus policies exported via snapshots/guidebooks/.
 */
export async function applyGuidebookPermissions(context: PermissionsContext): Promise<number> {
	const { database, logger } = context;
	const hasPermissionsTable = await database.schema.hasTable('directus_permissions');
	if (!hasPermissionsTable) {
		logger.warn('[krk-guidebooks] directus_permissions missing; skip permission seed');
		return 0;
	}

	const customerRoleRows = (await database('directus_roles')
		.where({ name: 'Customer' })
		.select('id')) as { id: string }[];

	if (customerRoleRows.length === 0) {
		logger.warn('[krk-guidebooks] Customer role not found; skip permission seed');
		return 0;
	}

	const roleId = customerRoleRows[0].id;
	let created = 0;

	const specs = [
		{
			collection: 'customer_guidebook_access',
			action: 'read',
			fields: '*',
			permissions: { user_id: { _eq: '$CURRENT_USER' } }
		},
		{
			collection: 'guidebooks',
			action: 'read',
			fields: 'id,slug,title,status,daisy_theme,marketing_url,seo_title,seo_description,pdf_version,pdf_updated',
			permissions: { status: { _eq: 'published' } }
		}
	];

	for (const spec of specs) {
		const existing = await database('directus_permissions')
			.where({
				role: roleId,
				collection: spec.collection,
				action: spec.action
			})
			.first();

		if (existing) continue;

		await database('directus_permissions').insert({
			role: roleId,
			collection: spec.collection,
			action: spec.action,
			fields: spec.fields,
			permissions: JSON.stringify(spec.permissions),
			validation: null,
			presets: null,
			policy: null
		});
		created++;
	}

	logger.info(`[krk-guidebooks] Seeded ${created} customer permission row(s)`);
	return created;
}
