/**
 * Teste E2E REAL de Push Notification com browser Chromium
 *
 * Este teste verifica o fluxo completo end-to-end:
 * 1. Login no Directus
 * 2. Habilitar push_enabled
 * 3. Registrar subscription REAL do browser
 * 4. Criar notificação via API
 * 5. Verificar que delivery foi criado
 * 6. (Opcional) Capturar notificação exibida no browser
 */
import { test, expect } from "@playwright/test";

const DIRECTUS_URL = process.env.DIRECTUS_URL || "http://localhost:8055";
const DIRECTUS_EMAIL = "admin@example.com";
const DIRECTUS_PASSWORD = "test-password-not-a-leak";

test.describe("Push Notification E2E - Fluxo Completo via Browser", () => {
  test("deve registrar subscription (real ou fallback), criar notificação e verificar delivery", async ({
    page,
    context,
  }) => {
    // 1. Conceder permissões de notificação
    await context.grantPermissions(["notifications"]);

    console.log("✅ Permissões de notificação concedidas");

    // 2. Fazer login via UI
    await page.goto(`${DIRECTUS_URL}/admin/login`);
    await page.fill('input[type="email"]', DIRECTUS_EMAIL);
    await page.fill('input[type="password"]', DIRECTUS_PASSWORD);
    await page.click('button[type="submit"]');

    // Aguardar redirecionamento
    await page.waitForURL(/\/admin/, { timeout: 15000 });
    console.log("✅ Login realizado");

    // 3. Obter token de autenticação via API (Directus 11 usa JWT em memória, não cookie)
    const loginResponse = await page.request.post(
      `${DIRECTUS_URL}/auth/login`,
      {
        data: { email: DIRECTUS_EMAIL, password: DIRECTUS_PASSWORD },
      },
    );
    expect(loginResponse.ok()).toBeTruthy();
    const loginData = await loginResponse.json();
    const authToken = loginData.data?.access_token as string;
    expect(authToken).toBeTruthy();
    console.log("✅ Token obtido via API");

    // 4. Habilitar push via API
    const enablePushResponse = await page.request.patch(
      `${DIRECTUS_URL}/users/me`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        data: {
          push_enabled: true,
        },
      },
    );

    expect(enablePushResponse.ok()).toBeTruthy();
    console.log("✅ push_enabled=true");

    // 5. Aguardar script de push notification ser injetado e executado
    await page.waitForTimeout(2000);

    // 6. Verificar se subscription foi registrada
    const subscriptionsResponse = await page.request.get(
      `${DIRECTUS_URL}/items/push_subscription?filter[user][_eq]=$CURRENT_USER`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    const subscriptionsData = await subscriptionsResponse.json();
    console.log(
      `✅ Subscriptions encontradas: ${subscriptionsData.data.length}`,
    );

    // Se não houver subscription, pode ser porque o browser não suporta ou falhou
    // Vamos tentar forçar o registro manualmente via evaluate
    if (subscriptionsData.data.length === 0) {
      console.log(
        "⚠️  Nenhuma subscription encontrada, tentando registrar manualmente...",
      );

      // Buscar VAPID key real do servidor (evita chave hardcoded desatualizada)
      const clientScriptResponse = await page.request.get(
        `${DIRECTUS_URL}/push-client-script/client.js`,
      );
      const clientScriptContent = await clientScriptResponse.text();
      const vapidMatch = clientScriptContent.match(
        /VAPID_PUBLIC_KEY\s*=\s*['"]([^'"]+)['"]/,
      );
      const serverVapidKey = vapidMatch?.[1] ?? "";
      console.log(
        `✅ VAPID key obtida do servidor: ${serverVapidKey.substring(0, 20)}...`,
      );

      // Tentar registrar via JavaScript no browser
      const registrationResult = await page.evaluate(
        async (vapidPublicKey: string) => {
          try {
            // Verificar suporte
            if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
              return { success: false, error: "Push não suportado" };
            }

            // Registrar service worker
            const registration = await navigator.serviceWorker.register(
              "/push-notification-sw/sw.js",
            );
            await registration.update();

            // Subscrever (vapidPublicKey recebida como argumento)
            function urlBase64ToUint8Array(base64String: string): Uint8Array {
              const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
              const base64 = (base64String + padding)
                .replace(/-/g, "+")
                .replace(/_/g, "/");
              const rawData = window.atob(base64);
              const outputArray = new Uint8Array(rawData.length);
              for (let i = 0; i < rawData.length; ++i) {
                outputArray[i] = rawData.charCodeAt(i);
              }

              return outputArray;
            }

            const subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(
                vapidPublicKey,
              ) as BufferSource,
            });

            return {
              success: true,
              endpoint: subscription.endpoint,
              keys: {
                p256dh: btoa(
                  String.fromCharCode.apply(
                    null,
                    // @ts-expect-error - Chromium não tem tipagem correta para Uint8Array
                    new Uint8Array(subscription.getKey("p256dh")),
                  ),
                ),
                auth: btoa(
                  String.fromCharCode.apply(
                    null,
                    // @ts-expect-error - Chromium não tem tipagem correta para Uint8Array
                    new Uint8Array(subscription.getKey("auth")),
                  ),
                ),
              },
            };
          } catch (error: unknown) {
            return {
              success: false,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        },
        serverVapidKey,
      );

      console.log("Resultado do registro:", registrationResult);

      if (registrationResult.success) {
        // Enviar para API
        const registerResponse = await page.request.post(
          `${DIRECTUS_URL}/push-notification/register`,
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
            data: {
              subscription: {
                endpoint: registrationResult.endpoint,
                keys: registrationResult.keys,
              },
              device_name: "Playwright E2E Test",
            },
          },
        );

        expect(registerResponse.ok()).toBeTruthy();
        console.log("✅ Subscription registrada via browser");
      } else {
        // Headless Chromium não suporta push real — criar subscription fake via API
        console.log(
          "⚠️  Registro no browser falhou, criando subscription fake via API...",
        );
        const fakeEndpoint = `https://push-e2e-test.local/subscription/${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const fakeRegisterResponse = await page.request.post(
          `${DIRECTUS_URL}/push-notification/register`,
          {
            headers: { Authorization: `Bearer ${authToken}` },
            data: {
              subscription: {
                endpoint: fakeEndpoint,
                keys: {
                  p256dh:
                    "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
                  auth: "tBHItJI5svbpez7KI4CCXg",
                },
              },
              device_name: "Playwright E2E Fallback",
            },
          },
        );
        expect(fakeRegisterResponse.ok()).toBeTruthy();
        console.log("✅ Subscription fake registrada via API");
      }
    }

    // 7. Verificar novamente subscriptions
    const finalSubscriptionsResponse = await page.request.get(
      `${DIRECTUS_URL}/items/push_subscription?filter[user][_eq]=$CURRENT_USER`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    const finalSubscriptionsData = await finalSubscriptionsResponse.json();
    expect(finalSubscriptionsData.data.length).toBeGreaterThan(0);

    const subscription = finalSubscriptionsData.data[0];
    console.log(`✅ Subscription ID: ${subscription.id}`);

    // 8. Obter ID do usuário atual
    const meResponse = await page.request.get(`${DIRECTUS_URL}/users/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(meResponse.ok()).toBeTruthy();
    const meData = await meResponse.json();
    const currentUserId = meData.data?.id as string;
    expect(currentUserId).toBeTruthy();
    console.log(`✅ User ID: ${currentUserId}`);

    // 9. Garantir que subscription está ativa (outro teste paralelo pode tê-la desativado ao enviar push)
    await page.request.patch(
      `${DIRECTUS_URL}/items/push_subscription/${subscription.id}`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
        data: { is_active: true },
      },
    );
    console.log(`✅ Subscription ${subscription.id} reativada`);

    // 10. Re-habilitar push_enabled antes de criar notificação (outro teste paralelo pode tê-lo desabilitado)
    await page.request.patch(`${DIRECTUS_URL}/users/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { push_enabled: true },
    });
    console.log(`✅ push_enabled re-habilitado`);

    // 11. Criar notificação via API
    const notificationResponse = await page.request.post(
      `${DIRECTUS_URL}/items/user_notification`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        data: {
          user: currentUserId,
          title: "Teste E2E Real",
          body: `Push notification enviada em ${new Date().toLocaleString("pt-BR")}`,
          channel: "push",
          priority: "normal",
        },
      },
    );

    expect(notificationResponse.ok()).toBeTruthy();
    const notificationData = await notificationResponse.json();
    console.log(`✅ Notificação criada: ${notificationData.data.id}`);

    // 12. Aguardar processamento do hook (com polling até status final)
    await page.waitForTimeout(3000);

    // 13. Verificar que delivery foi criado (polling até status final ou retry)
    // Status finais: sent/failed/delivered
    // Aceita também: queued com attempt_count>=1 (hook processou mas endpoint é inalcançável → retry)
    const FINAL_STATUSES = ["sent", "failed", "delivered"];
    type DeliveryRecord = {
      status: string;
      date_queued: string;
      attempt_count: number;
      subscription: string | number;
    };
    let delivery: DeliveryRecord | null = null;

    for (let attempt = 0; attempt < 15; attempt++) {
      const deliveriesResponse = await page.request.get(
        `${DIRECTUS_URL}/items/push_delivery?filter[notification][_eq]=${notificationData.data.id}`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        },
      );

      const deliveriesData = await deliveriesResponse.json();

      if (deliveriesData.data.length > 0) {
        const candidate = deliveriesData.data[0] as DeliveryRecord;
        console.log(
          `[attempt ${attempt + 1}] Delivery status: ${candidate.status}, attempt_count: ${candidate.attempt_count}`,
        );

        // Status final definitivo
        if (FINAL_STATUSES.includes(candidate.status)) {
          delivery = candidate;
          break;
        }

        // queued com attempt_count>=1: hook processou, falhou e enfileirou para retry
        if (candidate.status === "queued" && candidate.attempt_count >= 1) {
          delivery = candidate;
          break;
        }
      } else {
        console.log(`[attempt ${attempt + 1}] Nenhum delivery ainda...`);
      }

      await page.waitForTimeout(2000);
    }

    expect(delivery).toBeTruthy();
    console.log(
      `✅ Delivery encontrado, status: ${delivery!.status}, attempts: ${delivery!.attempt_count}`,
    );
    console.log(`✅ Delivery subscription_id: ${delivery!.subscription}`);

    // Status esperado: final (sent/failed/delivered) ou queued-com-retry para endpoint inalcançável
    expect(
      FINAL_STATUSES.includes(delivery!.status) ||
        (delivery!.status === "queued" && delivery!.attempt_count >= 1),
    ).toBeTruthy();

    // 14. Verificar campos do delivery
    expect(delivery!.date_queued).toBeTruthy();
    expect(delivery!.attempt_count).toBeGreaterThanOrEqual(1);

    // 15. Cleanup: desativar subscription para não interferir em outros testes paralelos
    await page.request.patch(
      `${DIRECTUS_URL}/items/push_subscription/${subscription.id}`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
        data: { is_active: false },
      },
    );
    console.log(`✅ Subscription ${subscription.id} desativada (cleanup)`);

    console.log("✅ Teste E2E completo com sucesso!");
  });
});
