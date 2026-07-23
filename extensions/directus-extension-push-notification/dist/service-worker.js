"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/push-notification/service-worker.ts
  var ServiceWorkerLogger = class {
    async notifyClients(level, message, error) {
      const clients = await self.clients.matchAll();
      const logData = {
        type: "SW_LOG",
        level,
        message,
        error: error ? { message: error.message, stack: error.stack } : void 0,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      clients.forEach((client) => {
        client.postMessage(logData);
      });
    }
    error(message, error) {
      this.notifyClients("error", message, error).catch(() => {
      });
    }
    info(message) {
      this.notifyClients("info", message).catch(() => {
      });
    }
  };
  var PushDeliveryStatusUpdater = class {
    constructor(logger2) {
      __publicField(this, "logger", logger2);
    }
    async updateDeliveryStatus(deliveryId, status) {
      try {
        const timestampField = status === "delivered" ? "date_delivered" : "date_read";
        await fetch(`/items/push_delivery/${deliveryId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            [timestampField]: (/* @__PURE__ */ new Date()).toISOString()
          })
        });
      } catch (error) {
        this.logger.error(
          `Failed to update delivery status to ${status}`,
          error
        );
        throw error;
      }
    }
  };
  var PushNotificationHandler = class {
    constructor(logger2, deliveryUpdater2) {
      __publicField(this, "logger", logger2);
      __publicField(this, "deliveryUpdater", deliveryUpdater2);
    }
    async handlePush(event) {
      const data = event.data ? event.data.json() : {};
      const options = {
        body: data.body || "Nova notifica\xE7\xE3o do Directus",
        icon: data.icon_url || "/admin/favicon.ico",
        badge: "/admin/favicon.ico",
        tag: data.notification_id || "directus-notification",
        data: {
          url: data.action_url || "/admin",
          notification_id: data.notification_id,
          delivery_id: data.delivery_id
        },
        requireInteraction: data.priority === "urgent" || data.priority === "high"
      };
      const tasks = [
        self.registration.showNotification(data.title || "Directus", options)
      ];
      if (data.delivery_id) {
        tasks.push(
          this.deliveryUpdater.updateDeliveryStatus(data.delivery_id, "delivered").catch((error) => {
            this.logger.error("Failed to confirm delivery", error);
          })
        );
      }
      await Promise.all(tasks);
    }
    async handleNotificationClick(event) {
      event.notification.close();
      if (event.notification.data?.delivery_id) {
        await this.deliveryUpdater.updateDeliveryStatus(event.notification.data.delivery_id, "read").catch((error) => {
          this.logger.error("Failed to mark notification as read", error);
        });
      }
      await self.clients.openWindow(
        event.notification.data?.url || "/admin"
      );
    }
  };
  var logger = new ServiceWorkerLogger();
  var deliveryUpdater = new PushDeliveryStatusUpdater(logger);
  var notificationHandler = new PushNotificationHandler(
    logger,
    deliveryUpdater
  );
  self.addEventListener("push", (event) => {
    event.waitUntil(notificationHandler.handlePush(event));
  });
  self.addEventListener("notificationclick", (event) => {
    event.waitUntil(notificationHandler.handleNotificationClick(event));
  });
  self.addEventListener("install", () => {
    self.skipWaiting();
  });
  self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
  });
})();
