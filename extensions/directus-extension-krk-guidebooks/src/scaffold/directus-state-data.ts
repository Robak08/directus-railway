import type { DirectusState } from './types.js';

export const GUIDEBOOK_COLLECTION_COLOR = '#6366F1';

const uuidPk = {
	name: 'id',
	data_type: 'uuid',
	is_nullable: false,
	is_primary_key: true,
	has_auto_increment: false,
	is_unique: false,
	is_indexed: false,
	foreign_key_column: null,
	foreign_key_table: null
};

const integerPk = {
	name: 'id',
	data_type: 'integer',
	is_nullable: false,
	is_primary_key: true,
	has_auto_increment: true,
	is_unique: false,
	is_indexed: false,
	foreign_key_column: null,
	foreign_key_table: null
};

const statusField = (collection: string, sort = 2) => ({
	collection,
	field: 'status',
	type: 'string',
	schema: {
		name: 'status',
		table: collection,
		data_type: 'varchar',
		max_length: 255,
		default_value: 'draft',
		is_nullable: false,
		is_primary_key: false,
		has_auto_increment: false
	},
	meta: {
		collection,
		field: 'status',
		interface: 'select-dropdown',
		options: {
			choices: [
				{ text: 'Published', value: 'published' },
				{ text: 'Draft', value: 'draft' },
				{ text: 'Archived', value: 'archived' }
			]
		},
		sort,
		width: 'half',
		required: true
	}
});

const uuidFk = (
	collection: string,
	field: string,
	table: string,
	related: string,
	sort: number,
	required = false
) => ({
	collection,
	field,
	type: 'uuid',
	schema: {
		name: field,
		table: collection,
		data_type: 'uuid',
		is_nullable: !required,
		is_primary_key: false,
		has_auto_increment: false,
		foreign_key_column: 'id',
		foreign_key_table: related
	},
	meta: {
		collection,
		field,
		special: ['m2o'],
		interface: 'select-dropdown-m2o',
		options: { template: '{{slug}}' },
		sort,
		width: 'half',
		required
	}
});

const m2mAliasField = (
	collection: string,
	field: string,
	template: string,
	sort: number,
	note?: string
) => ({
	collection,
	field,
	type: 'alias',
	schema: null,
	meta: {
		collection,
		field,
		special: ['m2m'],
		interface: 'list-m2m',
		options: { template },
		sort,
		width: 'full',
		...(note ? { note } : {})
	}
});

const junctionPair = (
	junction: string,
	guidebookField: string,
	relatedField: string,
	relatedCollection: string,
	relatedColumn: string
) => [
	{
		collection: junction,
		field: 'id',
		type: 'uuid',
		schema: { ...uuidPk, table: junction },
		meta: {
			collection: junction,
			field: 'id',
			special: ['uuid'],
			hidden: true,
			readonly: true,
			sort: 1
		}
	},
	uuidFk(junction, guidebookField, junction, 'guidebooks', 2, true),
	{
		collection: junction,
		field: relatedField,
		type: relatedCollection === 'tips' ? 'integer' : 'uuid',
		schema: {
			name: relatedField,
			table: junction,
			data_type: relatedCollection === 'tips' ? 'integer' : 'uuid',
			is_nullable: false,
			is_primary_key: false,
			has_auto_increment: false,
			foreign_key_column: relatedColumn,
			foreign_key_table: relatedCollection
		},
		meta: {
			collection: junction,
			field: relatedField,
			special: ['m2o'],
			interface: 'select-dropdown-m2o',
			sort: 3,
			width: 'half',
			required: true
		}
	}
];

const collectionMeta = (collection: string, note: string, hidden = false) => ({
	collection,
	meta: {
		collection,
		icon: 'menu_book',
		color: GUIDEBOOK_COLLECTION_COLOR,
		note,
		hidden,
		singleton: false,
		accountability: 'all',
		collapse: 'open'
	},
	schema: {}
});

