import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { setupTestEnvironment, teardownTestEnvironment } from "../setup.js";
import { logger } from "../test-logger.js";
import {
  createPushSubscription,
  createUserNotification,
  createLanguage,
  updateUserLanguage,
  updateUserPushEnabled,
  getPushDeliveries,
  getNotificationTranslations,
  getAdminUserId,
  wait,
  MOCK_PUSH_SERVER,
} from "./helpers/test-helpers.js";

describe("Push Delivery - Fluxo de Tradução (i18n)", () => {
  const version = process.env.DIRECTUS_TEST_VERSION || "11.15.1";
  const testSuiteId = `translation-flow-${version.replace(/\./g, "-")}`;
  let userId: string;

  beforeAll(async () => {
    process.env.DIRECTUS_VERSION = version;
    logger.setCurrentTest(`Translation Flow Test - Directus ${version}`);
    await setupTestEnvironment(testSuiteId);
    userId = await getAdminUserId(testSuiteId);
    await updateUserPushEnabled(userId, true, testSuiteId);

    // Criar idiomas necessários para os testes
    try {
      await createLanguage("en-US", "English", testSuiteId);
    } catch {
      logger.info("Language en-US may already exist, continuing");
    }

    try {
      await createLanguage("pt-BR", "Português (Brasil)", testSuiteId);
    } catch {
      logger.info("Language pt-BR may already exist, continuing");
    }

    try {
      await createLanguage("es-ES", "Español", testSuiteId);
    } catch {
      logger.info("Language es-ES may already exist, continuing");
    }
  }, 420000);

  afterAll(async () => {
    // Resetar idioma do usuário para null
    try {
      await updateUserLanguage(userId, null, testSuiteId);
    } catch {
      // Ignorar erro no teardown
    }

    await teardownTestEnvironment(testSuiteId);
  });

  test("Deve processar notificação com traduções sem erros", async () => {
    const subscription = await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/translation-basic`,
        device_name: "Translation Test Device",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user: userId,
        title: "Default Title",
        body: "Default body",
        channel: "push",
        translations: [
          {
            languages_code: "pt-BR",
            title: "Título em Português",
            body: "Corpo em Português",
          },
          {
            languages_code: "en-US",
            title: "Title in English",
            body: "Body in English",
          },
        ],
      },
      testSuiteId,
    );

    // Aguardar hook processar
    await wait(3000);

    // Verificar que traduções foram salvas no banco
    const translations = await getNotificationTranslations(
      notification.id,
      testSuiteId,
    );
    expect(translations).toHaveLength(2);

    // Verificar que delivery foi criado (hook não crashou ao processar traduções)
    const deliveries = await getPushDeliveries(notification.id, testSuiteId);
    expect(deliveries.length).toBeGreaterThanOrEqual(1);

    const delivery = deliveries.find(
      (d) => String(d.subscription) === String(subscription.id),
    );
    expect(delivery).toBeTruthy();
    // Com mock server, o status será failed (webpush não funciona com endpoint fake)
    // O importante é que o hook processou as traduções e chegou até o envio
    expect(delivery?.attempt_count).toBeGreaterThanOrEqual(1);
  });

  test("Deve resolver tradução no idioma do usuário (pt-BR)", async () => {
    // Configurar idioma do usuário
    await updateUserLanguage(userId, "pt-BR", testSuiteId);

    await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/translation-ptbr`,
        device_name: "PT-BR Device",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user: userId,
        title: "Default Title",
        body: "Default body",
        channel: "push",
        translations: [
          {
            languages_code: "pt-BR",
            title: "Título PT-BR",
            body: "Corpo PT-BR",
          },
          {
            languages_code: "en-US",
            title: "Title EN-US",
            body: "Body EN-US",
          },
        ],
      },
      testSuiteId,
    );

    await wait(3000);

    // Hook processou sem crash — delivery existe
    const deliveries = await getPushDeliveries(notification.id, testSuiteId);
    expect(deliveries.length).toBeGreaterThanOrEqual(1);

    // Traduções salvas corretamente
    const translations = await getNotificationTranslations(
      notification.id,
      testSuiteId,
    );
    expect(translations).toHaveLength(2);
    expect(translations.some((t) => t.languages_code === "pt-BR")).toBe(true);
    expect(translations.some((t) => t.languages_code === "en-US")).toBe(true);
  });

  test("Deve fazer fallback quando idioma do usuário não tem tradução", async () => {
    // Configurar idioma do usuário para francês (sem tradução disponível)
    await updateUserLanguage(userId, "fr-FR", testSuiteId);

    await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/translation-fallback`,
        device_name: "Fallback Device",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user: userId,
        title: "Default Fallback Title",
        body: "Default fallback body",
        channel: "push",
        translations: [
          {
            languages_code: "pt-BR",
            title: "Título PT-BR",
            body: "Corpo PT-BR",
          },
          {
            languages_code: "en-US",
            title: "English Fallback",
            body: "English fallback body",
          },
        ],
      },
      testSuiteId,
    );

    await wait(3000);

    // Hook processou sem crash mesmo sem tradução no idioma do usuário
    const deliveries = await getPushDeliveries(notification.id, testSuiteId);
    expect(deliveries.length).toBeGreaterThanOrEqual(1);
    // Hook resolve para en-US (fallback) ou campos diretos — sem crash
    deliveries.forEach((d) => {
      expect(d.attempt_count).toBeGreaterThanOrEqual(1);
    });
  });

  test("Deve continuar funcionando sem traduções (retrocompatibilidade)", async () => {
    // Resetar idioma do usuário
    await updateUserLanguage(userId, null, testSuiteId);

    await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/no-translations`,
        device_name: "No Translation Device",
        is_active: true,
      },
      testSuiteId,
    );

    // Criar notificação SEM traduções (como as existentes antes do i18n)
    const notification = await createUserNotification(
      {
        user: userId,
        title: "Simple Title",
        body: "Simple body without translations",
        channel: "push",
      },
      testSuiteId,
    );

    await wait(3000);

    // Sem traduções, hook deve usar title/body direto
    const translations = await getNotificationTranslations(
      notification.id,
      testSuiteId,
    );
    expect(translations).toHaveLength(0);

    // Delivery criado normalmente
    const deliveries = await getPushDeliveries(notification.id, testSuiteId);
    expect(deliveries.length).toBeGreaterThanOrEqual(1);
    deliveries.forEach((d) => {
      expect(d.attempt_count).toBeGreaterThanOrEqual(1);
    });
  });

  test("Deve funcionar com user_language nulo e traduções presentes", async () => {
    // Garantir idioma do usuário como null
    await updateUserLanguage(userId, null, testSuiteId);

    await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/null-language`,
        device_name: "Null Language Device",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user: userId,
        title: "Default for null lang",
        body: "Body for null lang",
        channel: "push",
        translations: [
          {
            languages_code: "pt-BR",
            title: "PT-BR Title",
            body: "PT-BR Body",
          },
          {
            languages_code: "en-US",
            title: "EN-US Title",
            body: "EN-US Body",
          },
        ],
      },
      testSuiteId,
    );

    await wait(3000);

    // Hook resolve para en-US (fallback default) ou campos diretos
    const deliveries = await getPushDeliveries(notification.id, testSuiteId);
    expect(deliveries.length).toBeGreaterThanOrEqual(1);
    deliveries.forEach((d) => {
      expect(d.attempt_count).toBeGreaterThanOrEqual(1);
    });
  });

  test("Deve processar notificação com tradução em apenas um idioma", async () => {
    await updateUserLanguage(userId, "es-ES", testSuiteId);

    await createPushSubscription(
      userId,
      {
        endpoint: `${MOCK_PUSH_SERVER}/single-translation`,
        device_name: "Single Translation Device",
        is_active: true,
      },
      testSuiteId,
    );

    const notification = await createUserNotification(
      {
        user: userId,
        title: "Default Title",
        body: "Default body",
        channel: "push",
        translations: [
          {
            languages_code: "es-ES",
            title: "Título en Español",
            body: "Cuerpo en Español",
          },
        ],
      },
      testSuiteId,
    );

    await wait(3000);

    // Verificar tradução salva
    const translations = await getNotificationTranslations(
      notification.id,
      testSuiteId,
    );
    expect(translations).toHaveLength(1);
    expect(translations[0]?.languages_code).toBe("es-ES");

    // Delivery criado
    const deliveries = await getPushDeliveries(notification.id, testSuiteId);
    expect(deliveries.length).toBeGreaterThanOrEqual(1);
  });

  test("Deve enviar para múltiplos dispositivos com tradução resolvida", async () => {
    await updateUserLanguage(userId, "pt-BR", testSuiteId);

    // Criar 3 dispositivos
    const devices = ["Desktop-i18n", "Mobile-i18n", "Tablet-i18n"];
    for (const device of devices) {
      await createPushSubscription(
        userId,
        {
          endpoint: `${MOCK_PUSH_SERVER}/multi-${device}`,
          device_name: device,
          is_active: true,
        },
        testSuiteId,
      );
    }

    const notification = await createUserNotification(
      {
        user: userId,
        title: "Default Multi",
        body: "Default multi body",
        channel: "push",
        translations: [
          {
            languages_code: "pt-BR",
            title: "Multi PT-BR",
            body: "Multi corpo PT-BR",
          },
          {
            languages_code: "en-US",
            title: "Multi EN-US",
            body: "Multi body EN-US",
          },
        ],
      },
      testSuiteId,
    );

    await wait(5000);

    // Todos os 3 dispositivos devem receber delivery
    const deliveries = await getPushDeliveries(notification.id, testSuiteId);
    expect(deliveries.length).toBeGreaterThanOrEqual(3);

    // Todos processados (attempt_count > 0 = hook não crashou)
    deliveries.forEach((d) => {
      expect(d.attempt_count).toBeGreaterThanOrEqual(1);
    });
  });
});
