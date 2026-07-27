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

type PermissionRow = {
	id?: number;
	role: string | null;
	collection: string;
	action: string;
	permissions: Record<string, unknown> | null;
	validation: Record<string, unknown> | null;
	presets: Record<string, unknown> | null;
	fields: string[] | null;
	policy: string | null;
};

type PermissionsContext = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	database: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	getSchema: (options?: { database?: any }) => Promise<unknown>;
	logger: ScaffoldLogger;
};

function parseRoleNames(): string[] {
	const raw = process.env.KRK_TOURS_APP_ROLE ?? '';
	return raw
		.split(',')
		.map((name) => name.trim())
		.filter(Boolean);
}

async function findRolesByNames(database: PermissionsContext['database'], names: string[]): Promise<string[]> {
	if (names.length === 0) return [];

	const rows = (await database('directus_roles').whereIn('name', names).select('id')) as {
		id: string;
	}[];

	return rows.map((row) => row.id);
}

async function findRolesWithPlacesRead(database: PermissionsContext['database']): Promise<string[]> {
	const rows = (await database('directus_permissions')
		.where({ collection: 'places', action: 'read' })
		.whereNotNull('role')
		.distinct('role')
		.select('role')) as { role: string }[];

	return rows.map((row) => row.role).filter(Boolean);
}

async function findEditorRoles(database: PermissionsContext['database']): Promise<string[]> {
	const configured = process.env.KRK_TOURS_EDITOR_ROLE?.trim();
	if (configured) {
		const rows = (await database('directus_roles').where({ name: configured }).select('id')) as {
			id: string;
		}[];
		return rows.map((row) => row.id);
	}

	const rows = (await database('directus_permissions')
		.where({ collection: 'places', action: 'update' })
		.whereNotNull('role')
		.distinct('role')
		.select('role')) as { role: string }[];

	return rows.map((row) => row.role).filter(Boolean);
}

async function permissionExists(
	database: PermissionsContext['database'],
	role: string,
	collection: string,
	action: string
): Promise<boolean> {
	const row = await database('directus_permissions')
		.where({ role, collection, action })
		.first();

	return Boolean(row);
}

async function createPermission(
	database: PermissionsContext['database'],
	row: Omit<PermissionRow, 'id'>
): Promise<boolean> {
	if (!row.role) return false;

	const exists = await permissionExists(database, row.role, row.collection, row.action);
	if (exists) return false;

	await database('directus_permissions').insert({
		role: row.role,
		collection: row.collection,
		action: row.action,
		permissions: row.permissions ?? null,
		validation: row.validation ?? null,
		presets: row.presets ?? null,
		fields: Array.isArray(row.fields) ? row.fields.join(',') : (row.fields ?? '*'),
		policy: row.policy
	});

	return true;
}

export async function applyTourPermissions(context: PermissionsContext): Promise<number> {
	const { database, logger } = context;

	const hasPermissionsTable = await database.schema.hasTable('directus_permissions');
	if (!hasPermissionsTable) {
		logger.warn('[krk-tours] directus_permissions table missing; skip permissions');
		return 0;
	}

	const configuredNames = parseRoleNames();
	const appRoleIds = [
		...new Set([
			...(await findRolesByNames(database, configuredNames)),
			...(await findRolesWithPlacesRead(database))
		])
	];

	const editorRoleIds = [...new Set(await findEditorRoles(database))];

	if (appRoleIds.length === 0) {
		logger.warn(
			'[krk-tours] No app read roles found (set KRK_TOURS_APP_ROLE or grant places read first)'
		);
	}

	let created = 0;

	for (const roleId of appRoleIds) {
		for (const collection of APP_READ_COLLECTIONS) {
			const permissions =
				collection === 'tours' ? { status: { _eq: 'published' } } : null;

			if (
				await createPermission(database, {
					role: roleId,
					collection,
					action: 'read',
					permissions,
					validation: null,
					presets: null,
					fields: ['*'],
					policy: null
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
					await createPermission(database, {
						role: roleId,
						collection,
						action,
						permissions: action === 'read' ? null : null,
						validation: null,
						presets: null,
						fields: ['*'],
						policy: null
					})
				) {
					created++;
				}
			}
		}
	}

	if (created > 0) {
		logger.info(`[krk-tours] Created ${created} permission row(s)`);
	} else {
		logger.debug('[krk-tours] Tour permissions already present or no roles matched');
	}

	return created;
}
