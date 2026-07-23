/**
 * Push Notification SDK — API Client
 *
 * Zero-dependency HTTP client baseado em fetch.
 * Funciona em Node.js ≥ 18, Deno, Bun e browsers.
 */

import type {
  PushNotificationClientConfig,
  RegisterSubscriptionRequest,
  RegisterSubscriptionResponse,
  UnregisterSubscriptionRequest,
  UnregisterSubscriptionResponse,
  SendNotificationRequest,
  SendNotificationResponse,
  CreateBroadcastRequest,
  CreateBroadcastResponse,
  PushSubscription,
} from "./types.js";

export class PushNotificationSDKError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "PushNotificationSDKError";
  }
}

export class PushNotificationClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly _fetch: typeof globalThis.fetch;

  constructor(config: PushNotificationClientConfig) {
    // Remove trailing slash
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.token = config.token;
    this._fetch = config.fetch ?? globalThis.fetch;
  }

  // ─── HTTP helpers ────────────────────────────────────────────────────────

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.token) {
      h["Authorization"] = `Bearer ${this.token}`;
    }
    return h;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: this.headers(),
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const response = await this._fetch(url, init);

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }
      throw new PushNotificationSDKError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        errorBody,
      );
    }

    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  // ─── Subscription endpoints ──────────────────────────────────────────────

  /**
   * Register a push subscription for the authenticated user.
   */
  async registerSubscription(
    data: RegisterSubscriptionRequest,
  ): Promise<RegisterSubscriptionResponse> {
    return this.request<RegisterSubscriptionResponse>(
      "POST",
      "/push-notification/register",
      data,
    );
  }

  /**
   * Unregister a push subscription by endpoint URL.
   */
  async unregisterSubscription(
    data: UnregisterSubscriptionRequest,
  ): Promise<UnregisterSubscriptionResponse> {
    return this.request<UnregisterSubscriptionResponse>(
      "POST",
      "/push-notification/unregister",
      data,
    );
  }

  /**
   * List all active subscriptions for the authenticated user.
   */
  async getSubscriptions(): Promise<PushSubscription[]> {
    const result = await this.request<{ data: PushSubscription[] }>(
      "GET",
      "/push-notification/subscriptions",
    );
    return result.data;
  }

  // ─── Notification endpoints ──────────────────────────────────────────────

  /**
   * Send a push notification.
   * Requires admin or appropriate permissions.
   */
  async sendNotification(
    data: SendNotificationRequest,
  ): Promise<SendNotificationResponse> {
    return this.request<SendNotificationResponse>(
      "POST",
      "/push-notification/send",
      data,
    );
  }

  /**
   * Create a broadcast notification that fans out to multiple users.
   */
  async createBroadcast(
    data: CreateBroadcastRequest,
  ): Promise<CreateBroadcastResponse> {
    return this.request<CreateBroadcastResponse>(
      "POST",
      "/items/notification_broadcast",
      data,
    );
  }

  // ─── VAPID key ───────────────────────────────────────────────────────────

  /**
   * Get the VAPID public key from the server.
   */
  async getVapidPublicKey(): Promise<string> {
    const result = await this.request<{ vapid_public_key: string }>(
      "GET",
      "/push-notification/vapid-public-key",
    );
    return result.vapid_public_key;
  }
}
