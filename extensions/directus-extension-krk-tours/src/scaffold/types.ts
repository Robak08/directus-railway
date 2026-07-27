export type DirectusStateCollection = {
	collection: string;
	meta?: Record<string, unknown>;
	schema?: Record<string, unknown> | null;
};

export type DirectusStateField = {
	collection: string;
	field: string;
	type: string;
	meta?: Record<string, unknown>;
	schema?: {
		foreign_key_table?: string | null;
		[key: string]: unknown;
	} | null;
};

export type DirectusStateRelation = {
	collection: string;
	field: string;
	related_collection: string;
	schema?: {
		constraint_name?: string | null;
		foreign_key_table?: string;
		foreign_key_column?: string;
		[key: string]: unknown;
	} | null;
	meta?: Record<string, unknown>;
};

export type DirectusState = {
	collections: DirectusStateCollection[];
	fields: DirectusStateField[];
	relations: DirectusStateRelation[];
};

export type ScaffoldLogger = {
	debug: (msg: string) => void;
	info: (msg: string) => void;
	warn: (msg: string) => void;
	error: (msg: string, extra?: unknown) => void;
};

export type ScaffoldSummary = {
	collectionsCreated: number;
	fieldsCreated: number;
	relationsCreated: number;
	relationsRepaired: number;
	relationsUnchanged: number;
	permissionsCreated: number;
	failedRelations: string[];
	errors: string[];
};

export type RelationsServiceLike = {
	createOne: (data: DirectusStateRelation) => Promise<unknown>;
	updateOne: (primaryKey: number, data: DirectusStateRelation) => Promise<unknown>;
};

export type ExistingRelationRow = {
	id: number;
	related_collection: string | null;
	junction_field: string | null;
	one_field: string | null;
	foreign_key_table: string | null;
	foreign_key_column: string | null;
};

export type RelationSnapshot = {
	related_collection: string | null;
	foreign_key_table: string | null;
	foreign_key_column: string | null;
	junction_field: string | null;
	one_field: string | null;
};

export type DatabaseLike = {
	select: (columns?: string | string[]) => {
		from: (table: string) => {
			where: (
				criteria: Record<string, string> | string,
				value?: string
			) => {
				first: () => Promise<unknown>;
				limit?: (n: number) => { first: () => Promise<unknown> };
			};
		};
	};
};