/** Versioned Directus metadata for guidebook domain collections. */
export const directusState: DirectusState = {
	collections: [
		collectionMeta('destinations', 'Geographic destinations (cities)'),
		collectionMeta('guidebooks', 'Purchasable city guidebooks'),
		collectionMeta('guidebook_offers', 'Stripe-backed offers', true),
		collectionMeta('customer_guidebook_grants', 'Per-source guidebook grants', true),
		collectionMeta('customer_guidebook_access', 'Effective guidebook access projection', true),
		collectionMeta('stripe_webhook_events', 'Stripe webhook idempotency ledger', true),
		collectionMeta('guidebook_purchase_claims', 'Payment-link purchase claims', true),
		collectionMeta('guidebooks_places', 'Guidebook ↔ places assignments', true),
		collectionMeta('guidebooks_events', 'Guidebook ↔ events assignments', true),
		collectionMeta('guidebooks_tours', 'Guidebook ↔ tours assignments', true),
		collectionMeta('guidebooks_places_regions', 'Guidebook region vocabulary subset', true),
		collectionMeta('tips_guidebooks', 'Tips selected guidebooks junction', true),
		collectionMeta('guidebook_migration_ledger', 'Guidebook migration phase ledger', true)
	],
	fields: [
		{
			collection: 'destinations',
			field: 'id',
			type: 'uuid',
			schema: { ...uuidPk, table: 'destinations' },
			meta: { collection: 'destinations', field: 'id', special: ['uuid'], hidden: true, readonly: true, sort: 1 }
		},
		statusField('destinations'),
		{
			collection: 'destinations',
			field: 'slug',
			type: 'string',
			schema: {
				name: 'slug',
				table: 'destinations',
				data_type: 'varchar',
				max_length: 255,
				is_nullable: false,
				is_unique: true,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'destinations', field: 'slug', interface: 'input', sort: 3, required: true }
		},
		{
			collection: 'destinations',
			field: 'title',
			type: 'string',
			schema: {
				name: 'title',
				table: 'destinations',
				data_type: 'varchar',
				max_length: 255,
				is_nullable: false,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'destinations', field: 'title', interface: 'input', sort: 4, required: true }
		},
		{
			collection: 'destinations',
			field: 'timezone',
			type: 'string',
			schema: {
				name: 'timezone',
				table: 'destinations',
				data_type: 'varchar',
				max_length: 255,
				is_nullable: true,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'destinations', field: 'timezone', interface: 'input', sort: 5 }
		},
		{
			collection: 'guidebooks',
			field: 'id',
			type: 'uuid',
			schema: { ...uuidPk, table: 'guidebooks' },
			meta: { collection: 'guidebooks', field: 'id', special: ['uuid'], hidden: true, readonly: true, sort: 1 }
		},
		statusField('guidebooks'),
		{
			collection: 'guidebooks',
			field: 'slug',
			type: 'string',
			schema: {
				name: 'slug',
				table: 'guidebooks',
				data_type: 'varchar',
				max_length: 255,
				is_nullable: false,
				is_unique: true,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'guidebooks', field: 'slug', interface: 'input', sort: 3, required: true }
		},
		uuidFk('guidebooks', 'destination_id', 'guidebooks', 'destinations', 4, true),
		{
			collection: 'guidebooks',
			field: 'title',
			type: 'string',
			schema: {
				name: 'title',
				table: 'guidebooks',
				data_type: 'varchar',
				max_length: 255,
				is_nullable: false,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'guidebooks', field: 'title', interface: 'input', sort: 5, required: true }
		},
		{
			collection: 'guidebooks',
			field: 'daisy_theme',
			type: 'string',
			schema: {
				name: 'daisy_theme',
				table: 'guidebooks',
				data_type: 'varchar',
				max_length: 64,
				default_value: 'krk',
				is_nullable: false,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'guidebooks', field: 'daisy_theme', interface: 'input', sort: 6, required: true }
		},
		{
			collection: 'guidebooks',
			field: 'pdf_file',
			type: 'uuid',
			schema: {
				name: 'pdf_file',
				table: 'guidebooks',
				data_type: 'uuid',
				is_nullable: true,
				is_primary_key: false,
				has_auto_increment: false,
				foreign_key_column: 'id',
				foreign_key_table: 'directus_files'
			},
			meta: {
				collection: 'guidebooks',
				field: 'pdf_file',
				special: ['file'],
				interface: 'file',
				sort: 7
			}
		},
		{
			collection: 'guidebooks',
			field: 'pdf_version',
			type: 'string',
			schema: {
				name: 'pdf_version',
				table: 'guidebooks',
				data_type: 'varchar',
				max_length: 64,
				is_nullable: true,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'guidebooks', field: 'pdf_version', interface: 'input', sort: 8 }
		},
		{
			collection: 'guidebooks',
			field: 'pdf_updated',
			type: 'date',
			schema: {
				name: 'pdf_updated',
				table: 'guidebooks',
				data_type: 'date',
				is_nullable: true,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'guidebooks', field: 'pdf_updated', interface: 'datetime', sort: 9 }
		},
		m2mAliasField('guidebooks', 'places', '{{places_id.title}}', 20, 'Assigned places for this guidebook'),
		m2mAliasField('guidebooks', 'events', '{{events_id.title}}', 21, 'Assigned events for this guidebook'),
		m2mAliasField('guidebooks', 'tours', '{{tours_id.translations.title}}', 22, 'Assigned tours for this guidebook'),
		m2mAliasField(
			'guidebooks',
			'places_regions',
			'{{places_regions_id.title}}',
			23,
			'Region vocabulary subset for this guidebook'
		),
		m2mAliasField('guidebooks', 'tips', '{{tips_id.title}}', 24, 'Tips linked when using selected guidebooks scope'),
		{
			collection: 'guidebook_offers',
			field: 'id',
			type: 'uuid',
			schema: { ...uuidPk, table: 'guidebook_offers' },
			meta: { collection: 'guidebook_offers', field: 'id', special: ['uuid'], hidden: true, readonly: true, sort: 1 }
		},
		statusField('guidebook_offers'),
		uuidFk('guidebook_offers', 'guidebook_id', 'guidebook_offers', 'guidebooks', 3, true),
		{
			collection: 'guidebook_offers',
			field: 'slug',
			type: 'string',
			schema: {
				name: 'slug',
				table: 'guidebook_offers',
				data_type: 'varchar',
				max_length: 255,
				is_nullable: false,
				is_unique: true,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'guidebook_offers', field: 'slug', interface: 'input', sort: 4, required: true }
		},
		{
			collection: 'guidebook_offers',
			field: 'capabilities',
			type: 'json',
			schema: {
				name: 'capabilities',
				table: 'guidebook_offers',
				data_type: 'json',
				is_nullable: false,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'guidebook_offers', field: 'capabilities', interface: 'input-code', sort: 5, required: true }
		},
		{
			collection: 'guidebook_offers',
			field: 'access_kind',
			type: 'string',
			schema: {
				name: 'access_kind',
				table: 'guidebook_offers',
				data_type: 'varchar',
				max_length: 32,
				default_value: 'lifetime',
				is_nullable: false,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'guidebook_offers', field: 'access_kind', interface: 'input', sort: 6 }
		},
		{
			collection: 'guidebook_offers',
			field: 'stripe_price_id',
			type: 'string',
			schema: {
				name: 'stripe_price_id',
				table: 'guidebook_offers',
				data_type: 'varchar',
				max_length: 255,
				is_nullable: true,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'guidebook_offers', field: 'stripe_price_id', interface: 'input', sort: 7 }
		},
		{
			collection: 'guidebook_offers',
			field: 'stripe_mode',
			type: 'string',
			schema: {
				name: 'stripe_mode',
				table: 'guidebook_offers',
				data_type: 'varchar',
				max_length: 32,
				default_value: 'payment',
				is_nullable: false,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'guidebook_offers', field: 'stripe_mode', interface: 'input', sort: 8 }
		},
		...buildGrantAccessFields(),
		...junctionPair('guidebooks_places', 'guidebook_id', 'places_id', 'places', 'id'),
		...junctionPair('guidebooks_events', 'guidebook_id', 'events_id', 'events', 'id'),
		...junctionPair('guidebooks_tours', 'guidebook_id', 'tours_id', 'tours', 'id'),
		...junctionPair('guidebooks_places_regions', 'guidebook_id', 'places_regions_id', 'places_regions', 'id'),
		...junctionPair('tips_guidebooks', 'guidebooks_id', 'tips_id', 'tips', 'id'),
		...buildMigrationLedgerFields(),
		...buildExistingCollectionExtensions()
	],
	relations: buildRelations()
};

