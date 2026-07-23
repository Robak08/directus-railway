import { dockerHttpRequest } from "../../setup.js";

/**
 * Chaves ECDH P-256 válidas geradas com crypto.createECDH('prime256v1')
 * p256dh: 87 chars base64url (65 bytes), auth: 22 chars base64url (16 bytes)
 */
/**
 * Endpoint base do mock push server no Directus
 */
export const MOCK_PUSH_SERVER = "http://directus:8055/mock-push-server";

export const VALID_TEST_KEYS = {
  p256dh:
    "BCXZvHuwJej4huSYgvSx1F2S3DNCAeGHkByzT9qI4IqZ2zDj6wh-DZCia2SmyqgZPB7QgJ3rmAjjqKAR721doLo",
  auth: "HfueLUKHqJ1L7hpL6itXSw",
};

export interface PushSubscription {
  id: string;
  user: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  user_agent?: string;
  device_name?: string;
  is_active: boolean;
  date_created: string;
  date_last_used?: string;
  date_expires?: string;
}

export interface NotificationTranslation {
  languages_code: string;
  title: string;
  body: string;
}

export interface UserNotification {
  id: string;
  title: string;
  body: string;
  user: string;
  channel: "push" | "email" | "sms" | "in_app";
  priority: "low" | "normal" | "high" | "urgent";
  action_url?: string;
  icon?: string; // M2O → directus_files (file ID)
  icon_url?: string;
  data?: Record<string, unknown>;
  translations?: NotificationTranslation[];
  broadcast?: string;
  date_created: string;
}

