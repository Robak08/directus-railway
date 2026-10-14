/** Minimal accountability shape on Directus API requests (Express Request extension). */
export type DirectusRequestAccountability = {
	user?: string | null;
	role?: string | null;
	roles?: string[];
	admin?: boolean;
	app?: boolean;
	ip?: string | null;
	origin?: string | null;
};

export type DirectusRequest = {
	accountability?: DirectusRequestAccountability | null;
	method?: string;
	url?: string;
	headers?: Record<string, string | string[] | undefined>;
	body?: unknown;
};
