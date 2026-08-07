type DirectusStateField = {
  collection: string;
  field: string;
  meta?: Record<string, unknown>;
};

type FieldsServiceLike = {
  updateField: (
    collection: string,
    field: string,
    data: Record<string, unknown>,
  ) => Promise<unknown>;
};

type MetaKnex = {
  select: (columns: string | string[]) => {
    from: (table: string) => {
      where: (criteria: Record<string, string>) => {
        first: () => Promise<unknown>;
      };
    };
  };
};

type FieldRow = {
  interface?: string | null;
  special?: unknown;
  options?: unknown;
};

type LoggerLike = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
};

const BODY_FIELDS: { collection: string; field: string }[] = [
  { collection: "user_notification", field: "body" },
  { collection: "user_notification_translations", field: "body" },
  { collection: "notification_broadcast", field: "body" },
  { collection: "notification_broadcast_translations", field: "body" },
];

const M2M_TARGET_FIELDS = ["target_roles", "target_users"] as const;

const TRANSLATION_FK_FIELDS: { collection: string; field: string }[] = [
  { collection: "user_notification_translations", field: "languages_code" },
  { collection: "user_notification_translations", field: "user_notification_id" },
  {
    collection: "notification_broadcast_translations",
    field: "languages_code",
  },
  {
    collection: "notification_broadcast_translations",
    field: "notification_broadcast_id",
  },
];

function specialIncludesM2o(special: unknown): boolean {
  return Array.isArray(special) && special.includes("m2o");
}

function specialMatchesDesired(
  existing: unknown,
  desired: string[] | null | undefined,
): boolean {
  if (!desired || desired.length === 0) {
    return true;
  }

  if (!Array.isArray(existing)) {
    return false;
  }

  return desired.every((value) => existing.includes(value));
}

export function bodyInterfaceNeedsRepair(existing: FieldRow): boolean {
  return existing.interface !== "input-multiline";
}

export function m2mOptionsNeedRepair(existing: FieldRow): boolean {
  if (existing.options == null || typeof existing.options !== "object") {
    return true;
  }

  return (existing.options as { enableCreate?: boolean }).enableCreate !== false;
}

export function translationFkMetaNeedsRepair(
  existing: FieldRow,
  desired: DirectusStateField,
): boolean {
  const wantSpecial = desired.meta?.special as string[] | undefined;
  return !specialMatchesDesired(existing.special, wantSpecial);
}

export async function reconcileScaffoldMeta(
  database: unknown,
  fieldsService: FieldsServiceLike,
  stateFields: DirectusStateField[],
  logger: LoggerLike,
): Promise<{ repaired: string[]; errors: string[] }> {
  const knex = database as MetaKnex;
  const repaired: string[] = [];
  const errors: string[] = [];

  for (const { collection, field } of BODY_FIELDS) {
    const label = `${collection}.${field}`;
    const row = (await knex
      .select(["interface"])
      .from("directus_fields")
      .where({ collection, field })
      .first()) as FieldRow | undefined;

    if (!row || !bodyInterfaceNeedsRepair(row)) {
      continue;
    }

    try {
      await fieldsService.updateField(collection, field, {
        meta: { interface: "input-multiline" },
      });
      logger.info(`[DB Configuration] Repaired body interface: ${label}`);
      repaired.push(label);
    } catch (error: unknown) {
      const err = error as { message?: string };
      errors.push(`${label}: ${err?.message ?? "updateField failed"}`);
    }
  }

  for (const field of M2M_TARGET_FIELDS) {
    const collection = "notification_broadcast";
    const label = `${collection}.${field}`;
    const row = (await knex
      .select(["options"])
      .from("directus_fields")
      .where({ collection, field })
      .first()) as FieldRow | undefined;

    if (!row || !m2mOptionsNeedRepair(row)) {
      continue;
    }

    try {
      await fieldsService.updateField(collection, field, {
        meta: { options: { enableCreate: false } },
      });
      logger.info(`[DB Configuration] Repaired M2M options: ${label}`);
      repaired.push(label);
    } catch (error: unknown) {
      const err = error as { message?: string };
      errors.push(`${label}: ${err?.message ?? "updateField failed"}`);
    }
  }

  for (const { collection, field } of TRANSLATION_FK_FIELDS) {
    const desired = stateFields.find(
      (stateField) =>
        stateField.collection === collection && stateField.field === field,
    );
    if (!desired?.meta) {
      continue;
    }

    const label = `${collection}.${field}`;
    const row = (await knex
      .select(["special"])
      .from("directus_fields")
      .where({ collection, field })
      .first()) as FieldRow | undefined;

    if (!row || !translationFkMetaNeedsRepair(row, desired)) {
      continue;
    }

    try {
      await fieldsService.updateField(collection, field, {
        meta: {
          special: desired.meta.special,
          hidden: desired.meta.hidden ?? true,
        },
      });
      logger.info(`[DB Configuration] Repaired translation FK meta: ${label}`);
      repaired.push(label);
    } catch (error: unknown) {
      const err = error as { message?: string };
      errors.push(`${label}: ${err?.message ?? "updateField failed"}`);
    }
  }

  return { repaired, errors };
}

export { specialIncludesM2o };
