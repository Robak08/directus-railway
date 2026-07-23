import { describe, expect, test, vi } from "vitest";
import {
  ensureRelations,
  prepareRelationData,
  relationExists,
  sortCollectionsByDependency,
  validateRelations,
} from "../../src/db-configuration/index.js";

function createDatabaseMock(rows: Record<string, string>[]) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation((criteria: Record<string, string>) => ({
          first: vi.fn().mockResolvedValue(
            rows.find(
              (row) =>
                row.many_collection === criteria.many_collection &&
                row.many_field === criteria.many_field,
            ) ?? null,
          ),
        })),
      }),
    }),
  };
}

describe("sortCollectionsByDependency", () => {
  test("creates dependencies before dependents", () => {
    const collections = [
      { collection: "push_delivery" },
      { collection: "push_subscription" },
      { collection: "user_notification" },
      { collection: "languages" },
    ];
    const fields = [
      {
        collection: "push_delivery",
        field: "notification",
        type: "string",
        schema: { foreign_key_table: "user_notification" },
      },
      {
        collection: "push_delivery",
        field: "subscription",
        type: "string",
        schema: { foreign_key_table: "push_subscription" },
      },
    ];

    const sorted = sortCollectionsByDependency(collections, fields as never);
    const names = sorted.map((c) => c.collection);

    expect(names.indexOf("push_subscription")).toBeLessThan(
      names.indexOf("push_delivery"),
    );
    expect(names.indexOf("user_notification")).toBeLessThan(
      names.indexOf("push_delivery"),
    );
  });

  test("preserves directus-state order as tiebreaker", () => {
    const collections = [
      { collection: "languages" },
      { collection: "push_subscription" },
      { collection: "notification_broadcast" },
    ];
    const fields: never[] = [];

    const sorted = sortCollectionsByDependency(collections, fields);
    expect(sorted.map((c) => c.collection)).toEqual([
      "languages",
      "push_subscription",
      "notification_broadcast",
    ]);
  });
});

describe("prepareRelationData", () => {
  test("removes null constraint_name", () => {
    const relation = prepareRelationData({
      collection: "user_notification",
      field: "user",
      related_collection: "directus_users",
      schema: {
        constraint_name: null,
        table: "user_notification",
      },
    });

    expect(relation.schema).not.toHaveProperty("constraint_name");
    expect(relation.schema?.table).toBe("user_notification");
  });
});

describe("relationExists", () => {
  test("returns true when relation is found", async () => {
    const database = createDatabaseMock([
      {
        many_collection: "user_notification",
        many_field: "user",
      },
    ]);

    await expect(
      relationExists(database, "user_notification", "user"),
    ).resolves.toBe(true);
  });

  test("returns false when relation is missing", async () => {
    const database = createDatabaseMock([]);

    await expect(
      relationExists(database, "user_notification", "user"),
    ).resolves.toBe(false);
  });
});

describe("ensureRelations", () => {
  test("creates only missing relations", async () => {
    const database = createDatabaseMock([
      {
        many_collection: "user_notification",
        many_field: "broadcast",
      },
    ]);
    const relationsService = {
      createOne: vi.fn().mockResolvedValue({}),
    };

    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    };

    const relations = [
      {
        collection: "user_notification",
        field: "user",
        related_collection: "directus_users",
      },
      {
        collection: "user_notification",
        field: "broadcast",
        related_collection: "notification_broadcast",
      },
    ];

    const result = await ensureRelations(
      database,
      relationsService,
      relations,
      logger,
    );

    expect(result.created).toBe(1);
    expect(result.failed).toEqual([]);
    expect(relationsService.createOne).toHaveBeenCalledTimes(1);
  });

  test("tracks failed relation creation", async () => {
    const database = createDatabaseMock([]);
    const relationsService = {
      createOne: vi.fn().mockRejectedValue(new Error("create failed")),
    };

    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    };

    const result = await ensureRelations(
      database,
      relationsService,
      [
        {
          collection: "user_notification",
          field: "broadcast",
          related_collection: "notification_broadcast",
        },
      ],
      logger,
    );

    expect(result.created).toBe(0);
    expect(result.failed).toEqual([
      "user_notification.broadcast -> notification_broadcast",
    ]);
  });
});

describe("validateRelations", () => {
  test("returns missing relation keys", async () => {
    const database = createDatabaseMock([
      {
        many_collection: "user_notification",
        many_field: "user",
      },
    ]);

    const missing = await validateRelations(database, [
      {
        collection: "user_notification",
        field: "user",
        related_collection: "directus_users",
      },
      {
        collection: "user_notification",
        field: "broadcast",
        related_collection: "notification_broadcast",
      },
    ]);

    expect(missing).toEqual(["user_notification.broadcast"]);
  });
});
