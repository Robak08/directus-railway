/**
 * Push Notification SDK — Browser Subscribe Helper
 *
 * Helpers tipados para registrar push subscription no browser.
 * Substitui o client-script.ts inline — pode ser importado por React, Vue, etc.
 *
 * Requer ambiente browser (Service Worker API, Push API, Notification API).
 */

import type {
  SubscribeOptions,
  SubscribeResult,
  PushSubscriptionData,
} from "./types.js";

/**
 * Convert a VAPID public key from base64url to Uint8Array.
 */
export function vapidKeyToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Detect a human-readable device name from the User-Agent.
 */
export function detectDeviceName(): string {
  if (typeof navigator === "undefined") return "Unknown Device";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS Device";
  if (/Android/.test(ua)) return "Android Device";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Linux/.test(ua)) return "Linux PC";
  return "Unknown Device";
}

/**
 * Check whether the current browser environment supports push notifications.
 */
export function isPushSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in globalThis &&
    "Notification" in globalThis
  );
}

/**
 * Subscribe the current browser for push notifications.
 *
 * Handles the full flow:
 * 1. Check browser support
 * 2. Register/retrieve Service Worker
 * 3. Request notification permission
 * 4. Create push subscription
 * 5. Send subscription to the Directus backend
 *
 * @example
 * ```ts
 * import { subscribe } from "@anthropic/push-notification-sdk/subscribe";
 *
 * const result = await subscribe({
 *   vapidPublicKey: "BEl62i...",
 *   baseUrl: "https://directus.example.com",
 * });
 *
 * if (result.success) {
 *   console.log("Subscribed!", result.subscription?.endpoint);
 * }
 * ```
 */
export async function subscribe(
  options: SubscribeOptions,
): Promise<SubscribeResult> {
  const {
    vapidPublicKey,
    baseUrl,
    deviceName,
    swPath = "/push-notification-sw/sw.js",
    swScope = "/",
  } = options;

  const fetchFn = options.fetch ?? globalThis.fetch;

  // 1. Check support
  if (!isPushSupported()) {
    return { success: false, error: "Push notifications not supported" };
  }

  // 2. Register Service Worker
  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register(swPath, {
      scope: swScope,
    });
    await navigator.serviceWorker.ready;
  } catch (err) {
    return {
      success: false,
      error: `Service Worker registration failed: ${(err as Error).message}`,
    };
  }

  // 3. Check / request permission
  if (Notification.permission === "denied") {
    return { success: false, error: "Notification permission denied" };
  }

  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { success: false, error: "Notification permission not granted" };
    }
  }

  // 4. Create or retrieve subscription
  let pushSubscription: globalThis.PushSubscription;
  try {
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      pushSubscription = existing;
    } else {
      pushSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKeyToUint8Array(
          vapidPublicKey,
        ) as BufferSource,
      });
    }
  } catch (err) {
    return {
      success: false,
      error: `Push subscription failed: ${(err as Error).message}`,
    };
  }

  // 5. Register on backend
  const subJson = pushSubscription.toJSON();
  const subscriptionData: PushSubscriptionData = {
    endpoint: pushSubscription.endpoint,
    keys: {
      p256dh: subJson.keys?.p256dh ?? "",
      auth: subJson.keys?.auth ?? "",
    },
  };

  const resolvedDeviceName = deviceName ?? detectDeviceName();
  const registerUrl = `${baseUrl.replace(/\/+$/, "")}/push-notification/register`;

  try {
    const response = await fetchFn(registerUrl, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: subscriptionData,
        device_name: resolvedDeviceName,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        subscription: pushSubscription,
        error: `Registration failed (${response.status}): ${errorText}`,
      };
    }
  } catch (err) {
    return {
      success: false,
      subscription: pushSubscription,
      error: `Registration request failed: ${(err as Error).message}`,
    };
  }

  return { success: true, subscription: pushSubscription };
}

/**
 * Unsubscribe from push notifications.
 *
 * Removes the browser subscription and notifies the backend.
 */
export async function unsubscribe(
  baseUrl: string,
  fetchFn?: typeof globalThis.fetch,
): Promise<{ success: boolean; error?: string }> {
  const _fetch = fetchFn ?? globalThis.fetch;

  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return { success: false, error: "Service Worker not available" };
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    return { success: true }; // Already unsubscribed
  }

  const endpoint = subscription.endpoint;

  // Unsubscribe locally
  await subscription.unsubscribe();

  // Notify backend
  const url = `${baseUrl.replace(/\/+$/, "")}/push-notification/unregister`;
  try {
    const response = await _fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });

    if (!response.ok) {
      return {
        success: true, // Local unsub worked
        error: `Backend unregister failed (${response.status})`,
      };
    }
  } catch (err) {
    return {
      success: true,
      error: `Backend unregister request failed: ${(err as Error).message}`,
    };
  }

  return { success: true };
}
