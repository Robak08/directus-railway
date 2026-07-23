/**
 * Broadcast schema additions for directus-state.json
 * Run: node scripts/merge-broadcast-schema.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const statePath = join(root, "directus-state.json");

const channelChoices = [
  { text: "Push", value: "push", icon: "notifications_active", color: "#3399FF" },
  { text: "Email", value: "email", icon: "email", color: "#F59E0B" },
  { text: "SMS", value: "sms", icon: "sms", color: "#2ECDA7" },
  { text: "In-App", value: "in_app", icon: "info", color: "#8B5CF6" },
];

const priorityChoices = [
  { text: "Low", value: "low", icon: "trending_down", color: "#3399FF" },
  { text: "Normal", value: "normal", icon: "remove" },
  { text: "High", value: "high", icon: "trending_up", color: "#F59E0B" },
  { text: "Urgent", value: "urgent", icon: "notification_important", color: "#E35169" },
];

const targetTypeChoices = [
  { text: "All Users", value: "all" },
  { text: "By Roles", value: "roles" },
  { text: "Specific Users", value: "users" },
  { text: "Custom Filter", value: "filter" },
];

const statusChoices = [
  { text: "Draft", value: "draft" },
  { text: "Processing", value: "processing" },
  { text: "Completed", value: "completed" },
  { text: "Failed", value: "failed" },
];

function uuidField(collection, sort = 1) {
  return {
    collection,
    field: "id",
    type: "uuid",
    schema: {
      name: "id",
      table: collection,
      data_type: "uuid",
      is_nullable: false,
      is_primary_key: true,
      has_auto_increment: false,
    },
    meta: {
      collection,
      field: "id",
      special: ["uuid"],
      interface: "input",
      readonly: true,
      hidden: true,
      sort,
    },
  };
}

function stringField(collection, field, opts = {}) {
  const {
    required = false,
    sort = 1,
    maxLength = 255,
    note = null,
    interfaceName = "input",
    choices = null,
    defaultValue = null,
    width = "full",
    hidden = false,
    readonly = false,
    fk = null,
    special = null,
  } = opts;

  const schema = {
    name: field,
    table: collection,
    data_type: "varchar",
    max_length: maxLength,
    is_nullable: !required,
    is_primary_key: false,
    has_auto_increment: false,
    default_value: defaultValue,
  };

  if (fk) {
    schema.foreign_key_column = fk.column;
    schema.foreign_key_table = fk.table;
    schema.data_type = "char";
    schema.max_length = 36;
  }

  const meta = {
    collection,
    field,
    special,
    interface: interfaceName,
    options: choices ? { choices } : null,
    readonly,
    hidden,
    sort,
    width,
    note,
    required,
  };

  return { collection, field, type: fk ? "string" : "string", schema, meta };
}

function textField(collection, field, opts = {}) {
  const { required = false, sort = 1, note = null } = opts;
  return {
    collection,
    field,
    type: "text",
    schema: {
      name: field,
      table: collection,
      data_type: "text",
      is_nullable: !required,
      is_primary_key: false,
    },
    meta: {
      collection,
      field,
      interface: "input-rich-text-md",
      sort,
      width: "full",
      note,
      required,
    },
  };
}

function integerField(collection, field, opts = {}) {
  const { sort = 1, readonly = false, note = null, defaultValue = null } = opts;
  return {
    collection,
    field,
    type: "integer",
    schema: {
      name: field,
      table: collection,
      data_type: "integer",
      is_nullable: true,
      default_value: defaultValue,
    },
    meta: {
      collection,
      field,
      interface: "input",
      sort,
      width: "half",
      readonly,
      note,
    },
  };
}

function timestampField(collection, field, opts = {}) {
  const { sort = 1, special = ["cast-timestamp"], readonly = false, note = null } = opts;
  return {
    collection,
    field,
    type: "timestamp",
    schema: {
      name: field,
      table: collection,
      data_type: "datetime",
      is_nullable: true,
    },
    meta: {
      collection,
      field,
      special,
      interface: "datetime",
      display: "datetime",
      display_options: { relative: true },
      readonly,
      sort,
      width: "half",
      note,
    },
  };
}

function jsonField(collection, field, opts = {}) {
  const { sort = 1, note = null } = opts;
  return {
    collection,
    field,
    type: "json",
    schema: {
      name: field,
      table: collection,
      data_type: "json",
      is_nullable: true,
    },
    meta: {
      collection,
      field,
      special: ["json"],
      interface: "input-code",
      sort,
      width: "full",
      note,
    },
  };
}

function aliasField(collection, field, opts = {}) {
  const { special, interfaceName, sort = 1, options = null, note = null } = opts;
  return {
    collection,
    field,
    type: "alias",
    schema: null,
    meta: {
      collection,
      field,
      special,
      interface: interfaceName,
      options,
      sort,
      width: "full",
      note,
    },
  };
}

const collections = [
  {
    collection: "notification_broadcast",
    meta: {
      collection: "notification_broadcast",
      icon: "campaign",
      note: "Broadcast notification templates for group messaging",
      display_template: "{{title}} ({{status}})",
      hidden: false,
      singleton: false,
      translations: [
        { language: "en-US", translation: "Broadcast Notifications", singular: "Broadcast Notification", plural: "Broadcast Notifications" },
        { language: "pt-BR", translation: "Notificações em Grupo", singular: "Notificação em Grupo", plural: "Notificações em Grupo" },
      ],
      sort_field: "date_created",
    },
    schema: {},
  },
  {
    collection: "notification_broadcast_translations",
    meta: {
      collection: "notification_broadcast_translations",
      icon: "import_export",
      note: "Broadcast notification translations",
      hidden: true,
      singleton: false,
      translations: [
        { language: "en-US", translation: "Broadcast Translations", singular: "Broadcast Translation", plural: "Broadcast Translations" },
        { language: "pt-BR", translation: "Traduções de Broadcast", singular: "Tradução de Broadcast", plural: "Traduções de Broadcast" },
      ],
    },
    schema: {},
  },
  {
    collection: "notification_broadcast_roles",
    meta: {
      collection: "notification_broadcast_roles",
      icon: "import_export",
      hidden: true,
      singleton: false,
    },
    schema: {},
  },
  {
    collection: "notification_broadcast_users",
    meta: {
      collection: "notification_broadcast_users",
      icon: "import_export",
      hidden: true,
      singleton: false,
    },
    schema: {},
  },
];

const fields = [
  // notification_broadcast
  uuidField("notification_broadcast"),
  stringField("notification_broadcast", "title", { required: true, sort: 2, note: "Fallback title" }),
  textField("notification_broadcast", "body", { required: true, sort: 3, note: "Fallback body" }),
  aliasField("notification_broadcast", "translations", {
    special: ["translations"],
    interfaceName: "translations",
    sort: 4,
    options: {
      languageField: "languages_code",
      defaultLanguage: "en-US",
      userLanguage: true,
    },
    note: "Translated title and body",
  }),
  stringField("notification_broadcast", "target_type", {
    required: true,
    sort: 5,
    interfaceName: "select-dropdown",
    choices: targetTypeChoices,
    defaultValue: "all",
    note: "How to select recipients",
  }),
  aliasField("notification_broadcast", "target_roles", {
    special: ["m2m"],
    interfaceName: "list-m2m",
    sort: 6,
    note: "Target roles when target_type is roles",
  }),
  aliasField("notification_broadcast", "target_users", {
    special: ["m2m"],
    interfaceName: "list-m2m",
    sort: 7,
    note: "Target users when target_type is users",
  }),
  jsonField("notification_broadcast", "target_filter", { sort: 8, note: "Custom filter when target_type is filter" }),
  stringField("notification_broadcast", "channel", {
    required: true,
    sort: 9,
    interfaceName: "select-dropdown",
    choices: channelChoices,
    defaultValue: "push",
  }),
  stringField("notification_broadcast", "priority", {
    sort: 10,
    interfaceName: "select-dropdown",
    choices: priorityChoices,
    defaultValue: "normal",
    width: "half",
  }),
  {
    collection: "notification_broadcast",
    field: "icon",
    type: "uuid",
    schema: {
      name: "icon",
      table: "notification_broadcast",
      data_type: "char",
      max_length: 36,
      is_nullable: true,
      foreign_key_column: "id",
      foreign_key_table: "directus_files",
    },
    meta: {
      collection: "notification_broadcast",
      field: "icon",
      special: ["file"],
      interface: "file-image",
      sort: 11,
      width: "half",
    },
  },
  stringField("notification_broadcast", "icon_url", { sort: 12, maxLength: 500, note: "External icon URL" }),
  stringField("notification_broadcast", "action_url", { sort: 13, maxLength: 500, note: "URL on click" }),
  jsonField("notification_broadcast", "data", { sort: 14 }),
  stringField("notification_broadcast", "status", {
    required: true,
    sort: 15,
    interfaceName: "select-dropdown",
    choices: statusChoices,
    defaultValue: "draft",
    width: "half",
  }),
  integerField("notification_broadcast", "total_users", { sort: 16, readonly: true }),
  integerField("notification_broadcast", "total_created", { sort: 17, readonly: true }),
  integerField("notification_broadcast", "total_failed", { sort: 18, readonly: true }),
  stringField("notification_broadcast", "user_created", {
    sort: 19,
    fk: { table: "directus_users", column: "id" },
    special: ["user-created"],
    interfaceName: "select-dropdown-m2o",
    readonly: true,
  }),
  timestampField("notification_broadcast", "date_created", {
    sort: 20,
    special: ["date-created", "cast-timestamp"],
    readonly: true,
  }),
  timestampField("notification_broadcast", "date_processed", { sort: 21, note: "When processing finished" }),
  timestampField("notification_broadcast", "date_expires", { sort: 22, note: "Expiration copied to notifications" }),
  aliasField("notification_broadcast", "notifications", {
    special: ["o2m"],
    interfaceName: "list-o2m",
    sort: 23,
    note: "Generated user notifications",
  }),

  // notification_broadcast_translations
  uuidField("notification_broadcast_translations"),
  stringField("notification_broadcast_translations", "notification_broadcast_id", {
    sort: 2,
    required: true,
    fk: { table: "notification_broadcast", column: "id" },
    hidden: true,
  }),
  stringField("notification_broadcast_translations", "languages_code", {
    sort: 3,
    required: true,
    fk: { table: "languages", column: "code" },
    hidden: true,
  }),
  stringField("notification_broadcast_translations", "title", { required: true, sort: 4 }),
  textField("notification_broadcast_translations", "body", { required: true, sort: 5 }),

  // notification_broadcast_roles junction
  {
    collection: "notification_broadcast_roles",
    field: "id",
    type: "integer",
    schema: {
      name: "id",
      table: "notification_broadcast_roles",
      data_type: "integer",
      is_primary_key: true,
      has_auto_increment: true,
    },
    meta: {
      collection: "notification_broadcast_roles",
      field: "id",
      hidden: true,
      sort: 1,
    },
  },
  stringField("notification_broadcast_roles", "notification_broadcast_id", {
    sort: 2,
    required: true,
    fk: { table: "notification_broadcast", column: "id" },
    hidden: true,
  }),
  stringField("notification_broadcast_roles", "directus_roles_id", {
    sort: 3,
    required: true,
    fk: { table: "directus_roles", column: "id" },
    hidden: true,
  }),

  // notification_broadcast_users junction
  {
    collection: "notification_broadcast_users",
    field: "id",
    type: "integer",
    schema: {
      name: "id",
      table: "notification_broadcast_users",
      data_type: "integer",
      is_primary_key: true,
      has_auto_increment: true,
    },
    meta: {
      collection: "notification_broadcast_users",
      field: "id",
      hidden: true,
      sort: 1,
    },
  },
  stringField("notification_broadcast_users", "notification_broadcast_id", {
    sort: 2,
    required: true,
    fk: { table: "notification_broadcast", column: "id" },
    hidden: true,
  }),
  stringField("notification_broadcast_users", "directus_users_id", {
    sort: 3,
    required: true,
    fk: { table: "directus_users", column: "id" },
    hidden: true,
  }),

  // user_notification.broadcast
  stringField("user_notification", "broadcast", {
    sort: 15,
    fk: { table: "notification_broadcast", column: "id" },
    special: ["m2o"],
    interfaceName: "select-dropdown-m2o",
    note: "Broadcast campaign that generated this notification",
  }),
];

const relations = [
  {
    collection: "notification_broadcast",
    field: "user_created",
    related_collection: "directus_users",
    schema: {
      table: "notification_broadcast",
      column: "user_created",
      foreign_key_table: "directus_users",
      foreign_key_column: "id",
      on_update: "NO ACTION",
      on_delete: "NO ACTION",
    },
    meta: {
      many_collection: "notification_broadcast",
      many_field: "user_created",
      one_collection: "directus_users",
      one_field: null,
    },
  },
  {
    collection: "notification_broadcast",
    field: "icon",
    related_collection: "directus_files",
    schema: {
      table: "notification_broadcast",
      column: "icon",
      foreign_key_table: "directus_files",
      foreign_key_column: "id",
      on_update: "NO ACTION",
      on_delete: "SET NULL",
    },
    meta: {
      many_collection: "notification_broadcast",
      many_field: "icon",
      one_collection: "directus_files",
      one_field: null,
    },
  },
  {
    collection: "user_notification",
    field: "broadcast",
    related_collection: "notification_broadcast",
    schema: {
      table: "user_notification",
      column: "broadcast",
      foreign_key_table: "notification_broadcast",
      foreign_key_column: "id",
      on_update: "NO ACTION",
      on_delete: "SET NULL",
    },
    meta: {
      many_collection: "user_notification",
      many_field: "broadcast",
      one_collection: "notification_broadcast",
      one_field: "notifications",
    },
  },
  {
    collection: "notification_broadcast_translations",
    field: "notification_broadcast_id",
    related_collection: "notification_broadcast",
    schema: {
      table: "notification_broadcast_translations",
      column: "notification_broadcast_id",
      foreign_key_table: "notification_broadcast",
      foreign_key_column: "id",
      on_update: "NO ACTION",
      on_delete: "CASCADE",
    },
    meta: {
      many_collection: "notification_broadcast_translations",
      many_field: "notification_broadcast_id",
      one_collection: "notification_broadcast",
      one_field: "translations",
      junction_field: "languages_code",
    },
  },
  {
    collection: "notification_broadcast_translations",
    field: "languages_code",
    related_collection: "languages",
    schema: {
      table: "notification_broadcast_translations",
      column: "languages_code",
      foreign_key_table: "languages",
      foreign_key_column: "code",
      on_update: "NO ACTION",
      on_delete: "CASCADE",
    },
    meta: {
      many_collection: "notification_broadcast_translations",
      many_field: "languages_code",
      one_collection: "languages",
      one_field: null,
      junction_field: "notification_broadcast_id",
    },
  },
  {
    collection: "notification_broadcast_roles",
    field: "notification_broadcast_id",
    related_collection: "notification_broadcast",
    schema: {
      table: "notification_broadcast_roles",
      column: "notification_broadcast_id",
      foreign_key_table: "notification_broadcast",
      foreign_key_column: "id",
      on_update: "NO ACTION",
      on_delete: "CASCADE",
    },
    meta: {
      many_collection: "notification_broadcast_roles",
      many_field: "notification_broadcast_id",
      one_collection: "notification_broadcast",
      one_field: "target_roles",
      junction_field: "directus_roles_id",
    },
  },
  {
    collection: "notification_broadcast_roles",
    field: "directus_roles_id",
    related_collection: "directus_roles",
    schema: {
      table: "notification_broadcast_roles",
      column: "directus_roles_id",
      foreign_key_table: "directus_roles",
      foreign_key_column: "id",
      on_update: "NO ACTION",
      on_delete: "CASCADE",
    },
    meta: {
      many_collection: "notification_broadcast_roles",
      many_field: "directus_roles_id",
      one_collection: "directus_roles",
      one_field: null,
      junction_field: "notification_broadcast_id",
    },
  },
  {
    collection: "notification_broadcast_users",
    field: "notification_broadcast_id",
    related_collection: "notification_broadcast",
    schema: {
      table: "notification_broadcast_users",
      column: "notification_broadcast_id",
      foreign_key_table: "notification_broadcast",
      foreign_key_column: "id",
      on_update: "NO ACTION",
      on_delete: "CASCADE",
    },
    meta: {
      many_collection: "notification_broadcast_users",
      many_field: "notification_broadcast_id",
      one_collection: "notification_broadcast",
      one_field: "target_users",
      junction_field: "directus_users_id",
    },
  },
  {
    collection: "notification_broadcast_users",
    field: "directus_users_id",
    related_collection: "directus_users",
    schema: {
      table: "notification_broadcast_users",
      column: "directus_users_id",
      foreign_key_table: "directus_users",
      foreign_key_column: "id",
      on_update: "NO ACTION",
      on_delete: "CASCADE",
    },
    meta: {
      many_collection: "notification_broadcast_users",
      many_field: "directus_users_id",
      one_collection: "directus_users",
      one_field: null,
      junction_field: "notification_broadcast_id",
    },
  },
];

const state = JSON.parse(readFileSync(statePath, "utf8"));

const existingCollections = new Set(state.collections.map((c) => c.collection));
const existingFields = new Set(
  state.fields.map((f) => `${f.collection}.${f.field}`),
);
const existingRelations = new Set(
  state.relations.map((r) => `${r.collection}.${r.field}`),
);

for (const collection of collections) {
  if (!existingCollections.has(collection.collection)) {
    state.collections.push(collection);
    existingCollections.add(collection.collection);
  }
}

for (const field of fields) {
  const key = `${field.collection}.${field.field}`;
  if (!existingFields.has(key)) {
    state.fields.push(field);
    existingFields.add(key);
  }
}

for (const relation of relations) {
  const key = `${relation.collection}.${relation.field}`;
  if (!existingRelations.has(key)) {
    state.relations.push(relation);
    existingRelations.add(key);
  }
}

writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
