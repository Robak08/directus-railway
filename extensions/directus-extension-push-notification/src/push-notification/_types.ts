/**
 * Tipos TypeScript para Push Notification Extension
 * Inspirado na estrutura do Firebase Messaging (nerkarso/directus-extensions)
 */

// === Subscription Types ===

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

export interface PushSubscription {
  id: string;
  user: string; // Renamed from user_id (M2O relation)
  endpoint: string;
  keys: PushSubscriptionKeys;
  user_agent?: string;
  device_name?: string;
  is_active: boolean;
  date_created?: string; // Renamed from created_at
  date_last_used?: string; // Renamed from last_used_at
  date_expires?: string; // Renamed from expires_at
  topics?: string[]; // Para broadcast futuro
}

// === Notification Types ===

export type NotificationChannel = "push" | "email" | "sms" | "in_app";
export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export interface UserNotificationTranslation {
  id?: string;
  user_notification_id?: string;
  languages_code: string;
  title: string;
  body: string;
}

export interface UserNotification {
  id: string;
  title: string;
  body: string;
  user: string; // Renamed from user_id (M2O relation)
  channel: NotificationChannel;
  priority: NotificationPriority;
  action_url?: string;
  icon?: string; // M2O → directus_files (file ID, resolved to /assets/{id})
  icon_url?: string; // URL externa alternativa
  data?: Record<string, unknown>;
  translations?: UserNotificationTranslation[];
  user_created?: string; // Renamed from created_by
  date_created?: string; // Renamed from created_at
  date_expires?: string; // Renamed from expires_at
}

// === Delivery Types ===

export type DeliveryStatus =
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "expired";

export interface PushDelivery {
  id: string;
  notification: string; // Renamed from user_notification_id (M2O relation)
  subscription: string; // Renamed from push_subscription_id (M2O relation)
  status: DeliveryStatus;
  attempt_count: number;
  max_attempts: number;
  date_queued?: string; // Renamed from queued_at
  date_sent?: string; // Renamed from sent_at
  date_delivered?: string; // Renamed from delivered_at
  date_read?: string; // Renamed from read_at
  date_failed?: string; // Renamed from failed_at
  error_code?: string;
  error_message?: string;
  date_retry?: string; // Renamed from retry_after
  metadata?: DeliveryMetadata;
}

export interface DeliveryMetadata {
  device?: string;
  endpoint_domain?: string;
  response_headers?: Record<string, string>;
  ttl?: number;
}

// === API Request/Response Types ===

export interface RegisterSubscriptionRequest {
  subscription: PushSubscriptionData;
  device_name?: string;
}

export interface SendNotificationRequest {
  user: string; // Renamed from user_id (M2O relation)
  title: string;
  body: string;
  channel?: NotificationChannel;
  priority?: NotificationPriority;
  action_url?: string;
  icon?: string; // M2O → directus_files (file ID)
  icon_url?: string; // URL externa alternativa
  data?: Record<string, unknown>;
  dry_run?: boolean; // Inspirado no Firebase Messaging - simula sem enviar
  ttl?: number; // Time to live em segundos
}

export interface SendNotificationResponse {
  success: boolean;
  notification_id?: string;
  deliveries_created?: number;
  dry_run?: boolean;
  error?: string;
}

// === Push Payload Types (Service Worker) ===

export interface PushPayload {
  title: string;
  body?: string;
  icon_url?: string;
  action_url?: string;
  priority?: NotificationPriority;
  user_notification_id: string;
  push_delivery_id: string;
  data?: Record<string, unknown>;
}

// === Options Types (inspirado no Firebase Messaging) ===

export type SendTarget = "user" | "device" | "topic" | "broadcast";

export interface SendOptions {
  target: SendTarget;
  dry_run?: boolean;
  // Para target = 'user' (nosso padrão)
  user_id?: string;
  // Para target = 'device' (envio direto)
  subscription_id?: string;
  // Para target = 'topic' (futuro)
  topic?: string;
  // Para target = 'broadcast' (futuro)
  condition?: string;
}

// === Utility Types ===

/**
 * Remove propriedades undefined/null de um objeto
 * Inspirado no padrão do Firebase Messaging
 */
export function cleanPayload<T extends Record<string, unknown>>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Verifica se um erro de push indica subscription expirada
 */
export function isSubscriptionExpired(error: { statusCode?: number }): boolean {
  return error.statusCode === 410; // Gone
}

/**
 * Verifica se um erro é recuperável (deve fazer retry)
 */
export function isRetryableError(error: { statusCode?: number }): boolean {
  const nonRetryableCodes = [400, 401, 403, 404, 410];
  return !nonRetryableCodes.includes(error.statusCode || 0);
}
