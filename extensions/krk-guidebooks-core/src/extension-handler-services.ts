import type { DirectusItemsServiceOptions } from './grant-directus.js';

/** Service instance returned from scaffold/endpoints (intentionally loose for SDK assignability). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ExtensionServiceInstance = any;

export type ExtensionHandlerServices = {
	ItemsService: new (
		collection: string,
		options: DirectusItemsServiceOptions
	) => ExtensionServiceInstance;
	CollectionsService: new (options: DirectusItemsServiceOptions) => ExtensionServiceInstance;
	FieldsService: new (options: DirectusItemsServiceOptions) => ExtensionServiceInstance;
	RelationsService: new (options: DirectusItemsServiceOptions) => ExtensionServiceInstance;
	PermissionsService: new (options: DirectusItemsServiceOptions) => ExtensionServiceInstance;
};
