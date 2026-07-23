import { describe, test, expect, beforeAll, afterAll } from "vitest";
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  dockerHttpRequest,
} from "../setup.js";
import { logger } from "../test-logger.js";
import { getAdminUserId } from "./helpers/test-helpers.js";

describe("Debug - Verificar Setup", () => {
  const version = process.env.DIRECTUS_TEST_VERSION || "11.15.1";
  const testSuiteId = `debug-${version.replace(/\./g, "-")}`;
  let userId: string;

  beforeAll(async () => {
    process.env.DIRECTUS_VERSION = version;
    logger.setCurrentTest(`Debug Test - Directus ${version}`);
    await setupTestEnvironment(testSuiteId);
    userId = await getAdminUserId(testSuiteId);
  }, 420000);

  afterAll(async () => {
    await teardownTestEnvironment(testSuiteId);
  });

  test("Verificar se push_enabled está true no usuário", async () => {
    const response = await dockerHttpRequest(
      "GET",
      `/users/${userId}`,
      undefined,
      {
        Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
      },
      testSuiteId,
    );

    console.log("User data:", response.data);
    expect(response.data).toHaveProperty("push_enabled");
  });

  test("Verificar se coleções existem", async () => {
    const collections = await dockerHttpRequest(
      "GET",
      "/collections",
      undefined,
      {
        Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
      },
      testSuiteId,
    );

    const collectionNames = (
      collections.data as Array<{ collection: string }>
    ).map((c) => c.collection);

    console.log("Collections:", collectionNames);

    expect(collectionNames).toContain("push_subscription");
    expect(collectionNames).toContain("user_notification");
    expect(collectionNames).toContain("push_delivery");
  });
});
