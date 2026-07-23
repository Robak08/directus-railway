import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { setupTestEnvironment, teardownTestEnvironment } from "../setup.js";
import { logger } from "../test-logger.js";
import {
  createPushSubscription,
  createNotificationBroadcast,
  createLanguage,
  updateUserLanguage,
  updateUserPushEnabled,
  getPushDeliveries,
  getBroadcastById,
  getBroadcastNotifications,
  getAdminUserId,
  wait,
  MOCK_PUSH_SERVER,
} from "./helpers/test-helpers.js";

describe("Broadcast Notifications — Fluxo Completo", () => {
  const version = process.env.DIRECTUS_TEST_VERSION || "11.15.1";
  const testSuiteId = `broadcast-flow-${version.replace(/\./g, "-")}`;
  let userId: string;

  beforeAll(async () => {
    process.env.DIRECTUS_VERSION = version;
    logger.setCurrentTest(`Broadcast Flow Test - Directus ${version}`);
    await setupTestEnvironment(testSuiteId);
    userId = await getAdminUserId(testSuiteId);
    await updateUserPushEnabled(userId, true, testSuiteId);

    for (const [code, name] of [
      ["en-US", "English"],
      ["pt-BR", "Português (Brasil)"],
    ] as const) {
      try {
        await createLanguage(code, name, testSuiteId);
      } catch {
        logger.info(`Language ${code} may already exist, continuing`);
      }
    }
  }, 420000);

  afterAll(async () => {
    try {
      await updateUserLanguage(userId, null, testSuiteId);
    } catch {
      // ignore teardown errors
    }
    await teardownTestEnvironment(testSuiteId);
  });

  test("não processa broadcast com status draft", async () => {
    const broadcast = await createNotificationBroadcast(
      {
        title: "Draft Broadcast",
        body: "Should not process",
        target_type: "users",
        target_users: [{ directus_users_id: userId }],
        channel: "push",
        priority: "normal",
        status: "draft",
      },
      testSuiteId,
    );

    await wait(2000);

    const updated = await getBroadcastById(broadcast.id, testSuiteId);
    expect(updated.status).toBe("draft");

    const notifications = await getBroadcastNotifications(
      broadcast.id,
      testSuiteId,
    );
    expect(notifications).toHaveLength(0);
  });

  test("cria user_notification por usuário alvo com status processing", async () => {
    await updateUserLanguage(userId, "en-US", testSuiteId);

    const broadcast = await createNotificationBroadcast(
      {
        title: "Broadcast EN",
        body: "Broadcast body in English",
        target_type: "users",
        target_users: [{ directus_users_id: userId }],
        channel: "push",
        priority: "normal",
        status: "processing",
        translations: [
          {
            languages_code: "pt-BR",
            title: "Broadcast PT",
            body: "Corpo em português",
          },
        ],
      },
      testSuiteId,
    );

    await wait(3000);

    const updated = await getBroadcastById(broadcast.id, testSuiteId);
    expect(updated.status).toBe("completed");
    expect(updated.total_users).toBeGreaterThanOrEqual(1);
    expect(updated.total_created).toBeGreaterThanOrEqual(1);
    expect(updated.date_processed).toBeTruthy();

    const notifications = await getBroadcastNotifications(
      broadcast.id,
      testSuiteId,
    );
    expect(notifications.length).toBeGreaterThanOrEqual(1);
    expect(notifications[0].broadcast).toBe(broadcast.id);
    expect(notifications[0].user).toBe(userId);
    expect(notifications[0].title).toBe("Broadcast EN");
  });

  test("resolve tradução no idioma do usuário", async () => {
    await updateUserLanguage(userId, "pt-BR", testSuiteId);

    const broadcast = await createNotificationBroadcast(
      {
        title: "Fallback Title",
        body: "Fallback body",
        target_type: "users",
        target_users: [{ directus_users_id: userId }],
        channel: "in_app",
        priority: "normal",
        status: "processing",
        translations: [
          {
            languages_code: "pt-BR",
            title: "Título Traduzido",
            body: "Corpo traduzido",
          },
        ],
      },
      testSuiteId,
    );

    await wait(3000);

    const notifications = await getBroadcastNotifications(
      broadcast.id,
      testSuiteId,
    );
    expect(notifications.length).toBeGreaterThanOrEqual(1);
    expect(notifications[0].title).toBe("Título Traduzido");
    expect(notifications[0].body).toBe("Corpo traduzido");
  });

  test("dispara push delivery para broadcast com channel push", async () => {
    await updateUserPushEnabled(userId, true, testSuiteId);
    await updateUserLanguage(userId, "en-US", testSuiteId);

    await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/broadcast-push-${Date.now()}`,
        device_name: "Broadcast Test Device",
        is_active: true,
      },
      testSuiteId,
    );

    const broadcast = await createNotificationBroadcast(
      {
        title: "Push Broadcast",
        body: "Push broadcast body",
        target_type: "users",
        target_users: [{ directus_users_id: userId }],
        channel: "push",
        priority: "high",
        status: "processing",
      },
      testSuiteId,
    );

    await wait(4000);

    const notifications = await getBroadcastNotifications(
      broadcast.id,
      testSuiteId,
    );
    expect(notifications.length).toBeGreaterThanOrEqual(1);

    const deliveries = await getPushDeliveries(notifications[0].id, testSuiteId);
    expect(deliveries.length).toBeGreaterThanOrEqual(1);
    expect(["queued", "sending", "sent", "delivered"]).toContain(
      deliveries[0].status,
    );
  });

  test("pula usuários com push_enabled=false quando channel é push", async () => {
    await updateUserPushEnabled(userId, false, testSuiteId);

    const broadcast = await createNotificationBroadcast(
      {
        title: "Skipped Push",
        body: "Should skip disabled user",
        target_type: "users",
        target_users: [{ directus_users_id: userId }],
        channel: "push",
        priority: "normal",
        status: "processing",
      },
      testSuiteId,
    );

    await wait(3000);

    const updated = await getBroadcastById(broadcast.id, testSuiteId);
    expect(updated.status).toBe("completed");
    expect(updated.total_created).toBe(0);

    const notifications = await getBroadcastNotifications(
      broadcast.id,
      testSuiteId,
    );
    expect(notifications).toHaveLength(0);

    await updateUserPushEnabled(userId, true, testSuiteId);
  });
});
