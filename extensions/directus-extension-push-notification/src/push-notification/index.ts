/* eslint-disable @typescript-eslint/no-explicit-any */
import { defineEndpoint } from "@directus/extensions-sdk";
import webPush from "web-push";
import type {
  PushSubscriptionData,
  RegisterSubscriptionRequest,
} from "./_types.js";

const collection = "push_subscription";

/**
 * Parâmetros de transformação de imagem do Directus para ícones de push notification.
 * @see https://docs.directus.io/reference/files.html#custom-transformations
 */
const ICON_TRANSFORM_PARAMS = "width=192&height=192&fit=cover&quality=80";

export default defineEndpoint(
  async (router, { services, database, getSchema, env, logger }) => {
    const { ItemsService } = services;

    // Configure VAPID keys only if they are provided
    if (env.PUSH_PUBLIC_VAPID_KEY && env.PUSH_PRIVATE_VAPID_KEY) {
      webPush.setVapidDetails(
        env.PUSH_VAPID_SUBJECT
          ? env.PUSH_VAPID_SUBJECT
          : env.PUBLIC_URL?.startsWith("http://")
            ? "mailto:admin@example.com"
            : env.PUBLIC_URL || "mailto:admin@example.com",
        env.PUSH_PUBLIC_VAPID_KEY,
        env.PUSH_PRIVATE_VAPID_KEY,
      );
      logger.info("[Push Notification] VAPID keys configured successfully");
    } else {
      logger.warn(
        "[Push Notification] ⚠️  VAPID keys not configured. Push notifications will not work. Set PUSH_PUBLIC_VAPID_KEY and PUSH_PRIVATE_VAPID_KEY environment variables.",
      );
    }

    /**
     * GET /push-notification/icon/:notification_id
     *
     * Endpoint público que serve o ícone de uma push notification.
     * - Se a notificação tem `icon` (directus_files) → proxy do asset com transformação 192×192px
     * - Se a notificação tem `icon_url` (URL externa) → redirect 302
     * - Senão → redirect para /admin/favicon.ico
     *
     * Não requer autenticação, pois é chamado pelo service worker.
     */
    router.get("/icon/:notification_id", async (req, res) => {
      try {
        const notificationId = req.params.notification_id;

        if (!notificationId) {
          res.redirect("/admin/favicon.ico");
          return;
        }

        const schema = await getSchema();
        const itemsService = new ItemsService("user_notification", {
          knex: database,
          schema,
        });

        let notification: Record<string, unknown>;
        try {
          notification = (await itemsService.readOne(notificationId, {
            fields: ["icon", "icon_url"],
          })) as Record<string, unknown>;
        } catch {
          logger.warn(
            `[Push Notification] Icon request for non-existent notification: ${notificationId}`,
          );
          res.redirect("/admin/favicon.ico");
          return;
        }

        // Prioridade 1: icon (arquivo no Directus) → proxy com transformação
        if (notification.icon) {
          const assetUrl = `/assets/${notification.icon as string}?${ICON_TRANSFORM_PARAMS}`;
          logger.debug(
            `[Push Notification] Proxying icon asset for notification ${notificationId}`,
          );
          res.redirect(assetUrl);
          return;
        }

        // Prioridade 2: icon_url (URL externa) → redirect 302
        if (notification.icon_url) {
          logger.debug(
            `[Push Notification] Redirecting to external icon for notification ${notificationId}`,
          );
          res.redirect(notification.icon_url as string);
          return;
        }

        // Fallback
        res.redirect("/admin/favicon.ico");
      } catch (error: unknown) {
        const err = error as { message?: string };
        logger.error(`[Push Notification] Error serving icon: ${err.message}`);
        res.redirect("/admin/favicon.ico");
      }
    });

    router.post("/register", async (req, res) => {
      logger.info("[Push Notification] Registering subscription");
      const accountability = (req as any).accountability;
      const itemsService = new ItemsService(collection, {
        knex: database,
        schema: await getSchema(),
        accountability: accountability,
      });
      const user = accountability?.user;
      const body = req.body as RegisterSubscriptionRequest;
      const subscription: PushSubscriptionData | undefined = body.subscription;
      const userAgent = req.headers["user-agent"] || "";
      const deviceName = body.device_name;

      if (!(subscription && subscription.endpoint)) {
        logger.info("[Push Notification] Incorrect Subscription payload");
        res.status(400).send(`Incorrect Subscription payload`);
        return;
      }

      const subscriptions = await itemsService.readByQuery({
        filter: {
          endpoint: { _eq: subscription?.endpoint },
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
      });

      if (subscriptions.length === 0) {
        const subscriptionId = await itemsService.createOne({
          user: user,
          endpoint: subscription.endpoint,
          keys: subscription.keys,
          user_agent: userAgent,
          device_name: deviceName,
          is_active: true,
        });
        logger.info(
          `[Push Notification] Subscription with endpoint ${subscription.endpoint} registered on id ${subscriptionId}`,
        );
        res
          .status(201)
          .send(
            `Subscription with endpoint ${subscription.endpoint} registered on id ${subscriptionId}`,
          );
        return;
      }

      const sub = subscriptions[0];
      if (!sub) {
        res.status(500).send("Unexpected error: subscription not found");
        return;
      }

      if (sub.user != user) {
        logger.info(
          `[Push Notification] Subscription with endpoint ${subscription.endpoint} already registered on id ${sub.id} but updating user...`,
        );
        await itemsService.updateOne(sub.id, {
          user: user,
          is_active: true,
          date_expires: null,
          keys: subscription.keys,
          user_agent: userAgent,
          device_name: deviceName || sub.device_name, // Preserva device_name se não fornecido
        });
        logger.info(
          `[Push Notification] Subscription with endpoint ${subscription.endpoint} and id ${sub.id} has had it user updated`,
        );
        res
          .status(202)
          .send(
            `Subscription with endpoint ${subscription.endpoint} and id ${sub.id} has had it user updated`,
          );
        return;
      }

      if (!sub.is_active) {
        logger.info(
          `[Push Notification] Reactivating subscription with endpoint ${subscription.endpoint} on id ${sub.id}`,
        );
        await itemsService.updateOne(sub.id, {
          is_active: true,
          date_expires: null,
          keys: subscription.keys,
          user_agent: userAgent,
          device_name: deviceName || sub.device_name,
        });
        res
          .status(202)
          .send(
            `Subscription with endpoint ${subscription.endpoint} and id ${sub.id} has been reactivated`,
          );
        return;
      }

      logger.info(
        `[Push Notification] Subscription with endpoint ${subscription.endpoint} already registered on id ${sub.id}`,
      );
      res
        .status(208)
        .send(
          `Subscription with endpoint ${subscription.endpoint} already registered on id ${sub.id}`,
        );
    });

    router.post("/unregister", async (req, res) => {
      logger.info("[Push Notification] Unregistering subscription");
      const accountability = (req as any).accountability;
      const itemsService = new ItemsService(collection, {
        knex: database,
        schema: await getSchema(),
        accountability: accountability,
      });
      const user = accountability?.user;
      const subscription: PushSubscriptionData | undefined =
        req.body.subscription;

      if (!(subscription && subscription.endpoint)) {
        logger.info("[Push Notification] Incorrect Subscription payload");
        res.status(400).send(`Incorrect Subscription payload`);
        return;
      }

      const subscriptions = await itemsService.readByQuery({
        filter: {
          endpoint: { _eq: subscription?.endpoint },
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
      });

      if (subscriptions.length === 0) {
        logger.info(
          `[Push Notification] Subscription with endpoint ${subscription.endpoint} not registered`,
        );
        res
          .status(404)
          .send(
            `Subscription with endpoint ${subscription.endpoint} not registered`,
          );
        return;
      }

      const sub = subscriptions[0];
      if (!sub) {
        res.status(500).send("Unexpected error: subscription not found");
        return;
      }

      if (sub.user != user) {
        res.status(403).send("Subscription does not belong to current user");
        return;
      }

      // Soft delete: marcar como inativa ao invés de deletar
      await itemsService.updateOne(sub.id, {
        is_active: false,
        date_expires: new Date().toISOString(),
      });

      logger.info(
        `[Push Notification] Subscription with endpoint ${subscription.endpoint} unregistered`,
      );
      res
        .status(201)
        .send(
          `Subscription with endpoint ${subscription.endpoint} unregistered`,
        );
    });
  },
);
