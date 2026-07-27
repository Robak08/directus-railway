import type { ScaffoldLogger } from './types.js';

const TOUR_COLLECTIONS = [
	'tours',
	'tours_translations',
	'tour_steps',
	'tour_steps_translations',
	'tours_places_regions'
] as const;

const APP_READ_COLLECTIONS = [...TOUR_COLLECTIONS] as string[];

const EDITOR_ACTIONS = ['create', 'read', 'update', 'delete'] as const;

type PermissionInsert = {
	collection: string;
	action: string;
	permissions: Record<string, unknown> | null;
	fields: string;
};

type PermissionsContext = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	database: any;
	logger: ScaffoldLogger;
};

function parseRoleNames(): string[] {
	const raw = process.env.KRK_TOURS_APP_ROLE ?? '';
	return raw
		.split(',')
		.map((name) => name.trim())
		.filter(Boolean);
}

async function usesRoleColumnOnPermissions(database: PermissionsContext['database']): Promise<boolean> {
	return database.schema.hasColumn('directus_permissions', 'role');
}

async function findRolesByNames(database: PermissionsContext['database'], names: string[]): Promise<string[]> {
	if (names.length === 0) return [];

	const rows = (await database('directus_roles').whereIn('name', names).select('id')) as {
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

async function findPoliciesWithPlacesAction(
	database: PermissionsContext['database'],
	action: string
): Promise<string[]> {
	const rows = (await database('directus_permissions')
		.where({ collection: 'places', action })
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
		permissions: row.permissions ?? null,
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
		permissions: row.permissions ?? null,
		validation: null,
		presets: null,
		fields: row.fields
	});

	return true;
}

async function applyViaRoles(database: PermissionsContext['database'], logger: ScaffoldLogger): Promise<number> {
	const configuredNames = parseRoleNames();
	const appRoleIds = [
		...new Set([
			...(await findRolesByNames(database, configuredNames)),
			...(
				await database('directus_permissions')
					.where({ collection: 'places', action: 'read' })
					.whereNotNull('role')
					.distinct('role')
					.select('role')
			).map((row: { role: string }) => row.role)
		])
	];

	const editorRoleIds = await (async () => {
		const configured = process.env.KRK_TOURS_EDITOR_ROLE?.trim();
		if (configured) {
			return findRolesByNames(database, [configured]);
		}
		const rows = await database('directus_permissions')
			.where({ collection: 'places', action: 'update' })
			.whereNotNull('role')
			.distinct('role')
			.select('role');
		return rows.map((row: { role: string }) => row.role);
	})();

	if (appRoleIds.length === 0) {
		logger.warn(
			'[krk-tours] No app read roles found (set KRK_TOURS_APP_ROLE or grant places read first)'
		);
	}

	let created = 0;

	for (const roleId of appRoleIds) {
		for (const collection of APP_READ_COLLECTIONS) {
			const permissions = collection === 'tours' ? { status: { _eq: 'published' } } : null;
			if (
				await insertRolePermission(database, roleId, {
					collection,
					action: 'read',
					permissions,
					fields: '*'
				})
			) {
				created++;
			}
		}
	}

	for (const roleId of editorRoleIds) {
		for (const collection of TOUR_COLLECTIONS) {
			for (const action of EDITOR_ACTIONS) {
				if (
					await insertRolePermission(database, roleId, {
						collection,
						action,
						permissions: null,
						fields: '*'
					})
				) {
					created++;
				}
			}
		}
	}

	return created;
}

async function applyViaPolicies(database: PermissionsContext['database'], logger: ScaffoldLogger): Promise<number> {
	const configuredNames = parseRoleNames();
	const configuredRoleIds = await findRolesByNames(database, configuredNames);
	const policiesFromRoles = await findPolicyIdsForRoles(database, configuredRoleIds);

	const appPolicyIds = [
		...new Set([...policiesFromRoles, ...(await findPoliciesWithPlacesAction(database, 'read'))])
	];

	const editorPolicyIds = await (async () => {
		const configured = process.env.KRK_TOURS_EDITOR_ROLE?.trim();
		if (configured) {
			const roleIds = await findRolesByNames(database, [configured]);
			return findPolicyIdsForRoles(database, roleIds);
		}
		return findPoliciesWithPlacesAction(database, 'update');
	})();

	if (appPolicyIds.length === 0) {
		logger.warn(
			'[krk-tours] No policies with places read found (set KRK_TOURS_APP_ROLE or grant places read on a policy first)'
		);
	}

	let created = 0;

	for (const policyId of appPolicyIds) {
		for (const collection of APP_READ_COLLECTIONS) {
			const permissions = collection === 'tours' ? { status: { _eq: 'published' } } : null;
			if (
				await insertPolicyPermission(database, policyId, {
					collection,
					action: 'read',
					permissions,
					fields: '*'
				})
			) {
				created++;
			}
		}
	}

	for (const policyId of editorPolicyIds) {
		for (const collection of TOUR_COLLECTIONS) {
			for (const action of EDITOR_ACTIONS) {
				if (
					await insertPolicyPermission(database, policyId, {
						collection,
						action,
						permissions: null,
						fields: '*'
					})
				) {
					created++;
				}
			}
		}
	}

	return created;
}

export async function applyTourPermissions(context: PermissionsContext): Promise<number> {
	const { database, logger } = context;

	const hasPermissionsTable = await database.schema.hasTable('directus_permissions');
	if (!hasPermissionsTable) {
		logger.warn('[krk-tours] directus_permissions table missing; skip permissions');
		return 0;
	}

	const useRoleColumn = await usesRoleColumnOnPermissions(database);
	const created = useRoleColumn
		? await applyViaRoles(database, logger)
		: await applyViaPolicies(database, logger);

	if (created > 0) {
		logger.info(`[krk-tours] Created ${created} permission row(s)`);
	} else {
		logger.debug('[krk-tours] Tour permissions already present or no roles/policies matched');
	}

	return created;
}
