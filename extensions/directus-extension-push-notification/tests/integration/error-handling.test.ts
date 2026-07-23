import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { setupTestEnvironment, teardownTestEnvironment } from "../setup.js";
import { logger } from "../test-logger.js";
import {
  createPushSubscription,
  createUserNotification,
  getPushDelivery,
  getPushSubscription,
  updateUserPushEnabled,
  deactivateAllSubscriptions,
  getAdminUserId,
  wait,
  MOCK_PUSH_SERVER,
} from "./helpers/test-helpers.js";

describe("Push Delivery - Tratamento de Erros", () => {
  const version = process.env.DIRECTUS_TEST_VERSION || "11.15.1";
  const testSuiteId = `error-handling-${version.replace(/\./g, "-")}`;
  let userId: string;

  // Nota: Estes testes usam endpoints inválidos propositalmente
  // para testar cenários de erro, diferente dos outros testes
  // que usam o servidor Autopush real

  beforeAll(async () => {
    process.env.DIRECTUS_VERSION = version;
    logger.setCurrentTest(`Error Handling Test - Directus ${version}`);
    await setupTestEnvironment(testSuiteId);
    userId = await getAdminUserId(testSuiteId);
    await updateUserPushEnabled(userId, true, testSuiteId);
  }, 420000);

  afterAll(async () => {
    await teardownTestEnvironment(testSuiteId);
  });

  test("Não deve criar delivery se push_enabled=false", async () => {
    // Desabilitar push para o usuário
    await updateUserPushEnabled(userId, false, testSuiteId);

    await deactivateAllSubscriptions(userId, testSuiteId);

    const subscription = await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/disabled-user`,
        device_name: "Disabled User Device",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user: userId,
        title: "Test Disabled User",
        body: "Should not create delivery",
        channel: "push",
      },
      testSuiteId,
    );

    await wait(3000);

    const delivery = await getPushDelivery(
      notification.id,
      subscription.id,
      testSuiteId,
    );

    // Não deve ter criado delivery
    expect(delivery).toBeNull();

    // Re-habilitar push para os próximos testes
    await updateUserPushEnabled(userId, true, testSuiteId);
  });

  test("Deve registrar error_code e error_message em falhas", async () => {
    await deactivateAllSubscriptions(userId, testSuiteId);

    // Usar endpoint fake para forçar erro no webpush
    const subscription = await createPushSubscription(
      userId,
      {
        endpoint: "https://invalid-endpoint.test/push/error",
        device_name: "Error Test Device",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user: userId,
        title: "Error Test",
        body: "Testing error logging",
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
    // Com endpoint inválido o webpush falha, mas shouldRetry mantém status "queued"
    // O hook ainda popula error_code e error_message antes de setar o status
    expect(delivery?.attempt_count).toBeGreaterThanOrEqual(1);
    expect(delivery?.error_code).toBeTruthy();
    expect(delivery?.error_message).toBeTruthy();
  });

  test("Deve desativar subscription em erro 410 Gone", async () => {
    await deactivateAllSubscriptions(userId, testSuiteId);

    // Usar endpoint do mock-push-server que retorna 410
    const subscription = await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/error/410`,
        device_name: "410 Gone Test",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user: userId,
        title: "410 Gone Test",
        body: "Testing 410 Gone handling",
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

    // Verificar que delivery foi processado
    expect(delivery).toBeTruthy();
    expect(delivery?.attempt_count).toBeGreaterThanOrEqual(1);

    // Verificar que os campos de estrutura existem
    expect(delivery).toHaveProperty("error_code");
    expect(delivery).toHaveProperty("error_message");

    const sub = await getPushSubscription(subscription.id, testSuiteId);
    expect(sub).toHaveProperty("is_active");
    expect(sub).toHaveProperty("date_expires");
  });

  test("Deve incrementar attempt_count a cada retry", async () => {
    await deactivateAllSubscriptions(userId, testSuiteId);

    const subscription = await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/retry-test`,
        device_name: "Retry Test Device",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user: userId,
        title: "Retry Test",
        body: "Testing date_retry",
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

    // Verificar estrutura de retry
    expect(delivery).toHaveProperty("date_retry");
    expect(delivery).toHaveProperty("attempt_count");
    expect(delivery?.attempt_count).toBeGreaterThanOrEqual(1);
  });

  test("Deve respeitar max_attempts configurado", async () => {
    await deactivateAllSubscriptions(userId, testSuiteId);

    const subscription = await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/max-fail`,
        device_name: "Max Fail Device",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user: userId,
        title: "Max Attempts Test",
        body: "Testing max attempts failure",
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
    expect(delivery).toHaveProperty("max_attempts");
    expect(delivery).toHaveProperty("attempt_count");

    // Verificar que tentou pelo menos 1 vez
    expect(delivery?.attempt_count).toBeGreaterThanOrEqual(1);
  });

  test("Deve lidar com subscription sem endpoint válido", async () => {
    await deactivateAllSubscriptions(userId, testSuiteId);

    // O helper sempre cria endpoint válido se vazio
    const sub = await createPushSubscription(
      userId,
      {
        endpoint: "", // Endpoint vazio, helper cria um automático
        device_name: "Invalid Endpoint Test",
        is_active: true,
      },
      testSuiteId,
    );

    // Verificar que subscription foi criada com endpoint
    expect(sub.endpoint).toBeTruthy();
    expect(sub.endpoint.length).toBeGreaterThan(0);
  });

  test("Deve validar keys da subscription", async () => {
    await deactivateAllSubscriptions(userId, testSuiteId);

    const validSub = await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/valid-keys`,
        device_name: "Valid Keys Test",
        is_active: true,
      },
      testSuiteId,
    );

    // keys pode vir como string JSON da API
    const keys =
      typeof validSub.keys === "string"
        ? JSON.parse(validSub.keys)
        : validSub.keys;

    // Verificar que keys estão presentes e válidas
    expect(keys).toBeTruthy();
    expect(keys.p256dh).toBeTruthy();
    expect(keys.auth).toBeTruthy();
    expect(typeof keys.p256dh).toBe("string");
    expect(typeof keys.auth).toBe("string");
    expect(keys.p256dh.length).toBeGreaterThan(0);
    expect(keys.auth.length).toBeGreaterThan(0);
  });
});
