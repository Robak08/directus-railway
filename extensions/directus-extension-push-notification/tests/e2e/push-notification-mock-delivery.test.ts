/**
 * Teste E2E de confirmação de entrega via Mock Push Server
 *
 * Verifica que ao criar uma user_notification o hook realmente
 * faz a chamada HTTP para o endpoint de push (webpush.sendNotification).
 *
 * Requer o serviço mock-push-server rodando (adicionado ao docker-compose.test.yml).
 * Se MOCK_PUSH_SERVER_URL ou MOCK_PUSH_ENDPOINT_BASE não estiverem definidos,
 * o teste é ignorado automaticamente.
 */
import { test, expect, BrowserContext } from "@playwright/test";

const DIRECTUS_URL = process.env.DIRECTUS_URL || "http://localhost:8055";

/**
 * URL do mock-push-server acessível pelo test runner (host ou container tests).
 * Ex: http://localhost:32801 (local) ou http://mock-push-server:8080 (CI)
 */
const MOCK_PUSH_SERVER_URL =
  process.env.MOCK_PUSH_SERVER_URL || "https://mock-push-server:8080";

/**
 * URL base dos endpoints de push acessível DENTRO do container directus.
 * Ex: https://mock-push-server:8080 (docker network)
 */
const MOCK_PUSH_ENDPOINT_BASE =
  process.env.MOCK_PUSH_ENDPOINT_BASE || "https://mock-push-server:8080";

const DIRECTUS_EMAIL = "admin@example.com";
const DIRECTUS_PASSWORD = "test-password-not-a-leak";

