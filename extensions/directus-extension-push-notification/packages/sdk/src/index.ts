/**
 * Push Notification SDK
 *
 * @packageDocumentation
 *
 * @example
 * ```ts
 * // Import everything
 * import { PushNotificationClient, resolveTranslation } from "@anthropic/push-notification-sdk";
 *
 * // Or import specific modules
 * import type { UserNotification } from "@anthropic/push-notification-sdk/types";
 * import { PushNotificationClient } from "@anthropic/push-notification-sdk/client";
 * import { subscribe } from "@anthropic/push-notification-sdk/subscribe";
 * ```
 */

// Types
export type {
  PushSubscriptionKeys,
  PushSubscriptionData,
  PushSubscription,
  NotificationChannel,
  NotificationPriority,
  NotificationTranslation,
  UserNotification,
  BroadcastStatus,
  BroadcastTargetType,
  BroadcastTranslation,
  NotificationBroadcast,
  CreateBroadcastRequest,
  CreateBroadcastResponse,
  DeliveryStatus,
  DeliveryMetadata,
  PushDelivery,
  PushPayload,
  RegisterSubscriptionRequest,
  RegisterSubscriptionResponse,
  UnregisterSubscriptionRequest,
  UnregisterSubscriptionResponse,
  SendNotificationRequest,
  SendNotificationResponse,
  PushNotificationClientConfig,
  SubscribeOptions,
  SubscribeResult,
  TranslationSource,
  ResolvedTranslation,
} from "./types.js";

// Client
export { PushNotificationClient, PushNotificationSDKError } from "./client.js";

// Subscribe helpers
export {
  subscribe,
  unsubscribe,
  isPushSupported,
  detectDeviceName,
  vapidKeyToUint8Array,
} from "./subscribe.js";

// Translation
export {
  resolveTranslation,
  DEFAULT_FALLBACK_LANGUAGE,
} from "./translation.js";
