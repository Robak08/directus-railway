import { test, expect, Browser, BrowserContext, Page } from "@playwright/test";
import fs from "fs";

/**
 * Credenciais de admin padrão do ambiente de teste
 */
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "test-password-not-a-leak";

// Use path relativo ao workspace
const storageFile = `${process.cwd()}/tests/e2e/auth-storage.json`;

// Variáveis compartilhadas entre os testes
let sharedContext: BrowserContext;
let sharedPage: Page;

// Rodar os testes em série para evitar conflitos de sessão
test.describe.configure({ mode: "serial" });

test.describe("Push Notification Extension - E2E Tests", () => {
  test.beforeAll(
    async ({
      browser,
      baseURL,
    }: {
      browser: Browser;
      baseURL: string | undefined;
    }) => {
      // Aumentar timeout do beforeAll para dar tempo de login + navegação completa (3 minutos)
      test.setTimeout(180000);

      // Criar contexto e página compartilhados com baseURL explícito
      sharedContext = await browser.newContext({ baseURL });
      sharedPage = await sharedContext.newPage();

      // Navega para o login e faz autenticação
      await sharedPage.goto("/admin/login", { waitUntil: "networkidle" });

      // Aguardar um pouco para a página carregar completamente
      await sharedPage.waitForTimeout(2000);

      // Verificar se há um botão "Continue" ou "Continuar" (sessão existente)
      // Tenta múltiplas variações do botão
      const continueButton = sharedPage.locator(
        'button:has-text("Continue"), button:has-text("Continuar"), button[type="submit"]:has-text("Continue"), button[type="submit"]:has-text("Continuar")',
      );
      const hasContinueButton = await continueButton
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (hasContinueButton) {
        // Se há botão Continue, clicar nele e aguardar redirecionamento
        await continueButton.first().click();
        await sharedPage.waitForURL("**/admin/**", { timeout: 30000 });

        // Aguardar a página carregar completamente após o Continue
        await sharedPage.waitForLoadState("networkidle");
        await sharedPage.waitForTimeout(3000);
      } else {
        // Caso contrário, fazer login normal
        await sharedPage.fill('input[type="email"]', ADMIN_EMAIL);
        await sharedPage.fill('input[type="password"]', ADMIN_PASSWORD);

        // Enviar o formulário com Enter
        await Promise.all([
          sharedPage.waitForURL("**/admin/**", { timeout: 30000 }),
          sharedPage.press('input[type="password"]', "Enter"),
        ]);

        await sharedPage.waitForLoadState("networkidle");
        await sharedPage.waitForTimeout(2000);
      }

      // Esperar elementos de navegação visíveis (com timeout maior)
      await sharedPage.waitForSelector(
        '#navigation, aside[role="navigation"], [data-test-id="navigation"]',
        {
          timeout: 120000,
        },
      );
    },
  );

  test.afterAll(async () => {
    // Fechar contexto compartilhado
    if (sharedContext) {
      await sharedContext.close();
    }

    // Remover storage file (se existir)
    if (fs.existsSync(storageFile)) {
      try {
        fs.unlinkSync(storageFile);
      } catch {
        // ignore
      }
    }
  });

  test("deve fazer login com sucesso e acessar o dashboard", async () => {
    // A página compartilhada já está autenticada e no dashboard
    // Verificar URL e elementos do dashboard
    expect(sharedPage.url()).toContain("/admin");

    // Aguardar navegação estar visível
    const nav = await sharedPage
      .locator(
        '#navigation, aside[role="navigation"], [data-test-id="navigation"]',
      )
      .first();
    await expect(nav).toBeVisible({ timeout: 5000 });

    // Tirar screenshot para debug
    await sharedPage.screenshot({
      path: "tests/e2e/screenshots/dashboard.png",
      fullPage: true,
    });
  });

  test("deve acessar a coleção push_subscription", async () => {
    // Navegar diretamente para a coleção push_subscription
    await sharedPage.goto("/admin/content/push_subscription", {
      waitUntil: "networkidle",
    });

    // Se o Directus redirecionar para login, falhar explicitamente
    if (sharedPage.url().includes("/login")) {
      throw new Error("Redirecionado para login — sessão inválida");
    }

    // Verificar URL correta
    expect(sharedPage.url()).toContain("/admin/content/push_subscription");

    // Aguardar elementos da página de coleção (header, tabela, ou empty state)
    await sharedPage.waitForSelector(
      'header, .header-bar, table, [role="table"], .v-info, .empty-state',
      {
        timeout: 20000,
      },
    );

    // Verificar que não há mensagem de erro
    const bodyText = (await sharedPage.textContent("body")) || "";
    expect(bodyText.toLowerCase()).not.toContain("forbidden");
    expect(bodyText.toLowerCase()).not.toContain("no permission");

    // Screenshot para debug
    await sharedPage.screenshot({
      path: "tests/e2e/screenshots/push-subscription-collection.png",
      fullPage: true,
    });
  });

  test("deve listar as coleções customizadas criadas pelo hook", async () => {
    // Verificar via API que as coleções existem (podem estar hidden na navegação)
    const apiContext = sharedPage.context().request;

    // Login para obter token
    const loginResponse = await apiContext.post("/auth/login", {
      data: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      },
    });

    const loginData = await loginResponse.json();
    const accessToken = loginData.data?.access_token;

    expect(accessToken).toBeTruthy();

    // Buscar coleções via API
    const collectionsResponse = await apiContext.get("/collections", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(collectionsResponse.ok()).toBeTruthy();

    const collectionsData = await collectionsResponse.json();
    const collections = collectionsData.data || [];
    const collectionNames = collections.map(
      (c: { collection: string }) => c.collection,
    );

    // Verificar se as coleções de push notification existem
    const expectedCollections = [
      "push_subscription",
      "user_notification",
      "push_delivery",
    ];
    const foundCollections = expectedCollections.filter((name) =>
      collectionNames.includes(name),
    );

    // Pelo menos push_subscription deve existir
    expect(foundCollections).toContain("push_subscription");

    // Screenshot da navegação para debug
    await sharedPage.goto("/admin", { waitUntil: "networkidle" });
    await sharedPage.screenshot({
      path: "tests/e2e/screenshots/navigation-with-push.png",
      fullPage: false,
    });
  });

  test("deve exibir os campos corretos no formulário de push_subscription", async () => {
    // Navegar diretamente para o formulário de criação
    await sharedPage.goto("/admin/content/push_subscription/+", {
      waitUntil: "networkidle",
    });
    await sharedPage.waitForTimeout(2000);

    // Verificar que estamos no formulário de criação
    expect(sharedPage.url()).toContain("/push_subscription/+");

    // Tirar screenshot do formulário
    await sharedPage.screenshot({
      path: "tests/e2e/screenshots/push-subscription-form.png",
      fullPage: true,
    });

    // Verificar presença dos campos esperados via API (mais confiável que HTML scraping)
    const loginResponse = await sharedPage
      .context()
      .request.post("/auth/login", {
        data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });
    const loginData = await loginResponse.json();
    const accessToken = loginData.data?.access_token;

    const fieldsResponse = await sharedPage
      .context()
      .request.get("/fields/push_subscription", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    expect(fieldsResponse.ok()).toBeTruthy();
    const fieldsData = await fieldsResponse.json();
    const fieldNames = fieldsData.data.map((f: { field: string }) => f.field);

    // Todos os campos obrigatórios devem existir
    const requiredFields = ["id", "endpoint", "keys", "user", "is_active"];
    for (const field of requiredFields) {
      expect(fieldNames, `Campo '${field}' não encontrado`).toContain(field);
    }

    // Verificar que não há erro de relacionamento na UI
    const bodyText = (await sharedPage.textContent("body")) || "";
    expect(bodyText).not.toContain(
      "The relationship hasn't been configured correctly",
    );
  });

  test("deve verificar que os endpoints de push notification estão registrados", async () => {
    // Este teste verifica indiretamente através da API
    // Fazer uma requisição para verificar se o endpoint existe

    // Primeiro, precisamos obter o access token
    const response = await sharedPage.context().request.post("/auth/login", {
      data: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      },
    });

    const loginData = await response.json();
    const accessToken = loginData.data?.access_token;

    expect(accessToken).toBeTruthy();

    // Verificar se o endpoint /push-notification/register existe
    // POST sem dados válidos deve retornar 400 (bad request) ou similar, não 404
    const endpointResponse = await sharedPage
      .context()
      .request.post("/push-notification/register", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        data: {},
        failOnStatusCode: false,
      });

    // O endpoint existe se não retornar 404 (esperamos 400 por falta de dados)
    expect(endpointResponse.status()).not.toBe(404);

    // Verificar endpoint do Service Worker
    const swResponse = await sharedPage
      .context()
      .request.get("/push-notification-sw/sw.js", {
        failOnStatusCode: false,
      });

    // O endpoint do Service Worker deve retornar 200
    expect(swResponse.status()).toBe(200);
  });

  test("deve criar um item de push_subscription via API", async () => {
    // Obter access token
    const response = await sharedPage.context().request.post("/auth/login", {
      data: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      },
    });

    const loginData = await response.json();
    const accessToken = loginData.data?.access_token;

    // Buscar o user do admin
    const userResponse = await sharedPage.context().request.get("/users/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const userData = await userResponse.json();
    const userId = userData.data?.id;

    // Criar um item de teste na nova estrutura
    const createResponse = await sharedPage
      .context()
      .request.post("/items/push_subscription", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        data: {
          user: userId,
          endpoint: `https://fcm.googleapis.com/fcm/send/test-endpoint-${Date.now()}`,
          keys: {
            p256dh: "test-p256dh-key",
            auth: "test-auth-key",
          },
          is_active: true,
        },
      });

    expect(createResponse.ok()).toBeTruthy();

    const createdItem = await createResponse.json();
    expect(createdItem.data).toBeDefined();
    expect(createdItem.data.endpoint).toContain("fcm.googleapis.com");

    // Screenshot após criação
    await sharedPage.goto("/admin/content/push_subscription", {
      waitUntil: "networkidle",
    });
    await sharedPage.waitForTimeout(2000);
    await sharedPage.screenshot({
      path: "tests/e2e/screenshots/push-subscription-with-item.png",
      fullPage: true,
    });
  });

  test("deve verificar que o item criado aparece na listagem via API", async () => {
    // Verificar via API que o item criado existe (mais confiável que UI scraping)
    const loginResponse = await sharedPage
      .context()
      .request.post("/auth/login", {
        data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });
    const loginData = await loginResponse.json();
    const accessToken = loginData.data?.access_token;

    const response = await sharedPage
      .context()
      .request.get(
        "/items/push_subscription?filter[endpoint][_contains]=fcm.googleapis.com",
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    // Deve haver pelo menos um item com o endpoint criado no teste anterior
    expect(
      data.data.length,
      "Nenhum item com endpoint fcm.googleapis.com encontrado",
    ).toBeGreaterThan(0);
    expect(data.data[0].endpoint).toContain("fcm.googleapis.com");

    // Navegar para a listagem e tirar screenshot
    await sharedPage.goto("/admin/content/push_subscription", {
      waitUntil: "networkidle",
    });
    await sharedPage.waitForTimeout(2000);
    await sharedPage.screenshot({
      path: "tests/e2e/screenshots/push-subscription-final.png",
      fullPage: true,
    });
  });
});