function buildGrantAccessFields() {
	const grantFields = [
		{
			collection: 'customer_guidebook_grants',
			field: 'id',
			type: 'uuid',
			schema: { ...uuidPk, table: 'customer_guidebook_grants' },
			meta: {
				collection: 'customer_guidebook_grants',
				field: 'id',
				special: ['uuid'],
				hidden: true,
				readonly: true,
				sort: 1
			}
		},
		uuidFk('customer_guidebook_grants', 'user_id', 'customer_guidebook_grants', 'directus_users', 2, true),
		uuidFk('customer_guidebook_grants', 'guidebook_id', 'customer_guidebook_grants', 'guidebooks', 3, true),
		{
			collection: 'customer_guidebook_grants',
			field: 'capabilities',
			type: 'json',
			schema: {
				name: 'capabilities',
				table: 'customer_guidebook_grants',
				data_type: 'json',
				is_nullable: false,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'customer_guidebook_grants', field: 'capabilities', interface: 'input-code', sort: 4, required: true }
		},
		{
			collection: 'customer_guidebook_grants',
			field: 'status',
			type: 'string',
			schema: {
				name: 'status',
				table: 'customer_guidebook_grants',
				data_type: 'varchar',
				max_length: 32,
				default_value: 'active',
				is_nullable: false,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'customer_guidebook_grants', field: 'status', interface: 'input', sort: 5, required: true }
		},
		{
			collection: 'customer_guidebook_grants',
			field: 'source_type',
			type: 'string',
			schema: {
				name: 'source_type',
				table: 'customer_guidebook_grants',
				data_type: 'varchar',
				max_length: 64,
				is_nullable: false,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'customer_guidebook_grants', field: 'source_type', interface: 'input', sort: 6, required: true }
		},
		{
			collection: 'customer_guidebook_grants',
			field: 'source_id',
			type: 'string',
			schema: {
				name: 'source_id',
				table: 'customer_guidebook_grants',
				data_type: 'varchar',
				max_length: 255,
				is_nullable: false,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'customer_guidebook_grants', field: 'source_id', interface: 'input', sort: 7, required: true }
		},
		uuidFk('customer_guidebook_grants', 'offer_id', 'customer_guidebook_grants', 'guidebook_offers', 8, false),
		{
			collection: 'customer_guidebook_grants',
			field: 'valid_from',
			type: 'timestamp',
			schema: {
				name: 'valid_from',
				table: 'customer_guidebook_grants',
				data_type: 'timestamp with time zone',
				is_nullable: true,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'customer_guidebook_grants', field: 'valid_from', interface: 'datetime', sort: 9 }
		},
		{
			collection: 'customer_guidebook_grants',
			field: 'valid_until',
			type: 'timestamp',
			schema: {
				name: 'valid_until',
				table: 'customer_guidebook_grants',
				data_type: 'timestamp with time zone',
				is_nullable: true,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'customer_guidebook_grants', field: 'valid_until', interface: 'datetime', sort: 10 }
		},
		{
			collection: 'customer_guidebook_access',
			field: 'id',
			type: 'uuid',
			schema: { ...uuidPk, table: 'customer_guidebook_access' },
			meta: {
				collection: 'customer_guidebook_access',
				field: 'id',
				special: ['uuid'],
				hidden: true,
				readonly: true,
				sort: 1
			}
		},
		uuidFk('customer_guidebook_access', 'user_id', 'customer_guidebook_access', 'directus_users', 2, true),
		uuidFk('customer_guidebook_access', 'guidebook_id', 'customer_guidebook_access', 'guidebooks', 3, true),
		{
			collection: 'customer_guidebook_access',
			field: 'can_catalog',
			type: 'boolean',
			schema: {
				name: 'can_catalog',
				table: 'customer_guidebook_access',
				data_type: 'boolean',
				default_value: false,
				is_nullable: false,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'customer_guidebook_access', field: 'can_catalog', interface: 'boolean', sort: 4 }
		},
		{
			collection: 'customer_guidebook_access',
			field: 'can_pdf',
			type: 'boolean',
			schema: {
				name: 'can_pdf',
				table: 'customer_guidebook_access',
				data_type: 'boolean',
				default_value: false,
				is_nullable: false,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'customer_guidebook_access', field: 'can_pdf', interface: 'boolean', sort: 5 }
		},
		{
			collection: 'customer_guidebook_access',
			field: 'projection_version',
			type: 'integer',
			schema: {
				name: 'projection_version',
				table: 'customer_guidebook_access',
				data_type: 'integer',
				default_value: 1,
				is_nullable: false,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'customer_guidebook_access', field: 'projection_version', interface: 'input', sort: 6 }
		},
		{
			collection: 'customer_guidebook_access',
			field: 'reconciled_at',
			type: 'timestamp',
			schema: {
				name: 'reconciled_at',
				table: 'customer_guidebook_access',
				data_type: 'timestamp with time zone',
				is_nullable: true,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'customer_guidebook_access', field: 'reconciled_at', interface: 'datetime', sort: 7 }
		},
		{
			collection: 'stripe_webhook_events',
			field: 'id',
			type: 'uuid',
			schema: { ...uuidPk, table: 'stripe_webhook_events' },
			meta: {
				collection: 'stripe_webhook_events',
				field: 'id',
				special: ['uuid'],
				hidden: true,
				readonly: true,
				sort: 1
			}
		},
		{
			collection: 'stripe_webhook_events',
			field: 'stripe_event_id',
			type: 'string',
			schema: {
				name: 'stripe_event_id',
				table: 'stripe_webhook_events',
				data_type: 'varchar',
				max_length: 255,
				is_nullable: false,
				is_unique: true,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'stripe_webhook_events', field: 'stripe_event_id', interface: 'input', sort: 2, required: true }
		},
		{
			collection: 'stripe_webhook_events',
			field: 'event_type',
			type: 'string',
			schema: {
				name: 'event_type',
				table: 'stripe_webhook_events',
				data_type: 'varchar',
				max_length: 128,
				is_nullable: false,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'stripe_webhook_events', field: 'event_type', interface: 'input', sort: 3, required: true }
		},
		{
			collection: 'stripe_webhook_events',
			field: 'status',
			type: 'string',
			schema: {
				name: 'status',
				table: 'stripe_webhook_events',
				data_type: 'varchar',
				max_length: 32,
				default_value: 'received',
				is_nullable: false,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'stripe_webhook_events', field: 'status', interface: 'input', sort: 4 }
		},
		{
			collection: 'guidebook_purchase_claims',
			field: 'id',
			type: 'uuid',
			schema: { ...uuidPk, table: 'guidebook_purchase_claims' },
			meta: {
				collection: 'guidebook_purchase_claims',
				field: 'id',
				special: ['uuid'],
				hidden: true,
				readonly: true,
				sort: 1
			}
		},
		{
			collection: 'guidebook_purchase_claims',
			field: 'email',
			type: 'string',
			schema: {
				name: 'email',
				table: 'guidebook_purchase_claims',
				data_type: 'varchar',
				max_length: 255,
				is_nullable: false,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'guidebook_purchase_claims', field: 'email', interface: 'input', sort: 2, required: true }
		},
		uuidFk('guidebook_purchase_claims', 'guidebook_id', 'guidebook_purchase_claims', 'guidebooks', 3, true),
		uuidFk('guidebook_purchase_claims', 'offer_id', 'guidebook_purchase_claims', 'guidebook_offers', 4, true),
		{
			collection: 'guidebook_purchase_claims',
			field: 'status',
			type: 'string',
			schema: {
				name: 'status',
				table: 'guidebook_purchase_claims',
				data_type: 'varchar',
				max_length: 32,
				default_value: 'pending',
				is_nullable: false,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'guidebook_purchase_claims', field: 'status', interface: 'input', sort: 5 }
		}
	];

	return grantFields;
}

