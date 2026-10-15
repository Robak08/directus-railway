import type { PermissionSeedMissing, PermissionSeedReport, ScaffoldLogger } from './types.js';

export type { PermissionSeedReport } from './types.js';

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

/** Directus 12 keeps a `role` column but effective permissions are usually policy-based. */
async function prefersPolicyPermissionsMode(database: PermissionsContext['database']): Promise<boolean> {
	const hasAccessTable = await database.schema.hasTable('directus_access');
	if (hasAccessTable) {
		const linked = (await database('directus_access').count('* as count').first()) as {
			count?: number | string;
		};
		if (Number(linked?.count ?? 0) > 0) {
			return true;
		}
	}

	const policyRow = await database('directus_permissions').whereNotNull('policy').first();
	return Boolean(policyRow);
}

async function findPoliciesByRoleName(
	database: PermissionsContext['database'],
	roleName: string
): Promise<string[]> {
	const roleIds = (
		await database('directus_roles').where({ name: roleName }).select('id')
	) as { id: string }[];

	return findPolicyIdsForRoles(database, roleIds.map((row) => row.id));
}

async function findCustomerPolicyIds(database: PermissionsContext['database']): Promise<string[]> {
	const customerRoleIds = await findCustomerRoleIds(database);
	const fromAccess = await findPolicyIdsForRoles(database, customerRoleIds);

	if (fromAccess.length > 0) {
		return fromAccess;
	}

	const fromRoleName = await findPoliciesByRoleName(database, 'Customer');
	if (fromRoleName.length > 0) {
		return fromRoleName;
	}

	if (await database.schema.hasTable('directus_policies')) {
		const rows = (await database('directus_policies')
			.where({ name: 'Customer' })
			.select('id')) as { id: string }[];
		if (rows.length > 0) {
			return rows.map((row) => row.id);
		}
	}

	return [];
}

const expectedCustomerPermissionKeys = (): Array<{ collection: string; action: string }> => [
	...CATALOG_READ_COLLECTIONS.map((collection) => ({ collection, action: 'read' })),
	...ALL_CUSTOMER_PERMISSION_SPECS.map((spec) => ({
		collection: spec.collection,
		action: spec.action
	}))
];

async function auditMissingOnPolicy(
	database: PermissionsContext['database'],
	policyId: string
): Promise<PermissionSeedMissing[]> {
	const missing: PermissionSeedMissing[] = [];

	for (const { collection, action } of expectedCustomerPermissionKeys()) {
		if (!(await policyPermissionExists(database, policyId, collection, action))) {
			missing.push({ targetType: 'policy', targetId: policyId, collection, action });
		}
	}

	return missing;
}

async function auditMissingOnRole(
	database: PermissionsContext['database'],
	roleId: string
): Promise<PermissionSeedMissing[]> {
	const missing: PermissionSeedMissing[] = [];

	for (const { collection, action } of expectedCustomerPermissionKeys()) {
		if (!(await rolePermissionExists(database, roleId, collection, action))) {
			missing.push({ targetType: 'role', targetId: roleId, collection, action });
		}
	}

	return missing;
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

async function applyViaRoles(
	database: PermissionsContext['database'],
	logger: ScaffoldLogger
): Promise<PermissionSeedReport> {
	const roleIds = await findCustomerRoleIds(database);
	if (roleIds.length === 0) {
		const warning =
			'[krk-guidebooks] Customer role not found; set CUSTOMER_ROLE_ID or create Customer role';
		logger.warn(warning);
		return {
			created: 0,
			mode: 'skipped',
			targetIds: [],
			missing: [],
			warnings: [warning]
		};
	}

	let created = 0;
	const missing: PermissionSeedMissing[] = [];

	for (const roleId of roleIds) {
		created += await ensureCatalogReadsOnRole(database, roleId, logger);
		for (const spec of ALL_CUSTOMER_PERMISSION_SPECS) {
			if (await insertRolePermission(database, roleId, spec)) {
				created++;
			}
		}
		missing.push(...(await auditMissingOnRole(database, roleId)));
	}

	return {
		created,
		mode: 'role',
		targetIds: roleIds,
		missing,
		warnings: []
	};
}

async function applyViaPolicies(
	database: PermissionsContext['database'],
	logger: ScaffoldLogger
): Promise<PermissionSeedReport> {
	const policyIds = await findCustomerPolicyIds(database);
	const warnings: string[] = [];

	if (policyIds.length === 0) {
		const policiesFromPlaces = await findPoliciesWithPlacesRead(database);
		if (policiesFromPlaces.length > 0) {
			warnings.push(
				'[krk-guidebooks] No Customer policy via directus_access; falling back to policies that already have places read (verify Customer role uses one of these policies)'
			);
			policyIds.push(...policiesFromPlaces);
		}
	}

	const uniquePolicyIds = [...new Set(policyIds)];

	if (uniquePolicyIds.length === 0) {
		const warning =
			'[krk-guidebooks] No customer policies found (link Customer role in Access, set CUSTOMER_ROLE_ID, or create a Customer policy)';
		logger.warn(warning);
		return {
			created: 0,
			mode: 'skipped',
			targetIds: [],
			missing: [],
			warnings: [warning]
		};
	}

	let created = 0;
	const missing: PermissionSeedMissing[] = [];

	for (const policyId of uniquePolicyIds) {
		created += await ensureCatalogReadsOnPolicy(database, policyId, logger);
		for (const spec of ALL_CUSTOMER_PERMISSION_SPECS) {
			if (await insertPolicyPermission(database, policyId, spec)) {
				created++;
			}
		}
		missing.push(...(await auditMissingOnPolicy(database, policyId)));
	}

	if (created === 0 && missing.length > 0) {
		warnings.push(
			`[krk-guidebooks] permissionsCreated is 0 but ${missing.length} expected row(s) still missing on target policy — check Directus Access policy assignment`
		);
	}

	return {
		created,
		mode: 'policy',
		targetIds: uniquePolicyIds,
		missing,
		warnings
	};
}

/**
 * Customer read access to own projection rows, published guidebook branding fields,
 * and guidebook catalog junction tables (see snapshots/guidebooks/permission-matrix.template.json).
 * Invoked from runScaffold and migration phase replace-permissions.
 */
export async function applyGuidebookPermissions(
	context: PermissionsContext
): Promise<PermissionSeedReport> {
	const { database, logger } = context;
	const hasPermissionsTable = await database.schema.hasTable('directus_permissions');
	if (!hasPermissionsTable) {
		const warning = '[krk-guidebooks] directus_permissions missing; skip permission seed';
		logger.warn(warning);
		return {
			created: 0,
			mode: 'skipped',
			targetIds: [],
			missing: [],
			warnings: [warning]
		};
	}

	const usePolicies = await prefersPolicyPermissionsMode(database);
	const report = usePolicies
		? await applyViaPolicies(database, logger)
		: await applyViaRoles(database, logger);

	for (const warning of report.warnings) {
		logger.warn(warning);
	}

	logger.info(
		`[krk-guidebooks] Permission seed (${report.mode}): created=${report.created}, targets=${report.targetIds.length}, missing=${report.missing.length}`
	);

	return report;
}
