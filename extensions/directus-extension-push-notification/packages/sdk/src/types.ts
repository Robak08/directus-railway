/**
 * Push Notification SDK — Type Definitions
 *
 * Tipos canônicos para integração com directus-extension-push-notification.
 * Zero dependencies.
 */

// ─── Subscription ────────────────────────────────────────────────────────────

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
  user: string;
  endpoint: string;
  keys: PushSubscriptionKeys;
  user_agent?: string;
  device_name?: string;
  is_active: boolean;
  date_created?: string;
  date_last_used?: string;
  date_expires?: string;
  topics?: string[];
}

// ─── Notification ────────────────────────────────────────────────────────────

export type NotificationChannel = "push" | "email" | "sms" | "in_app";
export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export interface NotificationTranslation {
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
  user: string;
  channel: NotificationChannel;
  priority: NotificationPriority;
  action_url?: string;
  icon?: string;
  icon_url?: string;
  data?: Record<string, unknown>;
  translations?: NotificationTranslation[];
  broadcast?: string;
  user_created?: string;
  date_created?: string;
  date_expires?: string;
}

// ─── Broadcast ─────────────────────────────────────────────────────────────

export type BroadcastStatus = "draft" | "processing" | "completed" | "failed";
export type BroadcastTargetType = "all" | "roles" | "users" | "filter";

export interface BroadcastTranslation {
  languages_code: string;
  title: string;
  body: string;
}

export interface NotificationBroadcast {
  id: string;
  title: string;
  body: string;
  target_type: BroadcastTargetType;
  target_roles?: Array<{ directus_roles_id: string } | string>;
  target_users?: Array<{ directus_users_id: string } | string>;
  target_filter?: Record<string, unknown>;
  channel: NotificationChannel;
  priority: NotificationPriority;
  icon?: string;
  icon_url?: string;
  action_url?: string;
  data?: Record<string, unknown>;
  status: BroadcastStatus;
  total_users?: number;
  total_created?: number;
  total_failed?: number;
  date_created?: string;
  date_processed?: string;
  date_expires?: string;
  translations?: BroadcastTranslation[];
}

export interface CreateBroadcastRequest {
  title: string;
  body: string;
  target_type: BroadcastTargetType;
  target_roles?: Array<{ directus_roles_id: string } | string>;
  target_users?: Array<{ directus_users_id: string } | string>;
  target_filter?: Record<string, unknown>;
  channel?: NotificationChannel;
  priority?: NotificationPriority;
  icon?: string;
  icon_url?: string;
  action_url?: string;
  data?: Record<string, unknown>;
  status?: BroadcastStatus;
  date_expires?: string;
  translations?: BroadcastTranslation[];
}

// ─── Delivery ────────────────────────────────────────────────────────────────

export type DeliveryStatus =
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "expired";

export interface DeliveryMetadata {
  device?: string;
  endpoint_domain?: string;
  response_headers?: Record<string, string>;
  ttl?: number;
}

export interface PushDelivery {
  id: string;
  notification: string;
  subscription: string;
  status: DeliveryStatus;
  attempt_count: number;
  max_attempts: number;
  date_queued?: string;
  date_sent?: string;
  date_delivered?: string;
  date_read?: string;
  date_failed?: string;
  error_code?: string;
  error_message?: string;
  date_retry?: string;
  metadata?: DeliveryMetadata;
}

// ─── Push Payload (Service Worker) ───────────────────────────────────────────

export interface PushPayload {
  title: string;
  body?: string;
  icon_url?: string;
  action_url?: string;
  priority?: NotificationPriority;
  notification_id: string;
  delivery_id: string;
  data?: Record<string, unknown>;
}

// ─── API Request / Response ──────────────────────────────────────────────────

export interface RegisterSubscriptionRequest {
  subscription: PushSubscriptionData;
  device_name?: string;
}

export interface RegisterSubscriptionResponse {
  success: boolean;
  subscription_id?: string;
  error?: string;
}

export interface UnregisterSubscriptionRequest {
  endpoint: string;
}

export interface UnregisterSubscriptionResponse {
  success: boolean;
  error?: string;
}

export interface SendNotificationRequest {
  user: string;
  title: string;
  body: string;
  channel?: NotificationChannel;
  priority?: NotificationPriority;
  action_url?: string;
  icon?: string;
  icon_url?: string;
  data?: Record<string, unknown>;
  translations?: Array<{
    languages_code: string;
    title: string;
    body: string;
  }>;
  dry_run?: boolean;
  ttl?: number;
}

export interface SendNotificationResponse {
  success: boolean;
  notification_id?: string;
  deliveries_created?: number;
  dry_run?: boolean;
  error?: string;
}

export interface CreateBroadcastResponse {
  data: NotificationBroadcast;
}

// ─── Client Config ───────────────────────────────────────────────────────────

export interface PushNotificationClientConfig {
  /** Base URL of the Directus instance (e.g. "https://directus.example.com") */
  baseUrl: string;
  /** Static token or access token for authentication */
  token?: string;
  /** Custom fetch implementation (defaults to globalThis.fetch) */
  fetch?: typeof globalThis.fetch;
}

// ─── Subscribe Config ────────────────────────────────────────────────────────

export interface SubscribeOptions {
  /** VAPID public key (base64url-encoded) */
  vapidPublicKey: string;
  /** Base URL of the Directus instance */
  baseUrl: string;
  /** Optional device name override */
  deviceName?: string;
  /** Custom fetch for register call (defaults to globalThis.fetch) */
  fetch?: typeof globalThis.fetch;
  /** Service Worker registration path (defaults to "/push-notification-sw/sw.js") */
  swPath?: string;
  /** Service Worker scope (defaults to "/") */
  swScope?: string;
}

export interface SubscribeResult {
  success: boolean;
  subscription?: globalThis.PushSubscription;
  error?: string;
}

// ─── Translation Resolution ─────────────────────────────────────────────────

export interface TranslationSource {
  title: string;
  body: string;
  translations?: Array<{
    languages_code: string;
    title: string;
    body: string;
  }>;
  user_language?: string | null;
  fallback_language?: string;
}

export interface ResolvedTranslation {
  title: string;
  body: string;
}
