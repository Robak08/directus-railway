export type GuidebookCapability = 'catalog' | 'pdf';

export type GrantStatus =
	| 'pending'
	| 'active'
	| 'expired'
	| 'revoked'
	| 'refunded'
	| 'disputed';

export type GrantSourceType =
	| 'stripe_checkout'
	| 'stripe_subscription'
	| 'payment_link'
	| 'admin'
	| 'migration';

export type GrantRecord = {
	id: string;
	user_id: string;
	guidebook_id: string;
	capabilities: GuidebookCapability[];
	status: GrantStatus;
	source_type: GrantSourceType;
	source_id: string;
	valid_from: string | Date | null;
	valid_until: string | Date | null;
};

export type AccessProjection = {
	user_id: string;
	guidebook_id: string;
	can_catalog: boolean;
	can_pdf: boolean;
	catalog_until: string | Date | null;
	pdf_until: string | Date | null;
	grant_count: number;
};

const ACTIVE_STATUSES: GrantStatus[] = ['active'];

const parseDate = (value: string | Date | null | undefined): Date | null => {
	if (!value) return null;
	if (value instanceof Date) return value;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const grantIsEffectiveNow = (grant: GrantRecord, at: Date = new Date()): boolean => {
	if (!ACTIVE_STATUSES.includes(grant.status)) {
		return false;
	}

	const from = parseDate(grant.valid_from);
	if (from && from > at) {
		return false;
	}

	const until = parseDate(grant.valid_until);
	if (until && until < at) {
		return false;
	}

	return true;
};

export const projectAccessForGuidebook = (
	userId: string,
	guidebookId: string,
	grants: GrantRecord[],
	at: Date = new Date()
): AccessProjection => {
	const effective = grants.filter(
		(g) =>
			g.user_id === userId &&
			g.guidebook_id === guidebookId &&
			grantIsEffectiveNow(g, at)
	);

	let canCatalog = false;
	let canPdf = false;
	let catalogUntil: Date | null = null;
	let pdfUntil: Date | null = null;

	for (const grant of effective) {
		if (grant.capabilities.includes('catalog')) {
			canCatalog = true;
			const until = parseDate(grant.valid_until);
			if (until && (!catalogUntil || until < catalogUntil)) {
				catalogUntil = until;
			}
		}
		if (grant.capabilities.includes('pdf')) {
			canPdf = true;
			const until = parseDate(grant.valid_until);
			if (until && (!pdfUntil || until < pdfUntil)) {
				pdfUntil = until;
			}
		}
	}

	return {
		user_id: userId,
		guidebook_id: guidebookId,
		can_catalog: canCatalog,
		can_pdf: canPdf,
		catalog_until: catalogUntil,
		pdf_until: pdfUntil,
		grant_count: effective.length
	};
};

export const projectAllAccessForUser = (
	userId: string,
	grants: GrantRecord[],
	at: Date = new Date()
): AccessProjection[] => {
	const byGuidebook = new Map<string, GrantRecord[]>();
	for (const grant of grants) {
		if (grant.user_id !== userId) continue;
		const list = byGuidebook.get(grant.guidebook_id) ?? [];
		list.push(grant);
		byGuidebook.set(grant.guidebook_id, list);
	}

	return [...byGuidebook.entries()].map(([guidebookId, guideGrants]) =>
		projectAccessForGuidebook(userId, guidebookId, guideGrants, at)
	);
};
