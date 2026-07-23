import { describe, it, expect, vi } from "vitest";
import { PushNotificationClient, PushNotificationSDKError } from "./client.js";

function mockFetch(
  status: number,
  body: unknown,
  statusText = "OK",
): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: async () => JSON.stringify(body),
    json: async () => body,
  }) as unknown as typeof globalThis.fetch;
}

describe("PushNotificationClient", () => {
  const baseConfig = { baseUrl: "https://directus.example.com" };

  describe("constructor", () => {
    it("deve remover trailing slash da baseUrl", () => {
      const fetchFn = mockFetch(200, { vapid_public_key: "key" });
      const client = new PushNotificationClient({
        ...baseConfig,
        baseUrl: "https://directus.example.com/",
        fetch: fetchFn,
      });

      // Testar indiretamente via chamada
      void client.getVapidPublicKey();
      expect(fetchFn).toHaveBeenCalledWith(
        "https://directus.example.com/push-notification/vapid-public-key",
        expect.any(Object),
      );
    });
  });

  describe("headers", () => {
    it("deve incluir Authorization quando token é fornecido", async () => {
      const fetchFn = mockFetch(200, { vapid_public_key: "key" });
      const client = new PushNotificationClient({
        ...baseConfig,
        token: "my-token",
        fetch: fetchFn,
      });

      await client.getVapidPublicKey();

      expect(fetchFn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer my-token",
          },
        }),
      );
    });

    it("não deve incluir Authorization quando token é omitido", async () => {
      const fetchFn = mockFetch(200, { vapid_public_key: "key" });
      const client = new PushNotificationClient({
        ...baseConfig,
        fetch: fetchFn,
      });

      await client.getVapidPublicKey();

      expect(fetchFn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            "Content-Type": "application/json",
          },
        }),
      );
    });
  });

  describe("registerSubscription", () => {
    it("deve enviar POST para /push-notification/register", async () => {
      const fetchFn = mockFetch(200, {
        success: true,
        subscription_id: "sub-1",
      });
      const client = new PushNotificationClient({
        ...baseConfig,
        fetch: fetchFn,
      });

      const result = await client.registerSubscription({
        subscription: {
          endpoint: "https://fcm.googleapis.com/...",
          keys: { p256dh: "key1", auth: "key2" },
        },
        device_name: "Mac",
      });

      expect(result.success).toBe(true);
      expect(result.subscription_id).toBe("sub-1");
      expect(fetchFn).toHaveBeenCalledWith(
        "https://directus.example.com/push-notification/register",
        expect.objectContaining({
          method: "POST",
          body: expect.any(String),
        }),
      );
    });
  });

  describe("unregisterSubscription", () => {
    it("deve enviar POST para /push-notification/unregister", async () => {
      const fetchFn = mockFetch(200, { success: true });
      const client = new PushNotificationClient({
        ...baseConfig,
        fetch: fetchFn,
      });

      const result = await client.unregisterSubscription({
        endpoint: "https://fcm.googleapis.com/...",
      });

      expect(result.success).toBe(true);
      expect(fetchFn).toHaveBeenCalledWith(
        "https://directus.example.com/push-notification/unregister",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  describe("getSubscriptions", () => {
    it("deve retornar array de subscriptions", async () => {
      const subs = [
        {
          id: "1",
          user: "user-1",
          endpoint: "https://...",
          keys: { p256dh: "k1", auth: "k2" },
          is_active: true,
        },
      ];
      const fetchFn = mockFetch(200, { data: subs });
      const client = new PushNotificationClient({
        ...baseConfig,
        fetch: fetchFn,
      });

      const result = await client.getSubscriptions();

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("1");
      expect(fetchFn).toHaveBeenCalledWith(
        "https://directus.example.com/push-notification/subscriptions",
        expect.objectContaining({ method: "GET" }),
      );
    });
  });

  describe("sendNotification", () => {
    it("deve enviar POST para /push-notification/send", async () => {
      const fetchFn = mockFetch(200, {
        success: true,
        notification_id: "notif-1",
        deliveries_created: 2,
      });
      const client = new PushNotificationClient({
        ...baseConfig,
        token: "admin-token",
        fetch: fetchFn,
      });

      const result = await client.sendNotification({
        user: "user-1",
        title: "Hello",
        body: "World",
        priority: "high",
      });

      expect(result.success).toBe(true);
      expect(result.notification_id).toBe("notif-1");
      expect(result.deliveries_created).toBe(2);
    });

    it("deve incluir translations no body quando fornecidas", async () => {
      const fetchFn = mockFetch(200, { success: true });
      const client = new PushNotificationClient({
        ...baseConfig,
        fetch: fetchFn,
      });

      await client.sendNotification({
        user: "user-1",
        title: "Default",
        body: "Default body",
        translations: [
          { languages_code: "pt-BR", title: "Olá", body: "Mundo" },
        ],
      });

      const callBody = JSON.parse(
        (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]
          ?.body as string,
      );
      expect(callBody.translations).toHaveLength(1);
      expect(callBody.translations[0].languages_code).toBe("pt-BR");
    });
  });

  describe("getVapidPublicKey", () => {
    it("deve retornar a VAPID public key", async () => {
      const fetchFn = mockFetch(200, { vapid_public_key: "BEl62i..." });
      const client = new PushNotificationClient({
        ...baseConfig,
        fetch: fetchFn,
      });

      const key = await client.getVapidPublicKey();
      expect(key).toBe("BEl62i...");
    });
  });

  describe("error handling", () => {
    it("deve lançar PushNotificationSDKError em HTTP 401", async () => {
      const fetchFn = mockFetch(
        401,
        { errors: [{ message: "Unauthorized" }] },
        "Unauthorized",
      );
      const client = new PushNotificationClient({
        ...baseConfig,
        fetch: fetchFn,
      });

      await expect(client.getVapidPublicKey()).rejects.toThrow(
        PushNotificationSDKError,
      );

      try {
        await client.getVapidPublicKey();
      } catch (err) {
        const sdkErr = err as PushNotificationSDKError;
        expect(sdkErr.status).toBe(401);
        expect(sdkErr.body).toEqual({
          errors: [{ message: "Unauthorized" }],
        });
      }
    });

    it("deve lançar PushNotificationSDKError em HTTP 500", async () => {
      const fetchFn = mockFetch(
        500,
        { errors: [{ message: "Internal" }] },
        "Internal Server Error",
      );
      const client = new PushNotificationClient({
        ...baseConfig,
        fetch: fetchFn,
      });

      await expect(
        client.sendNotification({
          user: "u",
          title: "t",
          body: "b",
        }),
      ).rejects.toThrow(PushNotificationSDKError);
    });

    it("deve incluir status e body no erro", async () => {
      const fetchFn = mockFetch(403, { message: "Forbidden" }, "Forbidden");
      const client = new PushNotificationClient({
        ...baseConfig,
        fetch: fetchFn,
      });

      try {
        await client.getSubscriptions();
      } catch (err) {
        const sdkErr = err as PushNotificationSDKError;
        expect(sdkErr.status).toBe(403);
        expect(sdkErr.name).toBe("PushNotificationSDKError");
      }
    });
  });

  describe("createBroadcast", () => {
    it("deve POST para /items/notification_broadcast", async () => {
      const responseBody = {
        data: {
          id: "broadcast-1",
          title: "Test",
          body: "Body",
          target_type: "all",
          channel: "push",
          priority: "normal",
          status: "processing",
        },
      };
      const fetchFn = mockFetch(200, responseBody);
      const client = new PushNotificationClient({
        ...baseConfig,
        token: "token",
        fetch: fetchFn,
      });

      const result = await client.createBroadcast({
        title: "Test",
        body: "Body",
        target_type: "all",
        status: "processing",
      });

      expect(result).toEqual(responseBody);
      expect(fetchFn).toHaveBeenCalledWith(
        "https://directus.example.com/items/notification_broadcast",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            title: "Test",
            body: "Body",
            target_type: "all",
            status: "processing",
          }),
        }),
      );
    });
  });
});