function buildMigrationLedgerFields() {
	return [
		{
			collection: 'guidebook_migration_ledger',
			field: 'id',
			type: 'uuid',
			schema: { ...uuidPk, table: 'guidebook_migration_ledger' },
			meta: {
				collection: 'guidebook_migration_ledger',
				field: 'id',
				special: ['uuid'],
				hidden: true,
				readonly: true,
				sort: 1
			}
		},
		{
			collection: 'guidebook_migration_ledger',
			field: 'phase',
			type: 'string',
			schema: {
				name: 'phase',
				table: 'guidebook_migration_ledger',
				data_type: 'varchar',
				max_length: 64,
				is_nullable: false,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'guidebook_migration_ledger', field: 'phase', interface: 'input', sort: 2, required: true }
		},
		{
			collection: 'guidebook_migration_ledger',
			field: 'checksum',
			type: 'string',
			schema: {
				name: 'checksum',
				table: 'guidebook_migration_ledger',
				data_type: 'varchar',
				max_length: 128,
				is_nullable: false,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'guidebook_migration_ledger', field: 'checksum', interface: 'input', sort: 3, required: true }
		},
		{
			collection: 'guidebook_migration_ledger',
			field: 'status',
			type: 'string',
			schema: {
				name: 'status',
				table: 'guidebook_migration_ledger',
				data_type: 'varchar',
				max_length: 32,
				is_nullable: false,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'guidebook_migration_ledger', field: 'status', interface: 'input', sort: 4, required: true }
		},
		{
			collection: 'guidebook_migration_ledger',
			field: 'result',
			type: 'json',
			schema: {
				name: 'result',
				table: 'guidebook_migration_ledger',
				data_type: 'json',
				is_nullable: true,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'guidebook_migration_ledger', field: 'result', interface: 'input-code', sort: 5 }
		}
	];
}

