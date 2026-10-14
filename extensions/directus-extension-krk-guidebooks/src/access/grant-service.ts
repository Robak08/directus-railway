import type { Accountability } from '@directus/types';
import type { GrantRecord } from '@krk/guidebooks-core';
import {
	createServiceAccountability as createCoreServiceAccountability,
	normalizeCapabilities,
	rebuildAccessForUser as rebuildAccessForUserCore,
	rebuildAccessForUserGuidebook as rebuildAccessForUserGuidebookCore,
	upsertGrant as upsertGrantCore,
	type DirectusServices as CoreDirectusServices
} from '@krk/guidebooks-core';

export const createServiceAccountability = (): Accountability =>
	createCoreServiceAccountability() as Accountability;

export type DirectusServices = CoreDirectusServices;

export { normalizeCapabilities };

export const upsertGrant = async (params: {
	services: DirectusServices;
	getSchema: () => Promise<unknown>;
	data: {
		user_id: string;
		guidebook_id: string;
		capabilities: GrantRecord['capabilities'];
		source_type: GrantRecord['source_type'];
		source_id: string;
		offer_id?: string | null;
		status?: GrantRecord['status'];
		valid_from?: string | null;
		valid_until?: string | null;
	};
}): Promise<GrantRecord> => upsertGrantCore(params);

export const rebuildAccessForUser = rebuildAccessForUserCore;
export const rebuildAccessForUserGuidebook = rebuildAccessForUserGuidebookCore;

export const userHasPdfAccess = async (params: {
	services: DirectusServices;
	getSchema: () => Promise<unknown>;
	userId: string;
	guidebookId: string;
}): Promise<boolean> => {
	const schema = await params.getSchema();
	const accessService = new params.services.ItemsService('customer_guidebook_access', {
		schema: schema as object,
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
