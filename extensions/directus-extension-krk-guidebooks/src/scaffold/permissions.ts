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
			'id,slug,title,status,daisy_theme,marketing_url,seo_title,seo_description,pdf_version,pdf_updated',
		permissions: { status: { _eq: 'published' } }
	}
];

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
		for (const spec of CUSTOMER_PERMISSION_SPECS) {
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
		for (const spec of CUSTOMER_PERMISSION_SPECS) {
			if (await insertPolicyPermission(database, policyId, spec)) {
				created++;
			}
		}
	}

	return created;
}

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

	const useRoleColumn = await usesRoleColumnOnPermissions(database);
	const created = useRoleColumn
		? await applyViaRoles(database, logger)
		: await applyViaPolicies(database, logger);

	logger.info(`[krk-guidebooks] Seeded ${created} customer permission row(s)`);
	return created;
}