function buildExistingCollectionExtensions() {
	const destinationFk = (collection: string, sort: number) =>
		uuidFk(collection, 'destination_id', collection, 'destinations', sort, false);

	return [
		destinationFk('places', 50),
		destinationFk('events', 50),
		destinationFk('tours', 50),
		destinationFk('places_regions', 50),
		uuidFk('customer_tours', 'guidebook_id', 'customer_tours', 'guidebooks', 50, false),
		{
			collection: 'tips',
			field: 'audience_scope',
			type: 'string',
			schema: {
				name: 'audience_scope',
				table: 'tips',
				data_type: 'varchar',
				max_length: 32,
				default_value: 'selected_guidebooks',
				is_nullable: false,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'tips', field: 'audience_scope', interface: 'input', sort: 10, required: true }
		},
		{
			collection: 'tips',
			field: 'title',
			type: 'string',
			schema: {
				name: 'title',
				table: 'tips',
				data_type: 'varchar',
				max_length: 255,
				is_nullable: true,
				is_primary_key: false,
				has_auto_increment: false
			},
			meta: { collection: 'tips', field: 'title', interface: 'input', sort: 11 }
		},
		m2mAliasField('tips', 'guidebooks', '{{guidebooks_id.title}}', 12, 'Selected guidebooks when audience_scope is selected_guidebooks')
	];
}

