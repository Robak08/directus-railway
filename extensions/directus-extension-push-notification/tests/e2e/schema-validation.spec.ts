import { test, expect, Browser, BrowserContext, Page } from "@playwright/test";
import { DirectusE2EHelper } from "./helpers/DirectusE2EHelper.js";
import fs from "fs";

/**
 * Testes E2E de validação do schema e relacionamentos.
 *
 * Verifica via Directus Admin UI e API que todas as collections,
 * campos e relações foram criadas corretamente pelo db-configuration hook.
 *
 * Garante que a interface do Directus exiba os campos de relacionamento
 * sem erros como "The relationship hasn't been configured correctly".
 */

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "test-password-not-a-leak";

const storageFile = `${process.cwd()}/tests/e2e/auth-storage.json`;

let sharedContext: BrowserContext;
let sharedPage: Page;
let directusHelper: DirectusE2EHelper;

// Helper types
interface DirectusField {
  field: string;
  type: string;
  schema: {
    data_type: string;
    is_primary_key: boolean;
    has_auto_increment: boolean;
    foreign_key_table: string | null;
    foreign_key_column: string | null;
  } | null;
  meta: {
    special: string[] | null;
    interface: string | null;
  } | null;
}

interface DirectusRelation {
  collection: string;
  field: string;
  related_collection: string;
  meta: {
    many_collection: string;
    many_field: string;
    one_collection: string;
    one_field: string | null;
    junction_field: string | null;
  } | null;
  schema: {
    column: string;
    foreign_key_table: string;
    foreign_key_column: string;
  } | null;
}

// Rodar os testes em série para evitar conflitos de sessão
test.describe.configure({ mode: "serial" });

