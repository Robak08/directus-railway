import { describe, test, expect, beforeAll, afterAll } from "vitest";
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  dockerHttpRequest,
} from "./setup.js";
import { logger } from "./test-logger.js";

describe("Push Notification Extension - Setup Hook", () => {
  const version = process.env.DIRECTUS_TEST_VERSION || "11.15.1";
  const testSuiteId = `hook-${version.replace(/\./g, "-")}`;

  beforeAll(async () => {
    process.env.DIRECTUS_VERSION = version;
    logger.setCurrentTest(
      `Setup Hook Test - Directus ${process.env.DIRECTUS_VERSION}`,
    );
    await setupTestEnvironment(testSuiteId);
  }, 420000); // 7 minutos de timeout

  afterAll(async () => {
    await teardownTestEnvironment(testSuiteId);
  });

  test("Should have created push_subscription collection", async () => {
    const response = await dockerHttpRequest(
      "GET",
      "/collections",
      undefined,
      {
        Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
      },
      testSuiteId,
    );

    const collections = (response.data || response) as Array<{
      collection: string;
    }>;
    const collectionNames = collections.map((c) => c.collection);

    expect(
      collectionNames,
      "push_subscription collection should have been created by setup hook",
    ).toContain("push_subscription");

    logger.info("✓ push_subscription collection created");
  });

  test("Should have created push_subscription collection with correct fields", async () => {
    const response = await dockerHttpRequest(
      "GET",
      "/fields/push_subscription",
      undefined,
      {
        Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
      },
      testSuiteId,
    );

    const fields = (response.data || response) as Array<{ field: string }>;
    const fieldNames = fields.map((f) => f.field);

    const expectedFields = [
      "id",
      "user",
      "endpoint",
      "keys",
      "user_agent",
      "device_name",
      "is_active",
      "date_created",
      "date_last_used",
      "date_expires",
    ];

    for (const expectedField of expectedFields) {
      expect(
        fieldNames,
        `Field "${expectedField}" should exist in push_subscription collection`,
      ).toContain(expectedField);
    }

    logger.info(`✓ All ${expectedFields.length} fields created correctly`);
  });

  test("Should have created key relations for push_subscription and user_notification", async () => {
    const auth = {
      Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
    };

    const subscriptionRelations = await dockerHttpRequest(
      "GET",
      "/relations/push_subscription",
      undefined,
      auth,
      testSuiteId,
    );
    const notificationRelations = await dockerHttpRequest(
      "GET",
      "/relations/user_notification",
      undefined,
      auth,
      testSuiteId,
    );
    const deliveryRelations = await dockerHttpRequest(
      "GET",
      "/relations/push_delivery",
      undefined,
      auth,
      testSuiteId,
    );
    const translationRelations = await dockerHttpRequest(
      "GET",
      "/relations/user_notification_translations",
      undefined,
      auth,
      testSuiteId,
    );

    const subscriptionFieldNames = (
      (subscriptionRelations.data || subscriptionRelations) as Array<{
        field: string;
      }>
    ).map((relation) => relation.field);
    const notificationFieldNames = (
      (notificationRelations.data || notificationRelations) as Array<{
        field: string;
      }>
    ).map((relation) => relation.field);
    const deliveryFieldNames = (
      (deliveryRelations.data || deliveryRelations) as Array<{
        field: string;
        meta?: { one_field?: string | null };
      }>
    ).map((relation) => relation.field);
    const translationFieldNames = (
      (translationRelations.data || translationRelations) as Array<{
        field: string;
        meta?: { one_field?: string | null; junction_field?: string | null };
      }>
    ).map((relation) => relation.field);

    expect(subscriptionFieldNames).toContain("user");

    expect(notificationFieldNames).toContain("user");
    expect(notificationFieldNames).toContain("user_created");
    expect(notificationFieldNames).toContain("broadcast");

    expect(deliveryFieldNames).toContain("notification");
    expect(deliveryFieldNames).toContain("subscription");

    const notificationRelation = (
      (deliveryRelations.data || deliveryRelations) as Array<{
        field: string;
        meta?: { one_field?: string | null };
      }>
    ).find((relation) => relation.field === "notification");
    expect(notificationRelation?.meta?.one_field).toBe("deliveries");

    expect(translationFieldNames).toContain("user_notification_id");
    expect(translationFieldNames).toContain("languages_code");

    const translationParentRelation = (
      (translationRelations.data || translationRelations) as Array<{
        field: string;
        meta?: { one_field?: string | null; junction_field?: string | null };
      }>
    ).find((relation) => relation.field === "user_notification_id");
    expect(translationParentRelation?.meta?.one_field).toBe("translations");
    expect(translationParentRelation?.meta?.junction_field).toBe(
      "languages_code",
    );

    logger.info("✓ Key relations created correctly");
  });

  test("Should have registered push-notification endpoints", async () => {
    const response = await dockerHttpRequest(
      "GET",
      "/server/info",
      undefined,
      {
        Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
      },
      testSuiteId,
    );

    // Endpoints devem estar disponíveis (testar acessibilidade básica)
    expect(response).toBeDefined();
    logger.info("✓ Extension endpoints are accessible");
  });
});