function buildRelations() {
	const junctionM2o = (
		junction: string,
		field: string,
		related: string,
		meta: {
			oneField: string | null;
			junctionField: string;
		}
	) => ({
		collection: junction,
		field,
		related_collection: related,
		meta: {
			many_collection: junction,
			many_field: field,
			one_collection: related,
			one_field: meta.oneField,
			junction_field: meta.junctionField
		},
		schema: {
			table: junction,
			column: field,
			foreign_key_table: related,
			foreign_key_column: 'id',
			on_update: 'NO ACTION',
			on_delete: 'CASCADE'
		}
	});

	const plainM2o = (collection: string, field: string, related: string) => ({
		collection,
		field,
		related_collection: related,
		meta: {
			many_collection: collection,
			many_field: field,
			one_collection: related,
			one_field: null,
			junction_field: null
		},
		schema: {
			table: collection,
			column: field,
			foreign_key_table: related,
			foreign_key_column: 'id',
			on_delete: 'SET NULL'
		}
	});

	/** Two junction FK relations only (alias fields on parent collections; no guidebooks.places row). */
	const m2m = (
		junction: string,
		guidebookField: string,
		relatedField: string,
		related: string,
		aliasOnGuidebooks: string,
		aliasOnRelated: string | null = null
	) => [
		junctionM2o(junction, guidebookField, 'guidebooks', {
			oneField: aliasOnGuidebooks,
			junctionField: relatedField
		}),
		junctionM2o(junction, relatedField, related, {
			oneField: aliasOnRelated,
			junctionField: guidebookField
		})
	];

	return [
		plainM2o('guidebooks', 'destination_id', 'destinations'),
		plainM2o('guidebook_offers', 'guidebook_id', 'guidebooks'),
		plainM2o('customer_guidebook_grants', 'user_id', 'directus_users'),
		plainM2o('customer_guidebook_grants', 'guidebook_id', 'guidebooks'),
		plainM2o('customer_guidebook_grants', 'offer_id', 'guidebook_offers'),
		plainM2o('customer_guidebook_access', 'user_id', 'directus_users'),
		plainM2o('customer_guidebook_access', 'guidebook_id', 'guidebooks'),
		plainM2o('guidebook_purchase_claims', 'guidebook_id', 'guidebooks'),
		plainM2o('guidebook_purchase_claims', 'offer_id', 'guidebook_offers'),
		plainM2o('places', 'destination_id', 'destinations'),
		plainM2o('events', 'destination_id', 'destinations'),
		plainM2o('tours', 'destination_id', 'destinations'),
		plainM2o('places_regions', 'destination_id', 'destinations'),
		plainM2o('customer_tours', 'guidebook_id', 'guidebooks'),
		...m2m('guidebooks_places', 'guidebook_id', 'places_id', 'places', 'places'),
		...m2m('guidebooks_events', 'guidebook_id', 'events_id', 'events', 'events'),
		...m2m('guidebooks_tours', 'guidebook_id', 'tours_id', 'tours', 'tours'),
		...m2m(
			'guidebooks_places_regions',
			'guidebook_id',
			'places_regions_id',
			'places_regions',
			'places_regions'
		),
		...m2m('tips_guidebooks', 'guidebooks_id', 'tips_id', 'tips', 'tips', 'guidebooks')
	];
}