test.describe("Schema Validation - Collections, Fields e Relations (E2E)", () => {
  test.beforeAll(
    async ({
      browser,
      baseURL,
    }: {
      browser: Browser;
      baseURL: string | undefined;
    }) => {
      test.setTimeout(180000);

      sharedContext = await browser.newContext({ baseURL });
      sharedPage = await sharedContext.newPage();

      directusHelper = new DirectusE2EHelper(
        sharedPage,
        baseURL || "http://localhost:8055",
      );

      await directusHelper.login(ADMIN_EMAIL, ADMIN_PASSWORD);

      await sharedPage.waitForSelector(
        '#navigation, aside[role="navigation"], [data-test-id="navigation"]',
        { timeout: 120000 },
      );
    },
  );

  test.afterAll(async () => {
    if (sharedContext) {
      await sharedContext.close();
    }

    if (fs.existsSync(storageFile)) {
      try {
        fs.unlinkSync(storageFile);
      } catch {
        // ignore
      }
    }
  });

  // ─── Helpers API ────────────────────────────────────────────────

  async function apiGet(path: string) {
    const response = await sharedPage.request.get(path);
    expect(response.ok(), `GET ${path} falhou: ${response.status()}`).toBe(
      true,
    );
    return response.json();
  }

  async function getFields(collection: string): Promise<DirectusField[]> {
    const result = await apiGet(`/fields/${collection}`);
    return result.data;
  }

  async function getRelations(collection: string): Promise<DirectusRelation[]> {
    const result = await apiGet(`/relations/${collection}`);
    return result.data;
  }

  function findField(fields: DirectusField[], name: string): DirectusField {
    const field = fields.find((f) => f.field === name);
    expect(field, `Campo '${name}' não encontrado na collection`).toBeDefined();
    return field!;
  }

  function findRelation(
    relations: DirectusRelation[],
    fieldName: string,
  ): DirectusRelation {
    const relation = relations.find((r) => r.field === fieldName);
    expect(
      relation,
      `Relação para campo '${fieldName}' não encontrada`,
    ).toBeDefined();
    return relation!;
  }

  // ─── Login & Dashboard ─────────────────────────────────────────

  test("deve estar autenticado no dashboard", async () => {
    expect(sharedPage.url()).toContain("/admin");
    const nav = sharedPage
      .locator(
        '#navigation, aside[role="navigation"], [data-test-id="navigation"]',
      )
      .first();
    await expect(nav).toBeVisible({ timeout: 5000 });
    await directusHelper.screenshot("schema-validation-dashboard");
  });

  // ─── Collections existem ───────────────────────────────────────

  test("todas as collections devem existir", async () => {
    const result = await apiGet("/collections");
    const collections = result.data as Array<{ collection: string }>;
    const names = collections.map((c) => c.collection);

    expect(names).toContain("push_subscription");
    expect(names).toContain("user_notification");
    expect(names).toContain("push_delivery");
    expect(names).toContain("user_notification_translations");
    expect(names).toContain("notification_broadcast");
    expect(names).toContain("notification_broadcast_translations");
  });

  // ─── Campo push_enabled em directus_users ──────────────────────

  test("directus_users deve ter campo push_enabled do tipo boolean", async () => {
    const result = await apiGet("/fields/directus_users/push_enabled");
    const field = result.data;

    expect(field.field).toBe("push_enabled");
    expect(field.type).toBe("boolean");
  });

  // ─── IDs são UUID ──────────────────────────────────────────────

  test("todos os IDs devem ser UUID (não integer)", async () => {
    const collections = [
      "push_subscription",
      "user_notification",
      "push_delivery",
      "user_notification_translations",
    ];

    for (const collection of collections) {
      const fields = await getFields(collection);
      const idField = findField(fields, "id");

      expect(idField.type, `${collection}.id type`).toBe("uuid");
      expect(idField.meta?.special, `${collection}.id special`).toContain(
        "uuid",
      );
      expect(
        idField.schema?.has_auto_increment,
        `${collection}.id has_auto_increment`,
      ).toBe(false);
    }
  });

  // ─── push_subscription: relacionamentos via API ────────────────

  test("push_subscription.user deve ser M2O para directus_users", async () => {
    const fields = await getFields("push_subscription");
    const relations = await getRelations("push_subscription");

    const userField = findField(fields, "user");
    expect(userField.meta?.special).toContain("m2o");
    expect(userField.meta?.interface).toBe("select-dropdown-m2o");
    expect(userField.schema?.foreign_key_table).toBe("directus_users");
    expect(userField.schema?.foreign_key_column).toBe("id");

    const userRelation = findRelation(relations, "user");
    expect(userRelation.related_collection).toBe("directus_users");
    expect(userRelation.meta?.many_collection).toBe("push_subscription");
    expect(userRelation.meta?.many_field).toBe("user");
    expect(userRelation.meta?.one_collection).toBe("directus_users");
  });

  test("push_subscription.deliveries deve ser O2M alias para push_delivery", async () => {
    const fields = await getFields("push_subscription");
    const deliveriesField = findField(fields, "deliveries");

    expect(deliveriesField.type).toBe("alias");
    expect(deliveriesField.schema).toBeNull();
    expect(deliveriesField.meta?.special).toContain("o2m");
    expect(deliveriesField.meta?.interface).toBe("list-o2m");
  });

  // ─── user_notification: relacionamentos via API ────────────────

  test("user_notification.user deve ser M2O para directus_users", async () => {
    const fields = await getFields("user_notification");
    const relations = await getRelations("user_notification");

    const userField = findField(fields, "user");
    expect(userField.meta?.special).toContain("m2o");
    expect(userField.meta?.interface).toBe("select-dropdown-m2o");
    expect(userField.schema?.foreign_key_table).toBe("directus_users");
    expect(userField.schema?.foreign_key_column).toBe("id");

    const userRelation = findRelation(relations, "user");
    expect(userRelation.related_collection).toBe("directus_users");
    expect(userRelation.meta?.many_collection).toBe("user_notification");
    expect(userRelation.meta?.many_field).toBe("user");
    expect(userRelation.meta?.one_collection).toBe("directus_users");
  });

  test("user_notification.user_created deve ser M2O user-created", async () => {
    const fields = await getFields("user_notification");
    const relations = await getRelations("user_notification");

    const field = findField(fields, "user_created");
    expect(field.meta?.special).toContain("user-created");
    expect(field.meta?.interface).toBe("select-dropdown-m2o");
    expect(field.schema?.foreign_key_table).toBe("directus_users");
    expect(field.schema?.foreign_key_column).toBe("id");

    const relation = findRelation(relations, "user_created");
    expect(relation.related_collection).toBe("directus_users");
    expect(relation.meta?.one_collection).toBe("directus_users");
  });

  test("user_notification.icon deve ser M2O file para directus_files", async () => {
    const fields = await getFields("user_notification");
    const relations = await getRelations("user_notification");

    const iconField = findField(fields, "icon");
    expect(iconField.meta?.special).toContain("file");
    expect(iconField.meta?.interface).toBe("file-image");
    expect(iconField.schema?.foreign_key_table).toBe("directus_files");
    expect(iconField.schema?.foreign_key_column).toBe("id");

    const iconRelation = findRelation(relations, "icon");
    expect(iconRelation.related_collection).toBe("directus_files");
    expect(iconRelation.meta?.one_collection).toBe("directus_files");
  });

  test("user_notification.deliveries deve ser O2M alias para push_delivery", async () => {
    const fields = await getFields("user_notification");
    const deliveriesField = findField(fields, "deliveries");

    expect(deliveriesField.type).toBe("alias");
    expect(deliveriesField.schema).toBeNull();
    expect(deliveriesField.meta?.special).toContain("o2m");
    expect(deliveriesField.meta?.interface).toBe("list-o2m");
  });

  test("user_notification.translations deve ter interface translations", async () => {
    const fields = await getFields("user_notification");
    const translationsField = findField(fields, "translations");

    expect(translationsField.type).toBe("alias");
    expect(translationsField.schema).toBeNull();
    expect(translationsField.meta?.special).toContain("translations");
    expect(translationsField.meta?.interface).toBe("translations");
  });

  // ─── push_delivery: relacionamentos via API ────────────────────

  test("push_delivery.notification deve ser M2O para user_notification", async () => {
    const fields = await getFields("push_delivery");
    const relations = await getRelations("push_delivery");

    const field = findField(fields, "notification");
    expect(field.meta?.special).toContain("m2o");
    expect(field.meta?.interface).toBe("select-dropdown-m2o");
    expect(field.schema?.foreign_key_table).toBe("user_notification");
    expect(field.schema?.foreign_key_column).toBe("id");

    const relation = findRelation(relations, "notification");
    expect(relation.related_collection).toBe("user_notification");
    expect(relation.meta?.many_collection).toBe("push_delivery");
    expect(relation.meta?.many_field).toBe("notification");
    expect(relation.meta?.one_collection).toBe("user_notification");
    expect(relation.meta?.one_field).toBe("deliveries");
  });

  test("push_delivery.subscription deve ser M2O para push_subscription", async () => {
    const fields = await getFields("push_delivery");
    const relations = await getRelations("push_delivery");

    const field = findField(fields, "subscription");
    expect(field.meta?.special).toContain("m2o");
    expect(field.meta?.interface).toBe("select-dropdown-m2o");
    expect(field.schema?.foreign_key_table).toBe("push_subscription");
    expect(field.schema?.foreign_key_column).toBe("id");

    const relation = findRelation(relations, "subscription");
    expect(relation.related_collection).toBe("push_subscription");
    expect(relation.meta?.many_collection).toBe("push_delivery");
    expect(relation.meta?.many_field).toBe("subscription");
    expect(relation.meta?.one_collection).toBe("push_subscription");
    expect(relation.meta?.one_field).toBe("deliveries");
  });

  // ─── user_notification_translations: junction ──────────────────

  test("user_notification_translations.user_notification_id deve ser M2O junction", async () => {
    const fields = await getFields("user_notification_translations");
    const relations = await getRelations("user_notification_translations");

    const fkField = findField(fields, "user_notification_id");
    expect(fkField.schema?.foreign_key_table).toBe("user_notification");
    expect(fkField.schema?.foreign_key_column).toBe("id");

    const fkRelation = findRelation(relations, "user_notification_id");
    expect(fkRelation.related_collection).toBe("user_notification");
    expect(fkRelation.meta?.one_collection).toBe("user_notification");
    expect(fkRelation.meta?.one_field).toBe("translations");
    expect(fkRelation.meta?.junction_field).toBe("languages_code");
  });

  test("user_notification_translations.languages_code deve ser M2O junction para languages", async () => {
    const fields = await getFields("user_notification_translations");
    const relations = await getRelations("user_notification_translations");

    const langField = findField(fields, "languages_code");
    expect(langField.schema?.foreign_key_table).toBe("languages");
    expect(langField.schema?.foreign_key_column).toBe("code");

    const langRelation = findRelation(relations, "languages_code");
    expect(langRelation.related_collection).toBe("languages");
    expect(langRelation.meta?.one_collection).toBe("languages");
    expect(langRelation.meta?.junction_field).toBe("user_notification_id");
  });

  // ─── Consistência de tipos FK ──────────────────────────────────

  test("FKs pointing at UUID primary keys use uuid column type", async () => {
    const expectUuid = (fields: Awaited<ReturnType<typeof getFields>>, fieldName: string) => {
      expect(findField(fields, fieldName).schema?.data_type, fieldName).toBe("uuid");
    };

    const deliveryFields = await getFields("push_delivery");
    expectUuid(deliveryFields, "notification");
    expectUuid(deliveryFields, "subscription");

    const subFields = await getFields("push_subscription");
    expectUuid(subFields, "user");

    const notifFields = await getFields("user_notification");
    expectUuid(notifFields, "user");
    expectUuid(notifFields, "user_created");
    expectUuid(notifFields, "icon");
    expectUuid(notifFields, "broadcast");

    const transFields = await getFields("user_notification_translations");
    expectUuid(transFields, "user_notification_id");

    const broadcastFields = await getFields("notification_broadcast");
    expectUuid(broadcastFields, "user_created");
    expectUuid(broadcastFields, "icon");

    const broadcastTransFields = await getFields("notification_broadcast_translations");
    expectUuid(broadcastTransFields, "notification_broadcast_id");

    const broadcastRolesFields = await getFields("notification_broadcast_roles");
    expectUuid(broadcastRolesFields, "notification_broadcast_id");
    expectUuid(broadcastRolesFields, "directus_roles_id");

    const broadcastUsersFields = await getFields("notification_broadcast_users");
    expectUuid(broadcastUsersFields, "notification_broadcast_id");
    expectUuid(broadcastUsersFields, "directus_users_id");
  });

  // ─── UI: Verificar que campos de relacionamento não mostram erro ──

  test("push_subscription: formulário de criação não deve mostrar erro de relacionamento", async () => {
    await sharedPage.goto("/admin/content/push_subscription/+", {
      waitUntil: "networkidle",
    });
    await sharedPage.waitForTimeout(2000);

    const bodyText = (await sharedPage.textContent("body")) || "";

    // Verificar que NÃO aparece o erro de relacionamento
    expect(bodyText).not.toContain(
      "relationship hasn't been configured correctly",
    );
    expect(bodyText).not.toContain("relationship has not been configured");
    expect(bodyText.toLowerCase()).not.toContain("forbidden");

    // O campo "user" (M2O) deve estar visível com o dropdown
    const userFieldSection = sharedPage.locator(
      '.field[data-field="user"], [data-field="user"]',
    );
    const userFieldVisible = await userFieldSection
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    // Se o campo aparece, verificar que não tem aviso de erro
    if (userFieldVisible) {
      const userFieldText = (await userFieldSection.textContent()) || "";
      expect(userFieldText).not.toContain(
        "relationship hasn't been configured",
      );
    }

    await directusHelper.screenshot("push-subscription-create-form");
  });

  test("user_notification: formulário de criação não deve mostrar erro de relacionamento", async () => {
    await sharedPage.goto("/admin/content/user_notification/+", {
      waitUntil: "networkidle",
    });
    await sharedPage.waitForTimeout(2000);

    const bodyText = (await sharedPage.textContent("body")) || "";

    expect(bodyText).not.toContain(
      "relationship hasn't been configured correctly",
    );
    expect(bodyText).not.toContain("relationship has not been configured");
    expect(bodyText.toLowerCase()).not.toContain("forbidden");

    // Verificar campos M2O: user, icon
    for (const fieldName of ["user", "icon"]) {
      const fieldSection = sharedPage.locator(
        `.field[data-field="${fieldName}"], [data-field="${fieldName}"]`,
      );
      const visible = await fieldSection
        .isVisible({ timeout: 3000 })
        .catch(() => false);

      if (visible) {
        const fieldText = (await fieldSection.textContent()) || "";
        expect(fieldText).not.toContain("relationship hasn't been configured");
      }
    }

    await directusHelper.screenshot("user-notification-create-form");
  });

  test("push_delivery: formulário de criação não deve mostrar erro de relacionamento", async () => {
    await sharedPage.goto("/admin/content/push_delivery/+", {
      waitUntil: "networkidle",
    });
    await sharedPage.waitForTimeout(2000);

    const bodyText = (await sharedPage.textContent("body")) || "";

    expect(bodyText).not.toContain(
      "relationship hasn't been configured correctly",
    );
    expect(bodyText).not.toContain("relationship has not been configured");
    expect(bodyText.toLowerCase()).not.toContain("forbidden");

    // Verificar campos M2O: notification, subscription
    for (const fieldName of ["notification", "subscription"]) {
      const fieldSection = sharedPage.locator(
        `.field[data-field="${fieldName}"], [data-field="${fieldName}"]`,
      );
      const visible = await fieldSection
        .isVisible({ timeout: 3000 })
        .catch(() => false);

      if (visible) {
        const fieldText = (await fieldSection.textContent()) || "";
        expect(fieldText).not.toContain("relationship hasn't been configured");
      }
    }

    await directusHelper.screenshot("push-delivery-create-form");
  });

  // ─── Validação funcional: criar/ler com relações expandidas ────

  test("deve criar push_subscription com user M2O e ler com relação expandida", async () => {
    // Obter admin user id
    const meResult = await apiGet("/users/me?fields=id");
    const userId = meResult.data.id;

    // Criar subscription via API
    const createResponse = await sharedPage.request.post(
      "/items/push_subscription",
      {
        data: {
          user: userId,
          endpoint: `https://fcm.test/e2e-schema-validation-${Date.now()}`,
          keys: {
            p256dh:
              "BCXZvHuwJej4huSYgvSx1F2S3DNCAeGHkByzT9qI4IqZ2zDj6wh-DZCia2SmyqgZPB7QgJ3rmAjjqKAR721doLo",
            auth: "HfueLUKHqJ1L7hpL6itXSw",
          },
          device_name: "E2E Schema Validation Test",
          is_active: true,
        },
      },
    );
    expect(createResponse.ok()).toBe(true);

    const createResult = await createResponse.json();
    const subscription = createResult.data;

    // UUID format
    expect(subscription.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(subscription.user).toBe(userId);

    // Ler com relação expandida (prova que M2O funciona)
    const readResult = await apiGet(
      `/items/push_subscription/${subscription.id}?fields=id,user.id,user.email`,
    );
    expect(readResult.data.user).toBeDefined();
    expect(readResult.data.user.id).toBe(userId);
    expect(typeof readResult.data.user.email).toBe("string");
  });

  test("deve criar user_notification com user M2O e user_created auto-preenchido", async () => {
    const meResult = await apiGet("/users/me?fields=id");
    const userId = meResult.data.id;

    const createResponse = await sharedPage.request.post(
      "/items/user_notification",
      {
        data: {
          user: userId,
          title: "E2E Schema Test",
          body: "Validating relationships via Playwright",
          channel: "push",
          priority: "normal",
        },
      },
    );
    expect(createResponse.ok()).toBe(true);

    const createResult = await createResponse.json();
    const notification = createResult.data;

    // UUID format
    expect(notification.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(notification.user).toBe(userId);
    expect(notification.user_created).toBe(userId);

    // Expandir relações
    const readResult = await apiGet(
      `/items/user_notification/${notification.id}?fields=id,user.id,user.email,user_created.id,user_created.email`,
    );
    expect(readResult.data.user.id).toBe(userId);
    expect(readResult.data.user_created.id).toBe(userId);
  });

  // ─── notification_broadcast ─────────────────────────────────────

  test("notification_broadcast deve ter campos de targeting e status", async () => {
    const fields = await getFields("notification_broadcast");
    const fieldNames = fields.map((f) => f.field);

    expect(fieldNames).toContain("title");
    expect(fieldNames).toContain("body");
    expect(fieldNames).toContain("target_type");
    expect(fieldNames).toContain("target_roles");
    expect(fieldNames).toContain("target_users");
    expect(fieldNames).toContain("target_filter");
    expect(fieldNames).toContain("channel");
    expect(fieldNames).toContain("status");
    expect(fieldNames).toContain("total_users");
    expect(fieldNames).toContain("total_created");
    expect(fieldNames).toContain("notifications");
    expect(fieldNames).toContain("translations");
  });

  test("user_notification.broadcast deve ser M2O para notification_broadcast", async () => {
    const fields = await getFields("user_notification");
    const relations = await getRelations("user_notification");

    const broadcastField = findField(fields, "broadcast");
    expect(broadcastField.meta?.special).toContain("m2o");
    expect(broadcastField.schema?.foreign_key_table).toBe(
      "notification_broadcast",
    );

    const broadcastRelation = findRelation(relations, "broadcast");
    expect(broadcastRelation.related_collection).toBe("notification_broadcast");
    expect(broadcastRelation.meta?.one_field).toBe("notifications");
  });

  test("notification_broadcast_translations deve ser junction de traduções", async () => {
    const fields = await getFields("notification_broadcast_translations");
    const fieldNames = fields.map((f) => f.field);

    expect(fieldNames).toContain("notification_broadcast_id");
    expect(fieldNames).toContain("languages_code");
    expect(fieldNames).toContain("title");
    expect(fieldNames).toContain("body");
  });
});
