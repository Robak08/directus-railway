import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const UUID_FK_TABLES = new Set([
  "directus_users",
  "directus_roles",
  "directus_files",
  "user_notification",
  "push_subscription",
  "notification_broadcast",
]);

type StateField = {
  collection: string;
  field: string;
  type: string;
  schema?: {
    data_type?: string;
    foreign_key_table?: string | null;
  } | null;
};

const statePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../directus-state.json",
);

describe("directus-state.json UUID foreign keys", () => {
  const state = JSON.parse(readFileSync(statePath, "utf8")) as {
    fields: StateField[];
  };

  it("uses uuid columns for FKs targeting uuid primary keys", () => {
    const uuidFkFields = state.fields.filter((field) => {
      const fk = field.schema?.foreign_key_table;
      return fk && fk !== "languages" && UUID_FK_TABLES.has(fk);
    });

    expect(uuidFkFields.length).toBeGreaterThanOrEqual(15);

    for (const field of uuidFkFields) {
      expect(
        field.type,
        `${field.collection}.${field.field} type`,
      ).toBe("uuid");
      expect(
        field.schema?.data_type,
        `${field.collection}.${field.field} schema.data_type`,
      ).toBe("uuid");
    }
  });
});
