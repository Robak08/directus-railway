import { describe, expect, it, vi } from "vitest";

import {
  bodyInterfaceNeedsRepair,
  m2mOptionsNeedRepair,
  reconcileScaffoldMeta,
  translationFkMetaNeedsRepair,
} from "../../src/db-configuration/reconcile-scaffold-meta.js";

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
};

describe("reconcile-scaffold-meta helpers", () => {
  it("flags markdown body interface for repair", () => {
    expect(bodyInterfaceNeedsRepair({ interface: "input-rich-text-md" })).toBe(
      true,
    );
    expect(bodyInterfaceNeedsRepair({ interface: "input-multiline" })).toBe(
      false,
    );
  });

  it("flags missing enableCreate false on M2M targets", () => {
    expect(m2mOptionsNeedRepair({ options: null })).toBe(true);
    expect(m2mOptionsNeedRepair({ options: { enableCreate: true } })).toBe(true);
    expect(m2mOptionsNeedRepair({ options: { enableCreate: false } })).toBe(
      false,
    );
  });

  it("flags translation FK meta missing m2o special", () => {
    expect(
      translationFkMetaNeedsRepair(
        { special: null },
        {
          collection: "user_notification_translations",
          field: "languages_code",
          meta: { special: ["m2o"] },
        },
      ),
    ).toBe(true);

    expect(
      translationFkMetaNeedsRepair(
        { special: ["m2o"] },
        {
          collection: "user_notification_translations",
          field: "languages_code",
          meta: { special: ["m2o"] },
        },
      ),
    ).toBe(false);
  });
});

describe("reconcileScaffoldMeta", () => {
  it("repairs drifted body interface and translation FK meta", async () => {
    const rows = new Map<string, Record<string, unknown>>([
      [
        "user_notification.body",
        { interface: "input-rich-text-md" },
      ],
      [
        "user_notification_translations.languages_code",
        { special: null },
      ],
    ]);

    const database = {
      select: (columns: string | string[]) => ({
        from: () => ({
          where: ({ collection, field }: Record<string, string>) => ({
            first: async () => rows.get(`${collection}.${field}`),
          }),
        }),
      }),
    };

    const updateField = vi.fn().mockResolvedValue(undefined);
    const fieldsService = { updateField };

    const result = await reconcileScaffoldMeta(
      database,
      fieldsService,
      [
        {
          collection: "user_notification_translations",
          field: "languages_code",
          meta: { special: ["m2o"], hidden: true },
        },
      ],
      logger,
    );

    expect(result.repaired).toEqual([
      "user_notification.body",
      "user_notification_translations.languages_code",
    ]);
    expect(updateField).toHaveBeenCalledTimes(2);
    expect(updateField).toHaveBeenCalledWith("user_notification", "body", {
      meta: { interface: "input-multiline" },
    });
  });

  it("skips fields that already match desired meta", async () => {
    const rows = new Map<string, Record<string, unknown>>([
      [
        "notification_broadcast.target_roles",
        { options: { enableCreate: false } },
      ],
    ]);

    const database = {
      select: () => ({
        from: () => ({
          where: ({ collection, field }: Record<string, string>) => ({
            first: async () => rows.get(`${collection}.${field}`),
          }),
        }),
      }),
    };

    const updateField = vi.fn();
    const result = await reconcileScaffoldMeta(
      database,
      { updateField },
      [],
      logger,
    );

    expect(result.repaired).toEqual([]);
    expect(updateField).not.toHaveBeenCalled();
  });
});
