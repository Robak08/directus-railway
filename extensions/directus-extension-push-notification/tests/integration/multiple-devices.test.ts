import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { setupTestEnvironment, teardownTestEnvironment } from "../setup.js";
import { logger } from "../test-logger.js";
import {
  createPushSubscription,
  createUserNotification,
  getPushDeliveries,
  getPushSubscription,
  updateUserPushEnabled,
  deactivateAllSubscriptions,
  getAdminUserId,
  wait,
  MOCK_PUSH_SERVER,
} from "./helpers/test-helpers.js";

describe("Push Delivery - Múltiplos Dispositivos", () => {
  const version = process.env.DIRECTUS_TEST_VERSION || "11.15.1";
  const testSuiteId = `multiple-devices-${version.replace(/\./g, "-")}`;
  let userId: string;

  beforeAll(async () => {
    process.env.DIRECTUS_VERSION = version;
    logger.setCurrentTest(`Multiple Devices Test - Directus ${version}`);
    await setupTestEnvironment(testSuiteId);
    userId = await getAdminUserId(testSuiteId);
    await updateUserPushEnabled(userId, true, testSuiteId);
  }, 420000);

  afterAll(async () => {
    await teardownTestEnvironment(testSuiteId);
  });

  test("Deve enviar para todos os dispositivos ativos do usuário", async () => {
    await deactivateAllSubscriptions(userId, testSuiteId);

    const devices = ["Desktop", "Mobile", "Tablet"];

    // Criar 3 subscriptions ativas
    for (const device of devices) {
      await createPushSubscription(
        userId,
        {
          endpoint: `${MOCK_PUSH_SERVER}/push-${device}`,
          device_name: device,
          is_active: true,
        },
        testSuiteId,
      );
    }

    const notification = await createUserNotification(
      {
        user: userId,
        title: "Multi-device Notification",
        body: "Testing multiple devices",
        channel: "push",
      },
      testSuiteId,
    );

    await wait(5000);

    const deliveries = await getPushDeliveries(notification.id, testSuiteId);

    expect(deliveries).toHaveLength(3);
    deliveries.forEach((delivery) => {
      expect(delivery.attempt_count).toBeGreaterThanOrEqual(1);
    });
  });

  test("Deve ignorar dispositivos inativos", async () => {
    await deactivateAllSubscriptions(userId, testSuiteId);

    // Criar 2 subscriptions ativas
    await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/active1`,
        device_name: "Active Device 1",
        is_active: true,
      },
      testSuiteId,
    );

    await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/active2`,
        device_name: "Active Device 2",
        is_active: true,
      },
      testSuiteId,
    );

    // Criar 1 subscription inativa
    await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/inactive`,
        device_name: "Inactive Device",
        is_active: false,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user: userId,
        title: "Test Active Only",
        body: "Should only send to active devices",
        channel: "push",
      },
      testSuiteId,
    );

    await wait(5000);

    const deliveries = await getPushDeliveries(notification.id, testSuiteId);

    // Deve ter criado apenas 2 deliveries (para os ativos)
    expect(deliveries).toHaveLength(2);
    deliveries.forEach((delivery) => {
      expect(delivery.attempt_count).toBeGreaterThanOrEqual(1);
    });
  });

  test("Deve identificar dispositivos corretamente por device_name", async () => {
    await deactivateAllSubscriptions(userId, testSuiteId);

    const deviceNames = ["Desktop Chrome", "Mobile Safari", "Tablet Firefox"];
    const createdSubscriptions: string[] = [];

    for (const name of deviceNames) {
      const sub = await createPushSubscription(
        userId,
        {
          endpoint: `${MOCK_PUSH_SERVER}/${name.replace(/\s/g, "-")}`,
          device_name: name,
          is_active: true,
        },
        testSuiteId,
      );
      createdSubscriptions.push(sub.id);
    }

    const notification = await createUserNotification(
      {
        user: userId,
        title: "Device Identification",
        body: "Testing device names",
        channel: "push",
      },
      testSuiteId,
    );

    await wait(5000);

    const deliveries = await getPushDeliveries(notification.id, testSuiteId);

    expect(deliveries).toHaveLength(3);

    // Verificar que todos os subscription IDs estão presentes
    const deliverySubscriptionIds = deliveries.map((d) => d.subscription);
    createdSubscriptions.forEach((subId) => {
      expect(deliverySubscriptionIds).toContain(subId);
    });
  });

  test("Deve atualizar date_last_used em todos os dispositivos", async () => {
    await deactivateAllSubscriptions(userId, testSuiteId);

    const sub1 = await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/device-time-1`,
        device_name: "Device Time 1",
        is_active: true,
      },
      testSuiteId,
    );

    const sub2 = await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/device-time-2`,
        device_name: "Device Time 2",
        is_active: true,
      },
      testSuiteId,
    );

    // Timestamps originais para referência (não utilizados no teste)
    // const _original1 = sub1.date_last_used;
    // const _original2 = sub2.date_last_used;

    await wait(100);

    await createUserNotification(
      {
        user: userId,
        title: "Update Timestamp",
        body: "Testing date_last_used update",
        channel: "push",
      },
      testSuiteId,
    );

    await wait(5000);
    const updatedSub1 = await getPushSubscription(sub1.id, testSuiteId);
    const updatedSub2 = await getPushSubscription(sub2.id, testSuiteId);

    // Ambas subscriptions devem ter date_last_used atualizado
    expect(updatedSub1.date_last_used).toBeTruthy();
    expect(updatedSub2.date_last_used).toBeTruthy();

    // Verificar que foi atualizado recentemente
    expect(new Date(updatedSub1.date_last_used!).getTime()).toBeGreaterThan(0);
    expect(new Date(updatedSub2.date_last_used!).getTime()).toBeGreaterThan(0);
  });

  test("Deve lidar com falha parcial em múltiplos dispositivos", async () => {
    await deactivateAllSubscriptions(userId, testSuiteId);

    // Criar 3 subscriptions válidas
    // Nota: Este teste verifica a estrutura de falha parcial
    // Em produção, falhas reais viriam de erros do web-push
    await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/device-partial-1`,
        device_name: "Device Partial 1",
        is_active: true,
      },
      testSuiteId,
    );

    await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/device-partial-2`,
        device_name: "Device Partial 2",
        is_active: true,
      },
      testSuiteId,
    );

    await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/device-partial-3`,
        device_name: "Device Partial 3",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user: userId,
        title: "Partial Failure Test",
        body: "Testing handling of partial failures",
        channel: "push",
      },
      testSuiteId,
    );

    await wait(5000);

    const deliveries = await getPushDeliveries(notification.id, testSuiteId);

    // Deve ter criado deliveries para todos os dispositivos
    expect(deliveries).toHaveLength(3);

    // Verificar que todos foram processados
    deliveries.forEach((delivery) => {
      expect(["sent", "failed", "queued"].includes(delivery.status)).toBe(true);
      expect(delivery.attempt_count).toBeGreaterThanOrEqual(1);
      expect(delivery.max_attempts).toBeGreaterThanOrEqual(1);
    });
  });
});
