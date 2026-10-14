import {
	projectAccessForGuidebook,
	projectAllAccessForUser,
	type GrantRecord,
	type GuidebookCapability
} from './access.js';

export type DirectusServiceAccountability = {
	user: string | null;
	role: string | null;
	roles: string[];
	admin: boolean;
	app: boolean;
	ip: string | null;
	origin?: string | null;
};

export const createServiceAccountability = (): DirectusServiceAccountability => ({
	user: null,
	role: null,
	roles: [],
	admin: true,
	app: false,
	ip: null
});

type ItemsServiceLike = {
	readByQuery: (query: Record<string, unknown>) => Promise<GrantRecord[]>;
	readOne: (key: string) => Promise<GrantRecord>;
	createOne: (data: Record<string, unknown>) => Promise<GrantRecord>;
	updateOne: (key: string, data: Record<string, unknown>) => Promise<GrantRecord>;
	deleteByQuery: (query: Record<string, unknown>) => Promise<void>;
};

export type DirectusItemsServiceOptions = {
	schema: object;
	accountability?: DirectusServiceAccountability | null;
	/** Present on CollectionsService / schema helpers; kept wide for SDK assignability. */
	knex?: object;
};

export type DirectusServices = {
	ItemsService: new (collection: string, options: DirectusItemsServiceOptions) => ItemsServiceLike;
};

export const normalizeCapabilities = (value: unknown): GuidebookCapability[] => {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(entry): entry is GuidebookCapability => entry === 'catalog' || entry === 'pdf'
	);
};

export const upsertGrant = async (params: {
	services: DirectusServices;
	getSchema: () => Promise<unknown>;
	data: {
		user_id: string;
		guidebook_id: string;
		capabilities: GuidebookCapability[];
		source_type: GrantRecord['source_type'];
		source_id: string;
		offer_id?: string | null;
		status?: GrantRecord['status'];
		valid_from?: string | null;
		valid_until?: string | null;
	};
}): Promise<GrantRecord> => {
	const schema = await params.getSchema();
	const items = new params.services.ItemsService('customer_guidebook_grants', {
		schema: schema as object,
		accountability: createServiceAccountability()
	});

	const existing = await items.readByQuery({
		filter: {
			_and: [
				{ source_type: { _eq: params.data.source_type } },
				{ source_id: { _eq: params.data.source_id } },
				{ guidebook_id: { _eq: params.data.guidebook_id } }
			]
		},
		limit: 1
	});

	const existingGrant = existing[0];
	if (existingGrant) {
		return items.updateOne(existingGrant.id, {
			capabilities: params.data.capabilities,
			status: params.data.status ?? 'active',
			offer_id: params.data.offer_id ?? null,
			valid_from: params.data.valid_from ?? null,
			valid_until: params.data.valid_until ?? null
		});
	}

	return items.createOne({
		...params.data,
		status: params.data.status ?? 'active'
	});
};

export const rebuildAccessForUser = async (params: {
	services: DirectusServices;
	getSchema: () => Promise<unknown>;
	userId: string;
}): Promise<number> => {
	const schema = await params.getSchema();
	const accountability = createServiceAccountability();
	const grantsService = new params.services.ItemsService('customer_guidebook_grants', {
		schema: schema as object,
		accountability
	});
	const accessService = new params.services.ItemsService('customer_guidebook_access', {
		schema: schema as object,
		accountability
	});

	const grants = (await grantsService.readByQuery({
		filter: { user_id: { _eq: params.userId } },
		limit: -1
	})) as GrantRecord[];

	const projections = projectAllAccessForUser(params.userId, grants);
	await accessService.deleteByQuery({ filter: { user_id: { _eq: params.userId } } });

	for (const projection of projections) {
		await accessService.createOne({
			user_id: projection.user_id,
			guidebook_id: projection.guidebook_id,
			can_catalog: projection.can_catalog,
			can_pdf: projection.can_pdf,
			projection_version: 1,
			reconciled_at: new Date().toISOString()
		});
	}

	return projections.length;
};

export const rebuildAccessForUserGuidebook = async (params: {
	services: DirectusServices;
	getSchema: () => Promise<unknown>;
	userId: string;
	guidebookId: string;
}): Promise<void> => {
	const schema = await params.getSchema();
	const accountability = createServiceAccountability();
	const grantsService = new params.services.ItemsService('customer_guidebook_grants', {
		schema: schema as object,
		accountability
	});
	const accessService = new params.services.ItemsService('customer_guidebook_access', {
		schema: schema as object,
		accountability
	});

	const grants = (await grantsService.readByQuery({
		filter: {
			_and: [
				{ user_id: { _eq: params.userId } },
				{ guidebook_id: { _eq: params.guidebookId } }
			]
		},
		limit: -1
	})) as GrantRecord[];

	const projection = projectAccessForGuidebook(params.userId, params.guidebookId, grants);

	const existing = await accessService.readByQuery({
		filter: {
			_and: [
				{ user_id: { _eq: params.userId } },
				{ guidebook_id: { _eq: params.guidebookId } }
			]
		},
		limit: 1
	});

	if (existing.length === 0) {
		await accessService.createOne({
			user_id: projection.user_id,
			guidebook_id: projection.guidebook_id,
			can_catalog: projection.can_catalog,
			can_pdf: projection.can_pdf,
			projection_version: 1,
			reconciled_at: new Date().toISOString()
		});
		return;
	}

	const existingAccess = existing[0];
	if (!existingAccess) {
		return;
	}

	await accessService.updateOne(existingAccess.id, {
		can_catalog: projection.can_catalog,
		can_pdf: projection.can_pdf,
		projection_version: 1,
		reconciled_at: new Date().toISOString()
	});
};
