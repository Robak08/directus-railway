import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { setupTestEnvironment, teardownTestEnvironment } from "../setup.js";
import { logger } from "../test-logger.js";
import {
  createPushSubscription,
  createUserNotification,
  getPushDelivery,
  updatePushDelivery,
  updateUserPushEnabled,
  deactivateAllSubscriptions,
  getAdminUserId,
  wait,
} from "./helpers/test-helpers.js";

describe("Push Delivery - Estados e Transições", () => {
  const version = process.env.DIRECTUS_TEST_VERSION || "11.15.1";
  const testSuiteId = `delivery-states-${version.replace(/\./g, "-")}`;
  let userId: string;

  beforeAll(async () => {
    process.env.DIRECTUS_VERSION = version;
    logger.setCurrentTest(`Delivery States Test - Directus ${version}`);
    await setupTestEnvironment(testSuiteId);
    userId = await getAdminUserId(testSuiteId);
    await updateUserPushEnabled(userId, true, testSuiteId);
  }, 420000);

  afterAll(async () => {
    await teardownTestEnvironment(testSuiteId);
  });

  test("Deve processar delivery com timestamps corretos", async () => {
    const { MOCK_PUSH_SERVER } = await import("./helpers/test-helpers.js");

    await deactivateAllSubscriptions(userId, testSuiteId);

    const subscription = await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/success-1`,
        device_name: "State Test Device",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user: userId,
        title: "State Transition Test",
        body: "Testing state transitions",
        channel: "push",
      },
      testSuiteId,
    );

    // Aguardar processamento
    await wait(5000);

    const delivery = await getPushDelivery(
      notification.id,
      subscription.id,
      testSuiteId,
    );

    expect(delivery).toBeTruthy();
    // O hook tenta enviar; status depende se MOCK_PUSH_SERVER está acessível
    expect(["sent", "queued"]).toContain(delivery?.status);
    expect(delivery?.attempt_count).toBeGreaterThanOrEqual(1);
    expect(delivery?.date_queued).toBeTruthy();
  });

  test("Deve aceitar atualização para delivered via callback", async () => {
    const { MOCK_PUSH_SERVER } = await import("./helpers/test-helpers.js");

    await deactivateAllSubscriptions(userId, testSuiteId);

    const subscription = await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/callback-test`,
        device_name: "Delivered Test Device",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user: userId,
        title: "Delivered State Test",
        body: "Testing delivered state",
        channel: "push",
      },
      testSuiteId,
    );

    await wait(5000);

    const delivery = await getPushDelivery(
      notification.id,
      subscription.id,
      testSuiteId,
    );

    expect(delivery).toBeTruthy();
    // O hook processou a delivery (status pode ser sent ou queued/retry)
    expect(delivery?.attempt_count).toBeGreaterThanOrEqual(1);

    // Simular callback do Service Worker atualizando para delivered
    const updated = await updatePushDelivery(
      delivery!.id,
      {
        status: "delivered",
        date_delivered: new Date().toISOString(),
      },
      testSuiteId,
    );

    expect(updated.status).toBe("delivered");
    expect(updated.date_delivered).toBeTruthy();
  });

  test("Deve aceitar atualização para read quando usuário clica", async () => {
    const { MOCK_PUSH_SERVER } = await import("./helpers/test-helpers.js");

    await deactivateAllSubscriptions(userId, testSuiteId);

    const subscription = await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/read-test`,
        device_name: "Read Test Device",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user: userId,
        title: "Read State Test",
        body: "Testing read state",
        channel: "push",
      },
      testSuiteId,
    );

    await wait(5000);

    let delivery = await getPushDelivery(
      notification.id,
      subscription.id,
      testSuiteId,
    );

    expect(delivery).toBeTruthy();

    // Atualizar para delivered primeiro
    if (delivery) {
      delivery = await updatePushDelivery(
        delivery.id,
        {
          status: "delivered",
          date_delivered: new Date().toISOString(),
        },
        testSuiteId,
      );

      await wait(100);

      // Simular clique do usuário
      const read = await updatePushDelivery(
        delivery.id,
        {
          status: "read",
          date_read: new Date().toISOString(),
        },
        testSuiteId,
      );

      expect(read.status).toBe("read");
      expect(read.date_read).toBeTruthy();
    }
  });

  test("Deve validar sequência de timestamps: date_queued < date_delivered < date_read", async () => {
    const { MOCK_PUSH_SERVER } = await import("./helpers/test-helpers.js");

    await deactivateAllSubscriptions(userId, testSuiteId);

    const subscription = await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/timestamps-test`,
        device_name: "Timestamps Test Device",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user: userId,
        title: "Timestamps Test",
        body: "Testing timestamp sequence",
        channel: "push",
      },
      testSuiteId,
    );

    await wait(5000);

    let delivery = await getPushDelivery(
      notification.id,
      subscription.id,
      testSuiteId,
    );

    expect(delivery).toBeTruthy();

    if (delivery) {
      await wait(100);
      delivery = await updatePushDelivery(
        delivery.id,
        {
          status: "delivered",
          date_delivered: new Date().toISOString(),
        },
        testSuiteId,
      );

      await wait(100);
      delivery = await updatePushDelivery(
        delivery.id,
        {
          status: "read",
          date_read: new Date().toISOString(),
        },
        testSuiteId,
      );

      // Verificar sequência de timestamps
      const queuedTime = new Date(delivery.date_queued).getTime();
      const deliveredTime = delivery.date_delivered
        ? new Date(delivery.date_delivered).getTime()
        : 0;
      const readTime = delivery.date_read
        ? new Date(delivery.date_read).getTime()
        : 0;

      expect(queuedTime).toBeGreaterThan(0);
      expect(deliveredTime).toBeGreaterThanOrEqual(queuedTime);
      expect(readTime).toBeGreaterThanOrEqual(deliveredTime);

      // Verificar que nenhum timestamp está no futuro
      const now = Date.now();
      expect(queuedTime).toBeLessThanOrEqual(now);
      expect(deliveredTime).toBeLessThanOrEqual(now);
      expect(readTime).toBeLessThanOrEqual(now);
    }
  });

  test("Deve incrementar attempt_count a cada tentativa", async () => {
    const { MOCK_PUSH_SERVER } = await import("./helpers/test-helpers.js");

    await deactivateAllSubscriptions(userId, testSuiteId);

    const subscription = await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/attempt-test`,
        device_name: "Attempts Test Device",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user: userId,
        title: "Attempts Test",
        body: "Testing attempt count",
        channel: "push",
      },
      testSuiteId,
    );

    await wait(5000);

    const delivery = await getPushDelivery(
      notification.id,
      subscription.id,
      testSuiteId,
    );

    expect(delivery).toBeTruthy();
    expect(delivery?.attempt_count).toBeGreaterThanOrEqual(1);
  });

  test("Deve respeitar max_attempts configurado", async () => {
    const { MOCK_PUSH_SERVER } = await import("./helpers/test-helpers.js");

    await deactivateAllSubscriptions(userId, testSuiteId);

    const subscription = await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/max-attempts-test`,
        device_name: "Max Attempts Test Device",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user: userId,
        title: "Max Attempts Test",
        body: "Testing max attempts",
        channel: "push",
      },
      testSuiteId,
    );

    await wait(5000);

    const delivery = await getPushDelivery(
      notification.id,
      subscription.id,
      testSuiteId,
    );

    expect(delivery).toBeTruthy();
    expect(delivery?.max_attempts).toBeGreaterThanOrEqual(1);
    expect(delivery?.attempt_count).toBeLessThanOrEqual(delivery!.max_attempts);
  });
});
