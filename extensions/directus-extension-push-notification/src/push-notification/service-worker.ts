/// <reference lib="webworker" />

import type {
  DeliveryStatus,
  DeliveryStatusUpdater,
  Logger,
  LogMessage,
  PushEventHandler,
  PushNotificationData,
} from "./service-worker.types.js";

// Service Worker para receber e exibir push notifications
declare const self: ServiceWorkerGlobalScope;

/**
 * Logger para Service Worker context
 * Envia logs para todos os clients conectados via postMessage
 */
class ServiceWorkerLogger implements Logger {
  private async notifyClients(level: string, message: string, error?: Error) {
    const clients = await self.clients.matchAll();
    const logData: LogMessage = {
      type: "SW_LOG",
      level,
      message,
      error: error ? { message: error.message, stack: error.stack } : undefined,
      timestamp: new Date().toISOString(),
    };

    clients.forEach((client) => {
      client.postMessage(logData);
    });
  }

  error(message: string, error?: Error): void {
    this.notifyClients("error", message, error).catch(() => {
      // Fallback silencioso se não conseguir notificar clients
    });
  }

  info(message: string): void {
    this.notifyClients("info", message).catch(() => {
      // Fallback silencioso se não conseguir notificar clients
    });
  }
}

/**
 * Serviço para atualizar status de entrega no backend
 */
class PushDeliveryStatusUpdater implements DeliveryStatusUpdater {
  constructor(private readonly logger: Logger) {}

  async updateDeliveryStatus(
    deliveryId: string,
    status: DeliveryStatus,
  ): Promise<void> {
    try {
      const timestampField =
        status === "delivered" ? "date_delivered" : "date_read";

      await fetch(`/items/push_delivery/${deliveryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          [timestampField]: new Date().toISOString(),
        }),
      });
    } catch (error) {
      this.logger.error(
        `Failed to update delivery status to ${status}`,
        error as Error,
      );
      throw error;
    }
  }
}

/**
 * Handler para eventos de push notification
 */
class PushNotificationHandler implements PushEventHandler {
  constructor(
    private readonly logger: Logger,
    private readonly deliveryUpdater: DeliveryStatusUpdater,
  ) {}

  async handlePush(event: PushEvent): Promise<void> {
    const data: PushNotificationData = event.data ? event.data.json() : {};

    const options: NotificationOptions = {
      body: data.body || "Nova notificação do Directus",
      icon: data.icon_url || "/admin/favicon.ico",
      badge: "/admin/favicon.ico",
      tag: data.notification_id || "directus-notification",
      data: {
        url: data.action_url || "/admin",
        notification_id: data.notification_id,
        delivery_id: data.delivery_id,
      },
      requireInteraction:
        data.priority === "urgent" || data.priority === "high",
    };

    const tasks: Promise<unknown>[] = [
      self.registration.showNotification(data.title || "Directus", options),
    ];

    // Confirma entrega (delivered) ao backend
    if (data.delivery_id) {
      tasks.push(
        this.deliveryUpdater
          .updateDeliveryStatus(data.delivery_id, "delivered")
          .catch((error: Error) => {
            this.logger.error("Failed to confirm delivery", error);
          }),
      );
    }

    await Promise.all(tasks);
  }

  async handleNotificationClick(event: NotificationEvent): Promise<void> {
    event.notification.close();

    // Marca como LIDA (read) na push_delivery
    if (event.notification.data?.delivery_id) {
      await this.deliveryUpdater
        .updateDeliveryStatus(event.notification.data.delivery_id, "read")
        .catch((error: Error) => {
          this.logger.error("Failed to mark notification as read", error);
        });
    }

    // Abre o dashboard do Directus
    await self.clients.openWindow(
      event.notification.data?.url || "/admin",
    );
  }
}

// Inicialização
const logger = new ServiceWorkerLogger();
const deliveryUpdater = new PushDeliveryStatusUpdater(logger);
const notificationHandler = new PushNotificationHandler(
  logger,
  deliveryUpdater,
);

// Registra event listeners
self.addEventListener("push", (event: PushEvent) => {
  event.waitUntil(notificationHandler.handlePush(event));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.waitUntil(notificationHandler.handleNotificationClick(event));
});

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(self.clients.claim());
});
