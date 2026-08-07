import { describe, expect, it } from "vitest";

import { createItemsServiceOptions } from "../../src/shared/create-items-service-options.js";

describe("createItemsServiceOptions", () => {
  it("forwards accountability when provided", () => {
    const accountability = { user: "user-1", role: "admin-role" };

    expect(
      createItemsServiceOptions({
        schema: {},
        database: {},
        accountability,
      }),
    ).toEqual({
      schema: {},
      knex: {},
      accountability,
    });
  });

  it("falls back to admin accountability when missing", () => {
    expect(
      createItemsServiceOptions({
        schema: { collections: {} },
        database: { client: "pg" },
      }),
    ).toEqual({
      schema: { collections: {} },
      knex: { client: "pg" },
      accountability: { admin: true },
    });
  });
});
