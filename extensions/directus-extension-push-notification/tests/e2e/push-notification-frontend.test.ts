import { test, expect } from "@playwright/test";

const DIRECTUS_URL = process.env.DIRECTUS_URL || "http://localhost:8055";
const DIRECTUS_EMAIL = process.env.DIRECTUS_EMAIL || "admin@example.com";
const DIRECTUS_PASSWORD =
  process.env.DIRECTUS_PASSWORD || "test-password-not-a-leak";

test.describe("Push Notification - Frontend Integration", () => {
  let authToken: string;

  test.beforeAll(async ({ request }) => {
    // Login via API para obter token
    const response = await request.post(`${DIRECTUS_URL}/auth/login`, {
      data: {
        email: DIRECTUS_EMAIL,
        password: DIRECTUS_PASSWORD,
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    authToken = data.data.access_token;
  });

  test("deve servir o Service Worker em /push-notification-sw/sw.js", async ({
    request,
  }) => {
    const response = await request.get(
      `${DIRECTUS_URL}/push-notification-sw/sw.js`,
    );

    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toContain(
      "application/javascript",
    );

    const content = await response.text();
    expect(content).toContain("self.addEventListener");
    expect(content).toContain("push");
    expect(content).toContain("notificationclick");
  });

  test("deve responder ao health check", async ({ request }) => {
    const response = await request.get(
      `${DIRECTUS_URL}/push-notification-sw/health`,
    );

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.status).toBe("ok");
    expect(data.service).toBe("push-notification-sw");
  });

  test("deve injetar script de push notification no HTML do Directus", async ({
    page,
  }) => {
    // Fazer login no Directus via UI
    await page.goto(`${DIRECTUS_URL}/admin/login`);

    // Preencher credenciais
    await page.fill('input[type="email"]', DIRECTUS_EMAIL);
    await page.fill('input[type="password"]', DIRECTUS_PASSWORD);

    // Clicar no botão de login
    await page.click('button[type="submit"]');

    // Aguardar redirecionamento para o admin
    await page.waitForURL(/\/admin/, { timeout: 10000 });

    // Verificar se o script de push notification foi injetado
    // O hook injeta <script src="/push-client-script/client.js"> (script externo)
    const scriptSrcFound = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll("script"));
      // Verificar script externo via src
      const externalScript = scripts.find(
        (s) => s.src && s.src.includes("/push-client-script/client.js"),
      );
      if (externalScript) return externalScript.src;
      // Fallback: script inline
      const inlineScript = scripts.find(
        (s) => s.textContent && s.textContent.includes("[PushNotification]"),
      );
      return inlineScript?.textContent || null;
    });

    expect(scriptSrcFound).toBeTruthy();

    // Buscar o conteúdo do script externo para verificar as variáveis
    const scriptResponse = await page.request.get(
      `${DIRECTUS_URL}/push-client-script/client.js`,
    );
    expect(scriptResponse.ok()).toBeTruthy();
    const scriptContent = await scriptResponse.text();
    expect(scriptContent).toContain("initPushNotification");
    expect(scriptContent).toContain("VAPID_PUBLIC_KEY");
  });

  test("deve registrar endpoint via API /push-notification/register", async ({
    request,
  }) => {
    // Simular registro de subscription
    const mockSubscription = {
      subscription: {
        endpoint: `https://fcm.googleapis.com/fcm/send/test-endpoint-${Date.now()}`,
        keys: {
          p256dh:
            "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
          auth: "tBHItJI5svbpez7KI4CCXg",
        },
      },
      device_name: "Test Device E2E",
    };

    const response = await request.post(
      `${DIRECTUS_URL}/push-notification/register`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        data: mockSubscription,
      },
    );

    expect(response.ok()).toBeTruthy();
  });

  test("deve ter o campo push_enabled disponível para o usuário", async ({
    request,
  }) => {
    // Verificar que o usuário pode ler seu próprio push_enabled
    const response = await request.get(
      `${DIRECTUS_URL}/users/me?fields=id,push_enabled`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.data).toHaveProperty("push_enabled");
  });

  test("deve permitir atualizar push_enabled do usuário", async ({
    request,
  }) => {
    // Habilitar push
    const enableResponse = await request.patch(`${DIRECTUS_URL}/users/me`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      data: {
        push_enabled: true,
      },
    });

    expect(enableResponse.ok()).toBeTruthy();

    // Verificar
    const checkResponse = await request.get(
      `${DIRECTUS_URL}/users/me?fields=push_enabled`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    const checkData = await checkResponse.json();
    // Directus pode retornar 1/0 ou true/false dependendo do banco
    expect(checkData.data.push_enabled).toBeTruthy();
  });
});