async function authenticate(context: BrowserContext) {
  const response = await context.request.post(`${DIRECTUS_URL}/auth/login`, {
    data: { email: DIRECTUS_EMAIL, password: DIRECTUS_PASSWORD },
  });
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  const accessToken = data.data.access_token as string;

  const meResponse = await context.request.get(`${DIRECTUS_URL}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(meResponse.ok()).toBeTruthy();
  const meData = await meResponse.json();

  return { accessToken, userId: meData.data.id as string };
}

test.describe("Push Notification - Confirmação de Chamada ao Endpoint", () => {
  test("deve chamar o endpoint de push ao criar uma notificação (confirmado pelo mock server)", async ({
    browser,
  }) => {
    // Verificar se o mock server está disponível — pular se não estiver
    const context = await browser.newContext({
      baseURL: DIRECTUS_URL,
      ignoreHTTPSErrors: true,
    });
    try {
      const healthResponse = await context.request
        .get(`${MOCK_PUSH_SERVER_URL}/health`, { timeout: 3000 })
        .catch(() => null);

      if (!healthResponse?.ok()) {
        test.skip(
          true,
          `Mock push server não disponível em ${MOCK_PUSH_SERVER_URL}`,
        );
        return;
      }

      // 1. Autenticar
      const { accessToken, userId } = await authenticate(context);

      // 2. Habilitar push
      const enableResponse = await context.request.patch(`/users/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { push_enabled: true },
      });
      expect(enableResponse.ok()).toBeTruthy();

      // 3. Limpar mensagens anteriores do mock server
      await context.request.delete(`${MOCK_PUSH_SERVER_URL}/messages`);

      // 4. Registrar subscription com endpoint apontando para o mock server
      //    O UUID único garante isolamento entre execuções paralelas
      const subscriptionId = `mock-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const mockEndpoint = `${MOCK_PUSH_ENDPOINT_BASE}/push/${subscriptionId}`;

      const registerResponse = await context.request.post(
        `/push-notification/register`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            subscription: {
              endpoint: mockEndpoint,
              keys: {
                p256dh:
                  "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
                auth: "tBHItJI5svbpez7KI4CCXg",
              },
            },
            device_name: "Mock E2E Test",
          },
        },
      );
      // O endpoint /push-notification/register retorna texto, não JSON
      // Buscar o ID da subscription pela API de items filtrando pelo endpoint
      expect(registerResponse.ok()).toBeTruthy();
      const subQueryResponse = await context.request.get(
        `/items/push_subscription?filter[endpoint][_eq]=${encodeURIComponent(mockEndpoint)}&limit=1`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      expect(subQueryResponse.ok()).toBeTruthy();
      const subQueryData = await subQueryResponse.json();
      expect(subQueryData.data?.length).toBeGreaterThan(0);
      const pushSubscriptionId = subQueryData.data[0].id as string;
      console.log(
        `✅ Subscription registrada: ${pushSubscriptionId} → ${mockEndpoint}`,
      );

      // 5. Criar notificação
      const notifResponse = await context.request.post(
        `/items/user_notification`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            user: userId,
            title: "Mock Delivery Test",
            body: `Confirmação de chamada ao endpoint — ${new Date().toISOString()}`,
            channel: "push",
            priority: "normal",
          },
        },
      );
      expect(notifResponse.ok()).toBeTruthy();
      const notifData = await notifResponse.json();
      const notificationId = String(notifData.data.id);
      console.log(`✅ Notificação criada: ${notificationId}`);

      // 6. Aguardar delivery com status "sent" (o mock retorna 201 → hook marca sent)
      let delivery: { status: string; attempt_count: number } | null = null;

      for (let attempt = 0; attempt < 20; attempt++) {
        const deliveriesResponse = await context.request.get(
          `/items/push_delivery?filter[notification][_eq]=${notificationId}&filter[subscription][_eq]=${pushSubscriptionId}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const deliveriesData = await deliveriesResponse.json();

        if (deliveriesData.data?.length > 0) {
          const candidate = deliveriesData.data[0];
          console.log(
            `[attempt ${attempt + 1}] status=${candidate.status} attempt_count=${candidate.attempt_count}`,
          );

          if (candidate.status === "sent") {
            delivery = candidate;
            break;
          }

          // Se falhou definitivamente, não vai melhorar
          if (candidate.status === "failed" && candidate.attempt_count >= 3) {
            delivery = candidate;
            break;
          }
        } else {
          console.log(`[attempt ${attempt + 1}] aguardando delivery...`);
        }

        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      expect(delivery).toBeTruthy();
      console.log(
        `✅ Delivery status: ${delivery!.status}, attempts: ${delivery!.attempt_count}`,
      );

      // 7. Confirmar que o mock server recebeu a chamada HTTP
      const messagesResponse = await context.request.get(
        `${MOCK_PUSH_SERVER_URL}/messages/${subscriptionId}`,
      );
      expect(messagesResponse.ok()).toBeTruthy();
      const messagesData = await messagesResponse.json();

      console.log(
        `✅ Mock server recebeu ${messagesData.messages.length} mensagem(ns)`,
      );
      expect(messagesData.messages.length).toBeGreaterThan(0);

      const message = messagesData.messages[0];
      expect(message.subscriptionId).toBe(subscriptionId);
      expect(message.headers.authorization).toBeTruthy(); // VAPID header
      expect(message.bodyLength).toBeGreaterThan(0); // Payload criptografado

      console.log(
        `✅ CONFIRMADO: endpoint ${mockEndpoint} foi chamado pelo hook`,
      );
      console.log(
        `   - Authorization header: ${message.headers.authorization?.substring(0, 30)}...`,
      );
      console.log(
        `   - Body size: ${message.bodyLength} bytes (payload criptografado)`,
      );
      console.log(`   - Delivery status: ${delivery!.status}`);

      // 8. Verificar que o delivery foi marcado como "sent" (mock retornou 201)
      expect(delivery!.status).toBe("sent");

      // 9. Cleanup
      await context.request.patch(
        `/items/push_subscription/${pushSubscriptionId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { is_active: false },
        },
      );
    } finally {
      await context.close();
    }
  });
});
