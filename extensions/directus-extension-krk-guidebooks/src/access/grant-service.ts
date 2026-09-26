import type { Accountability } from '@directus/types';
import {
	projectAccessForGuidebook,
	projectAllAccessForUser,
	type GrantRecord,
	type GuidebookCapability
} from '@krk/guidebooks-core';

export const createServiceAccountability = (): Accountability => ({
	user: null,
	role: null,
	admin: true,
	app: false,
	ip: null,
	origin: null
});

type ItemsServiceLike = {
	readByQuery: (query: Record<string, unknown>) => Promise<GrantRecord[]>;
	readOne: (key: string) => Promise<GrantRecord>;
	createOne: (data: Record<string, unknown>) => Promise<GrantRecord>;
	updateOne: (key: string, data: Record<string, unknown>) => Promise<GrantRecord>;
	deleteByQuery: (query: Record<string, unknown>) => Promise<void>;
};

export type DirectusServices = {
	ItemsService: new (
		collection: string,
		options: { schema: unknown; accountability?: Accountability | null }
	) => ItemsServiceLike;
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
		schema,
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

	if (existing.length > 0) {
		return items.updateOne(existing[0].id, {
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
		schema,
		accountability
	});
	const accessService = new params.services.ItemsService('customer_guidebook_access', {
		schema,
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
			catalog_until: projection.catalog_until,
			pdf_until: projection.pdf_until,
			grant_count: projection.grant_count,
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
		schema,
		accountability
	});
	const accessService = new params.services.ItemsService('customer_guidebook_access', {
		schema,
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
			...projection,
			projection_version: 1,
			reconciled_at: new Date().toISOString()
		});
		return;
	}

	await accessService.updateOne(existing[0].id, {
		can_catalog: projection.can_catalog,
		can_pdf: projection.can_pdf,
		catalog_until: projection.catalog_until,
		pdf_until: projection.pdf_until,
		grant_count: projection.grant_count,
		projection_version: 1,
		reconciled_at: new Date().toISOString()
	});
};

export const userHasPdfAccess = async (params: {
	services: DirectusServices;
	getSchema: () => Promise<unknown>;
	userId: string;
	guidebookId: string;
}): Promise<boolean> => {
	const schema = await params.getSchema();
	const accessService = new params.services.ItemsService('customer_guidebook_access', {
		schema,
		accountability: createServiceAccountability()
	});

	const rows = await accessService.readByQuery({
		filter: {
			_and: [
				{ user_id: { _eq: params.userId } },
				{ guidebook_id: { _eq: params.guidebookId } },
				{ can_pdf: { _eq: true } }
			]
		},
		limit: 1
	});

	return rows.length > 0;
};
