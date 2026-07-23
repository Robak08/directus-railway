import { describe, test, expect, beforeAll, afterAll } from "vitest";
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  dockerHttpRequest,
} from "../setup.js";
import { logger } from "../test-logger.js";
import {
  createPushSubscription,
  createUserNotification,
  getPushDeliveries,
  updateUserPushEnabled,
  getAdminUserId,
  wait,
  MOCK_PUSH_SERVER,
} from "./helpers/test-helpers.js";

describe("Debug - Testar Hook", () => {
  const version = process.env.DIRECTUS_TEST_VERSION || "11.15.1";
  const testSuiteId = `debug-hook-${version.replace(/\./g, "-")}`;
  let userId: string;

  beforeAll(async () => {
    process.env.DIRECTUS_VERSION = version;
    logger.setCurrentTest(`Debug Hook Test - Directus ${version}`);
    await setupTestEnvironment(testSuiteId);
    userId = await getAdminUserId(testSuiteId);
    await updateUserPushEnabled(userId, true, testSuiteId);
  }, 420000);

  afterAll(async () => {
    await teardownTestEnvironment(testSuiteId);
  });

  test("Criar subscription, notification e verificar se delivery é criado", async () => {
    // 1. Verificar user push_enabled
    const user = await dockerHttpRequest(
      "GET",
      `/users/${userId}`,
      undefined,
      {
        Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
      },
      testSuiteId,
    );

    console.log(
      "User push_enabled:",
      (user.data as { push_enabled: number }).push_enabled,
    );

    // 2. Criar subscription
    const subscription = await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/debug-push`,
      },
      testSuiteId,
    );

    console.log("Subscription created:", subscription.id);

    // 3. Criar notification
    const notification = await createUserNotification(
      {
        user: userId,
        title: "Debug Test",
        body: "Testing hook execution",
        channel: "push",
      },
      testSuiteId,
    );

    console.log("Notification created:", notification.id);

    // 4. Aguardar hook processar
    await wait(5000);

    // 5. Buscar deliveries
    const deliveries = await getPushDeliveries(notification.id, testSuiteId);

    console.log("Deliveries found:", deliveries.length);

    console.log("Deliveries:", JSON.stringify(deliveries, null, 2));

    expect(deliveries).toHaveLength(1);
  });
});
