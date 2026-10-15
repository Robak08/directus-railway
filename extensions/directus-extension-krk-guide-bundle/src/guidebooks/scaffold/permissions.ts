import type { ScaffoldLogger } from './types.js';

type PermissionsContext = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	database: any;
	logger: ScaffoldLogger;
};

type PermissionInsert = {
	collection: string;
	action: string;
	fields: string;
	permissions: Record<string, unknown> | null;
};

const CUSTOMER_PERMISSION_SPECS: PermissionInsert[] = [
	{
		collection: 'customer_guidebook_access',
		action: 'read',
		fields: 'guidebook_id,can_catalog,can_pdf',
		permissions: { user_id: { _eq: '$CURRENT_USER' } }
	},
	{
		collection: 'guidebooks',
		action: 'read',
		fields:
			'id,slug,title,status,daisy_theme,calendar_enabled,marketing_url,seo_title,seo_description,pdf_version,pdf_updated',
		permissions: { status: { _eq: 'published' } }
	}
];

/** M2M junctions required for catalog filters such as places.guidebooks.guidebook_id */
const CUSTOMER_CATALOG_JUNCTION_PERMISSION_SPECS: PermissionInsert[] = [
	{
		collection: 'guidebooks_places',
		action: 'read',
		fields: 'id,guidebook_id,places_id',
		permissions: null
	},
	{
		collection: 'guidebooks_events',
		action: 'read',
		fields: 'id,guidebook_id,events_id',
		permissions: null
	},
	{
		collection: 'guidebooks_tours',
		action: 'read',
		fields: 'id,guidebook_id,tours_id',
		permissions: null
	},
	{
		collection: 'guidebooks_places_regions',
		action: 'read',
		fields: 'id,guidebook_id,places_regions_id',
		permissions: null
	},
	{
		collection: 'tips_guidebooks',
		action: 'read',
		fields: 'id,guidebooks_id,tips_id',
		permissions: null
	}
];

const ALL_CUSTOMER_PERMISSION_SPECS: PermissionInsert[] = [
	...CUSTOMER_PERMISSION_SPECS,
	...CUSTOMER_CATALOG_JUNCTION_PERMISSION_SPECS
];

/** Collections the customer app reads via Directus SDK (see permission-matrix.template.json). */
const CATALOG_READ_COLLECTIONS = [
	'places',
	'events',
	'event_categories',
	'tours',
	'tour_steps',
	'tours_translations',
	'tips'
] as const;

type StoredPermissionRow = {
	permissions: Record<string, unknown> | string | null;
	fields: string | null;
};

async function findTemplateReadPermission(
	database: PermissionsContext['database'],
	collection: string,
	options: { policy?: string; role?: string }
): Promise<PermissionInsert | null> {
	const query = database('directus_permissions').where({ collection, action: 'read' });

	if (options.policy) {
		query.whereNotNull('policy').whereNot('policy', options.policy);
	} else if (options.role) {
		query.whereNotNull('role').whereNot('role', options.role);
	} else {
		return null;
	}

	const row = (await query.first()) as StoredPermissionRow | undefined;

	if (!row) {
		return null;
	}

	const permissions =
		row.permissions && typeof row.permissions === 'object'
			? (row.permissions as Record<string, unknown>)
			: null;

	return {
		collection,
		action: 'read',
		fields: row.fields ?? '*',
		permissions
	};
}

function fallbackCatalogRead(collection: string): PermissionInsert | null {
	if (collection === 'places' || collection === 'events' || collection === 'event_categories') {
		return {
			collection,
			action: 'read',
			fields: '*',
			permissions: { status: { _eq: 'published' } }
		};
	}

	return null;
}

async function ensureCatalogReadsOnPolicy(
	database: PermissionsContext['database'],
	policyId: string,
	logger: ScaffoldLogger
): Promise<number> {
	let created = 0;

	for (const collection of CATALOG_READ_COLLECTIONS) {
		if (await policyPermissionExists(database, policyId, collection, 'read')) {
			continue;
		}

		const template =
			(await findTemplateReadPermission(database, collection, { policy: policyId })) ??
			fallbackCatalogRead(collection);

		if (!template) {
			logger.warn(
				`[krk-guidebooks] No read template for ${collection}; skip clone to policy ${policyId}`
			);
			continue;
		}

		if (await insertPolicyPermission(database, policyId, template)) {
			created++;
		}
	}

	return created;
}

async function ensureCatalogReadsOnRole(
	database: PermissionsContext['database'],
	roleId: string,
	logger: ScaffoldLogger
): Promise<number> {
	let created = 0;

	for (const collection of CATALOG_READ_COLLECTIONS) {
		if (await rolePermissionExists(database, roleId, collection, 'read')) {
			continue;
		}

		const template =
			(await findTemplateReadPermission(database, collection, { role: roleId })) ??
			fallbackCatalogRead(collection);

		if (!template) {
			logger.warn(
				`[krk-guidebooks] No read template for ${collection}; skip clone to role ${roleId}`
			);
			continue;
		}

		if (await insertRolePermission(database, roleId, template)) {
			created++;
		}
	}

	return created;
}

async function usesRoleColumnOnPermissions(database: PermissionsContext['database']): Promise<boolean> {
	return database.schema.hasColumn('directus_permissions', 'role');
}

