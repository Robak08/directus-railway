import { defineHook } from "@directus/extensions-sdk";
import webpush from "web-push";
import { resolveIconUrl } from "./resolve-icon.js";
import { resolveTranslation } from "./resolve-translation.js";

interface PushSubscription {
  id: string | number;
  endpoint: string;
  keys: string | { p256dh: string; auth: string };
  user_agent?: string;
  device_name?: string;
  is_active: boolean;
}

interface DeliveryRecord {
  id: string | number;
  attempt_count: number;
  max_attempts: number;
  subscription: PushSubscription;
}

export default defineHook(({ filter, action }, { services, logger }) => {
  const { ItemsService } = services;

  logger.info("[Notification Trigger] Hook registered");

  filter("user_notification.items.create", async (payload) => {
    logger.debug(
      "[Notification Trigger] Filter user_notification.items.create",
      { payload },
    );
    return payload;
  });

  action("items.create", async (meta, { schema, database }) => {
    try {
      logger.debug(
        `[Notification Trigger] Action items.create fired for collection: ${meta.collection}`,
      );

      // Apenas processar se for user_notification
      if (meta.collection !== "user_notification") {
        return;
      }

      logger.info(
        "[Notification Trigger] Processing items.create for user_notification",
        {
          key: meta.key,
          payload: meta.payload,
        },
      );

      const notification = { ...meta.payload, id: meta.key };

      // Apenas processar se channel === 'push'
      if (notification.channel !== "push") {
        logger.debug(
          `[Notification Trigger] Notification ${notification.id} is not push channel, skipping`,
        );
        return;
      }

      logger.debug(
        "[Notification Trigger] Channel is push, processing notification",
      );

      // Configurar VAPID keys (precisa ser feito aqui pois env não está disponível no escopo externo)
      const env = process.env;

      if (!env.PUSH_PUBLIC_VAPID_KEY || !env.PUSH_PRIVATE_VAPID_KEY) {
        logger.error("[Notification Trigger] VAPID keys not configured", {
          notification_id: notification.id,
        });
        return;
      }

      // VAPID subject (identificação do servidor de push)
      // Pode ser: https://seusite.com ou mailto:contato@seusite.com
      // Prioridade: PUSH_VAPID_SUBJECT > PUBLIC_URL > fallback
      let vapidSubject =
        env.PUSH_VAPID_SUBJECT || env.PUBLIC_URL || "mailto:admin@example.com";

      // URLs http:// não são aceitas, converter para mailto:
      if (vapidSubject.startsWith("http://")) {
        vapidSubject = "mailto:admin@example.com";
        logger.warn(
          `[Notification Trigger] PUBLIC_URL is http://, using mailto: fallback. Set PUSH_VAPID_SUBJECT with https:// or mailto: for production.`,
        );
      }

      logger.debug(`[Notification Trigger] VAPID subject: ${vapidSubject}`);

      webpush.setVapidDetails(
        vapidSubject,
        env.PUSH_PUBLIC_VAPID_KEY,
        env.PUSH_PRIVATE_VAPID_KEY,
      );

      logger.info("[Notification Trigger] VAPID configured successfully");

      // Buscar usuário destinatário com configurações de push
      const usersService = new ItemsService("directus_users", {
        schema: schema!,
        knex: database,
      });
      const subscriptionsService = new ItemsService("push_subscription", {
        schema: schema!,
        knex: database,
      });
      const deliveryService = new ItemsService("push_delivery", {
        schema: schema!,
        knex: database,
      });

      const user = await usersService.readOne(notification.user, {
        fields: ["id", "push_enabled", "language"],
      });

      logger.debug("[Notification Trigger] User loaded", {
        id: user.id,
        push_enabled: user.push_enabled,
        language: user.language,
      });

      if (!user.push_enabled) {
        logger.warn(
          `[Notification Trigger] User ${user.id} does not have push notifications enabled`,
        );
        return;
      }

      logger.debug(
        "[Notification Trigger] User has push enabled, fetching subscriptions",
      );

      // Buscar traduções da notificação
      const translationsService = new ItemsService(
        "user_notification_translations",
        {
          schema: schema!,
          knex: database,
        },
      );

      let translations: Array<{
        languages_code: string;
        title: string;
        body: string;
      }> = [];
      try {
        translations = (await translationsService.readByQuery({
          filter: {
            user_notification_id: { _eq: notification.id },
          },
          fields: ["languages_code", "title", "body"],
          limit: -1,
        })) as Array<{ languages_code: string; title: string; body: string }>;
        logger.debug(
          `[Notification Trigger] Found ${translations.length} translation(s) for notification ${notification.id}`,
        );
      } catch {
        // Tabela pode não existir ainda (primeira execução antes do db-configuration)
        logger.debug(
          "[Notification Trigger] Could not fetch translations, using direct fields",
        );
      }

      // Resolver title/body no idioma do usuário
      const resolved = resolveTranslation({
        title: notification.title,
        body: notification.body,
        translations,
        user_language: user.language,
      });

      logger.debug("[Notification Trigger] Resolved translation", {
        user_language: user.language,
        resolved_title: resolved.title,
        has_translations: translations.length > 0,
      });

      // Buscar TODAS as subscriptions ATIVAS do usuário (múltiplos dispositivos)
      const subscriptions = await subscriptionsService.readByQuery({
        filter: {
          user: { _eq: notification.user },
          is_active: { _eq: true },
        },
        fields: [
          "id",
          "user",
          "endpoint",
          "keys",
          "user_agent",
          "device_name",
          "is_active",
        ],
        limit: -1,
      });

      logger.info(
        `[Notification Trigger] Found ${subscriptions.length} active subscription(s) for user ${user.id}`,
      );

      if (subscriptions.length === 0) {
        logger.warn(
          `[Notification Trigger] User ${user.id} has no active subscriptions`,
        );
        return;
      }

      logger.debug(
        "[Notification Trigger] Creating delivery records for each subscription",
      );

      // Criar registros na push_delivery para cada dispositivo (status: queued)
      const deliveryRecords: DeliveryRecord[] = [];

      for (const sub of subscriptions) {
        logger.debug(
          `[Notification Trigger] Creating delivery record for subscription ${sub.id}`,
        );

        const deliveryRecord = await deliveryService.createOne({
          notification: notification.id,
          subscription: sub.id,
          status: "queued",
          date_queued: new Date().toISOString(),
          attempt_count: 0,
          max_attempts: 3,
        });

        logger.debug(
          `[Notification Trigger] Delivery record created with id ${deliveryRecord}`,
        );

        deliveryRecords.push({
          id: deliveryRecord,
          attempt_count: 0,
          max_attempts: 3,
          subscription: sub as PushSubscription,
        });
      }

      // Enviar push para TODOS os dispositivos
      let sentCount = 0;
      let failedCount = 0;

      for (const delivery of deliveryRecords) {
        const sub = delivery.subscription;

        try {
          // Atualizar para 'sending'
          await deliveryService.updateOne(delivery.id, {
            status: "sending",
            attempt_count: delivery.attempt_count + 1,
          });

          // Reconstruir objeto subscription
          // Se keys vier como string, fazer parse
          const keys =
            typeof sub.keys === "string" ? JSON.parse(sub.keys) : sub.keys;

          const subscription = {
            endpoint: sub.endpoint as string,
            keys: keys,
          };

          // Resolver URL do ícone: icon (directus_files) > icon_url > fallback
          const resolvedIconUrl = resolveIconUrl({
            notification_id: notification.id,
            icon: notification.icon,
            icon_url: notification.icon_url,
          });

          // Payload inclui ID da push_delivery para callback do Service Worker
          const pushPayload = JSON.stringify({
            title: resolved.title,
            body: resolved.body,
            icon_url: resolvedIconUrl,
            action_url: notification.action_url,
            priority: notification.priority,
            notification_id: notification.id,
            delivery_id: delivery.id, // ⭐ Service Worker usa isso
          });

          await webpush.sendNotification(subscription, pushPayload);
          sentCount++;

          // Atualizar status para 'sent'
          await deliveryService.updateOne(delivery.id, {
            status: "sent",
            date_sent: new Date().toISOString(),
          });

          // Atualizar date_last_used da subscription
          await subscriptionsService.updateOne(sub.id, {
            date_last_used: new Date().toISOString(),
          });

          logger.info(
            `[Notification Trigger] Push notification sent successfully to device ${sub.id} (${sub.device_name || sub.user_agent})`,
          );
        } catch (error: unknown) {
          failedCount++;

          const err = error as { message?: string; statusCode?: number };

          logger.error(
            `[Notification Trigger] Failed to send push to device ${sub.id}`,
            {
              error: err.message,
              statusCode: err.statusCode,
            },
          );

          const shouldRetry =
            delivery.attempt_count < delivery.max_attempts &&
            err.statusCode !== 410;

          // Atualizar status para 'failed'
          await deliveryService.updateOne(delivery.id, {
            status: shouldRetry ? "queued" : "failed",
            date_failed: shouldRetry ? null : new Date().toISOString(),
            error_code: String(err.statusCode || "UNKNOWN"),
            error_message: err.message,
            date_retry: shouldRetry
              ? new Date(Date.now() + 60000).toISOString()
              : null, // 1min
            metadata: {
              device: sub.device_name || sub.user_agent,
              endpoint_domain: new URL(sub.endpoint as string).hostname,
            },
          });

          // Se subscription expirou (410 Gone), marcar como inativa
          if (err.statusCode === 410) {
            logger.warn(
              `[Notification Trigger] Subscription ${sub.id} expired (410 Gone), marking as inactive`,
            );

            await subscriptionsService.updateOne(sub.id, {
              is_active: false,
              date_expires: new Date().toISOString(),
            });
          }
        }
      }

      logger.info(
        `[Notification Trigger] Push notification completed: ${sentCount}/${subscriptions.length} device(s) reached, ${failedCount} failed`,
      );
    } catch (error: unknown) {
      const err = error as { message?: string; stack?: string };

      logger.error(
        "[Notification Trigger] Error processing push notification",
        {
          error: err.message,
          stack: err.stack,
          notification_id: meta.key,
          collection: meta.collection,
        },
      );
    }
  });
});