export interface PushDelivery {
  id: string;
  notification: string;
  subscription: string;
  status:
    | "queued"
    | "sending"
    | "sent"
    | "delivered"
    | "read"
    | "failed"
    | "expired";
  attempt_count: number;
  max_attempts: number;
  date_queued: string;
  date_sent?: string;
  date_delivered?: string;
  date_read?: string;
  date_failed?: string;
  error_code?: string;
  error_message?: string;
  date_retry?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Cria uma push subscription para testes
 */
export async function createPushSubscription(
  userId: string,
  options: Partial<PushSubscription> = {},
  testSuiteId?: string,
): Promise<PushSubscription> {
  const response = await dockerHttpRequest(
    "POST",
    "/items/push_subscription",
    {
      user: userId,
      endpoint:
        options.endpoint ||
        `https://fcm.googleapis.com/fcm/send/test-${Date.now()}`,
      keys: options.keys || VALID_TEST_KEYS,
      user_agent: options.user_agent || "Test User Agent",
      device_name: options.device_name || null,
      is_active: options.is_active !== undefined ? options.is_active : true,
    },
    {
      Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
    },
    testSuiteId,
  );

  return response.data as PushSubscription;
}

/**
 * Cria uma user notification para testes
 */
export async function createUserNotification(
  data: Partial<UserNotification> & { user: string },
  testSuiteId?: string,
): Promise<UserNotification> {
  const payload: Record<string, unknown> = {
    title: data.title || "Test Notification",
    body: data.body || "Test notification body",
    user: data.user,
    channel: data.channel || "push",
    priority: data.priority || "normal",
    action_url: data.action_url || null,
    icon_url: data.icon_url || null,
    data: data.data || null,
  };

  if (data.translations && data.translations.length > 0) {
    payload.translations = data.translations.map((t) => ({
      languages_code: t.languages_code,
      title: t.title,
      body: t.body,
    }));
  }

  const response = await dockerHttpRequest(
    "POST",
    "/items/user_notification",
    payload,
    {
      Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
    },
    testSuiteId,
  );

  return response.data as UserNotification;
}

/**
 * Busca push deliveries por notification ID
 */
export async function getPushDeliveries(
  notificationId: string,
  testSuiteId?: string,
): Promise<PushDelivery[]> {
  const response = await dockerHttpRequest(
    "GET",
    `/items/push_delivery?filter[notification][_eq]=${notificationId}`,
    undefined,
    {
      Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
    },
    testSuiteId,
  );

  return (response.data as PushDelivery[]) || [];
}

/**
 * Busca um push delivery específico
 */
export async function getPushDelivery(
  notificationId: string,
  subscriptionId: string,
  testSuiteId?: string,
): Promise<PushDelivery | null> {
  const response = await dockerHttpRequest(
    "GET",
    `/items/push_delivery?filter[notification][_eq]=${notificationId}&filter[subscription][_eq]=${subscriptionId}`,
    undefined,
    {
      Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
    },
    testSuiteId,
  );

  const data = response.data as PushDelivery[] | undefined;
  return data?.[0] || null;
}

/**
 * Atualiza um push delivery
 */
export async function updatePushDelivery(
  deliveryId: string,
  data: Partial<PushDelivery>,
  testSuiteId?: string,
): Promise<PushDelivery> {
  const response = await dockerHttpRequest(
    "PATCH",
    `/items/push_delivery/${deliveryId}`,
    data,
    {
      Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
    },
    testSuiteId,
  );

  return response.data as PushDelivery;
}

/**
 * Busca uma subscription por ID
 */
export async function getPushSubscription(
  subscriptionId: string,
  testSuiteId?: string,
): Promise<PushSubscription> {
  const response = await dockerHttpRequest(
    "GET",
    `/items/push_subscription/${subscriptionId}`,
    undefined,
    {
      Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
    },
    testSuiteId,
  );

  return response.data as PushSubscription;
}

/**
 * Atualiza campo push_enabled do usuário
 */
export async function updateUserPushEnabled(
  userId: string,
  enabled: boolean,
  testSuiteId?: string,
): Promise<void> {
  await dockerHttpRequest(
    "PATCH",
    `/users/${userId}`,
    {
      push_enabled: enabled,
    },
    {
      Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
    },
    testSuiteId,
  );
}

/**
 * Cria um registro de idioma na tabela languages
 */
export async function createLanguage(
  code: string,
  name: string,
  testSuiteId?: string,
): Promise<void> {
  await dockerHttpRequest(
    "POST",
    "/items/languages",
    {
      code,
      name,
      direction: "ltr",
    },
    {
      Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
    },
    testSuiteId,
  );
}

/**
 * Atualiza o idioma do usuário
 */
export async function updateUserLanguage(
  userId: string,
  language: string | null,
  testSuiteId?: string,
): Promise<void> {
  await dockerHttpRequest(
    "PATCH",
    `/users/${userId}`,
    {
      language,
    },
    {
      Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
    },
    testSuiteId,
  );
}

/**
 * Busca traduções de uma notificação
 */
export async function getNotificationTranslations(
  notificationId: string,
  testSuiteId?: string,
): Promise<NotificationTranslation[]> {
  const response = await dockerHttpRequest(
    "GET",
    `/items/user_notification_translations?filter[user_notification_id][_eq]=${notificationId}&fields=languages_code,title,body`,
    undefined,
    {
      Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
    },
    testSuiteId,
  );

  return (response.data as NotificationTranslation[]) || [];
}

/**
 * Aguarda um período de tempo (para hooks processarem)
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Desativa todas as subscriptions ativas de um usuário.
 * Útil para evitar acúmulo de subscriptions entre testes.
 */
export async function deactivateAllSubscriptions(
  userId: string,
  testSuiteId?: string,
): Promise<void> {
  const response = await dockerHttpRequest(
    "GET",
    `/items/push_subscription?filter[user][_eq]=${userId}&filter[is_active][_eq]=true&limit=-1`,
    undefined,
    {
      Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
    },
    testSuiteId,
  );

  const subs = (response.data as Array<{ id: string }>) || [];

  for (const sub of subs) {
    await dockerHttpRequest(
      "PATCH",
      `/items/push_subscription/${sub.id}`,
      { is_active: false },
      {
        Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
      },
      testSuiteId,
    );
  }
}

/**
 * Busca o user ID do admin
 */
export async function getAdminUserId(testSuiteId?: string): Promise<string> {
  const response = await dockerHttpRequest(
    "GET",
    "/users/me",
    undefined,
    {
      Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
    },
    testSuiteId,
  );

  const data = response.data as { id: string };
  return data.id;
}

export interface NotificationBroadcast {
  id: string;
  title: string;
  body: string;
  target_type: "all" | "roles" | "users" | "filter";
  channel: "push" | "email" | "sms" | "in_app";
  priority: "low" | "normal" | "high" | "urgent";
  status: "draft" | "processing" | "completed" | "failed";
  total_users?: number;
  total_created?: number;
  total_failed?: number;
  date_processed?: string;
}

/**
 * Cria um notification_broadcast para testes
 */
export async function createNotificationBroadcast(
  data: Record<string, unknown>,
  testSuiteId?: string,
): Promise<NotificationBroadcast> {
  const response = await dockerHttpRequest(
    "POST",
    "/items/notification_broadcast",
    data,
    {
      Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
    },
    testSuiteId,
  );

  return response.data as NotificationBroadcast;
}

/**
 * Busca um broadcast por ID
 */
export async function getBroadcastById(
  broadcastId: string,
  testSuiteId?: string,
): Promise<NotificationBroadcast> {
  const response = await dockerHttpRequest(
    "GET",
    `/items/notification_broadcast/${broadcastId}`,
    undefined,
    {
      Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
    },
    testSuiteId,
  );

  return response.data as NotificationBroadcast;
}

/**
 * Busca user_notifications geradas por um broadcast
 */
export async function getBroadcastNotifications(
  broadcastId: string,
  testSuiteId?: string,
): Promise<UserNotification[]> {
  const response = await dockerHttpRequest(
    "GET",
    `/items/user_notification?filter[broadcast][_eq]=${broadcastId}&fields=id,title,body,user,channel,broadcast`,
    undefined,
    {
      Authorization: `Bearer ${String(process.env.DIRECTUS_ACCESS_TOKEN)}`,
    },
    testSuiteId,
  );

  return (response.data as UserNotification[]) || [];
}