async function findCustomerRoleIds(database: PermissionsContext['database']): Promise<string[]> {
	const configured = process.env.CUSTOMER_ROLE_ID?.trim();
	if (configured) {
		return [configured];
	}

	const rows = (await database('directus_roles').where({ name: 'Customer' }).select('id')) as {
		id: string;
	}[];

	return rows.map((row) => row.id);
}

async function findPolicyIdsForRoles(
	database: PermissionsContext['database'],
	roleIds: string[]
): Promise<string[]> {
	if (roleIds.length === 0) return [];

	const hasAccessTable = await database.schema.hasTable('directus_access');
	if (!hasAccessTable) return [];

	const rows = (await database('directus_access')
		.whereIn('role', roleIds)
		.whereNotNull('policy')
		.distinct('policy')
		.select('policy')) as { policy: string }[];

	return rows.map((row) => row.policy).filter(Boolean);
}

async function findPoliciesWithPlacesRead(
	database: PermissionsContext['database']
): Promise<string[]> {
	const rows = (await database('directus_permissions')
		.where({ collection: 'places', action: 'read' })
		.whereNotNull('policy')
		.distinct('policy')
		.select('policy')) as { policy: string }[];

	return rows.map((row) => row.policy).filter(Boolean);
}

async function rolePermissionExists(
	database: PermissionsContext['database'],
	role: string,
	collection: string,
	action: string
): Promise<boolean> {
	const row = await database('directus_permissions').where({ role, collection, action }).first();
	return Boolean(row);
}

async function policyPermissionExists(
	database: PermissionsContext['database'],
	policy: string,
	collection: string,
	action: string
): Promise<boolean> {
	const row = await database('directus_permissions').where({ policy, collection, action }).first();
	return Boolean(row);
}

async function insertRolePermission(
	database: PermissionsContext['database'],
	role: string,
	row: PermissionInsert
): Promise<boolean> {
	if (await rolePermissionExists(database, role, row.collection, row.action)) {
		return false;
	}

	await database('directus_permissions').insert({
		role,
		collection: row.collection,
		action: row.action,
		permissions: row.permissions,
		validation: null,
		presets: null,
		fields: row.fields,
		policy: null
	});

	return true;
}

async function insertPolicyPermission(
	database: PermissionsContext['database'],
	policy: string,
	row: PermissionInsert
): Promise<boolean> {
	if (await policyPermissionExists(database, policy, row.collection, row.action)) {
		return false;
	}

	await database('directus_permissions').insert({
		policy,
		collection: row.collection,
		action: row.action,
		permissions: row.permissions,
		validation: null,
		presets: null,
		fields: row.fields
	});

	return true;
}

async function applyViaRoles(database: PermissionsContext['database'], logger: ScaffoldLogger): Promise<number> {
	const roleIds = await findCustomerRoleIds(database);
	if (roleIds.length === 0) {
		logger.warn('[krk-guidebooks] Customer role not found; skip permission seed');
		return 0;
	}

	let created = 0;
	for (const roleId of roleIds) {
		created += await ensureCatalogReadsOnRole(database, roleId, logger);
		for (const spec of ALL_CUSTOMER_PERMISSION_SPECS) {
			if (await insertRolePermission(database, roleId, spec)) {
				created++;
			}
		}
	}

	return created;
}

async function applyViaPolicies(database: PermissionsContext['database'], logger: ScaffoldLogger): Promise<number> {
	const customerRoleIds = await findCustomerRoleIds(database);
	const policiesFromCustomer = await findPolicyIdsForRoles(database, customerRoleIds);
	const policiesFromPlaces = await findPoliciesWithPlacesRead(database);

	const policyIds = [...new Set([...policiesFromCustomer, ...policiesFromPlaces])];

	if (policyIds.length === 0) {
		logger.warn(
			'[krk-guidebooks] No customer policies found (set CUSTOMER_ROLE_ID or grant places read on a policy first)'
		);
		return 0;
	}

	let created = 0;
	for (const policyId of policyIds) {
		created += await ensureCatalogReadsOnPolicy(database, policyId, logger);
		for (const spec of ALL_CUSTOMER_PERMISSION_SPECS) {
			if (await insertPolicyPermission(database, policyId, spec)) {
				created++;
			}
		}
	}

	return created;
}

/**
 * Customer read access to own projection rows, published guidebook branding fields,
 * and guidebook catalog junction tables (see snapshots/guidebooks/permission-matrix.template.json).
 * Invoked from runScaffold and migration phase replace-permissions.
 */
export async function applyGuidebookPermissions(context: PermissionsContext): Promise<number> {
	const { database, logger } = context;
	const hasPermissionsTable = await database.schema.hasTable('directus_permissions');
	if (!hasPermissionsTable) {
		logger.warn('[krk-guidebooks] directus_permissions missing; skip permission seed');
		return 0;
	}

	const useRoleColumn = await usesRoleColumnOnPermissions(database);
	const created = useRoleColumn
		? await applyViaRoles(database, logger)
		: await applyViaPolicies(database, logger);

	logger.info(`[krk-guidebooks] Seeded ${created} customer permission row(s)`);
	return created;
}
