import { defineHook } from "@directus/extensions-sdk";
import { resolveTranslation } from "../notification-trigger/resolve-translation.js";
import type { NotificationBroadcast } from "./_types.js";
import { resolveTargetUsers } from "./resolve-target.js";

const BATCH_SIZE = 100;
const processingBroadcasts = new Set<string>();

export default defineHook(({ action }, { services, logger }) => {
  const { ItemsService } = services;

  logger.info("[Broadcast Processor] Hook registered");

  async function processBroadcast(
    broadcastId: string | number,
    context: { schema: unknown; database: unknown },
    triggerPayload?: Partial<NotificationBroadcast>,
  ): Promise<void> {
    const { schema, database } = context;
    const serviceOptions = {
      schema: schema!,
      knex: database,
    } as ConstructorParameters<typeof ItemsService>[1];

    const broadcastService = new ItemsService(
      "notification_broadcast",
      serviceOptions,
    );
    const notificationService = new ItemsService(
      "user_notification",
      serviceOptions,
    );
    const translationsService = new ItemsService(
      "notification_broadcast_translations",
      serviceOptions,
    );
    const usersService = new ItemsService("directus_users", serviceOptions);

    let broadcast: NotificationBroadcast;

    try {
      broadcast = (await broadcastService.readOne(broadcastId, {
        fields: [
          "*",
          "translations.languages_code",
          "translations.title",
          "translations.body",
          "target_roles.directus_roles_id",
          "target_users.directus_users_id",
        ],
      })) as NotificationBroadcast;
    } catch (error: unknown) {
      const err = error as { message?: string };
      logger.error("[Broadcast Processor] Failed to load broadcast", {
        broadcast_id: broadcastId,
        error: err.message,
      });
      return;
    }

    const status = triggerPayload?.status ?? broadcast.status;

    if (status === "draft") {
      logger.debug(
        `[Broadcast Processor] Broadcast ${broadcastId} is draft, skipping`,
      );
      return;
    }

    if (broadcast.status === "completed") {
      logger.debug(
        `[Broadcast Processor] Broadcast ${broadcastId} already completed, skipping`,
      );
      return;
    }

    const broadcastKey = String(broadcastId);
    if (processingBroadcasts.has(broadcastKey)) {
      logger.debug(
        `[Broadcast Processor] Broadcast ${broadcastId} already in progress, skipping`,
      );
      return;
    }

    processingBroadcasts.add(broadcastKey);

    try {
      await broadcastService.updateOne(broadcastId, { status: "processing" });

      const targetUsers = await resolveTargetUsers(broadcast, {
        readByQuery: (query) =>
          usersService.readByQuery(query) as Promise<
            import("./_types.js").TargetUser[]
          >,
      });

      let translations: Array<{
        languages_code: string;
        title: string;
        body: string;
      }> = [];

      if (broadcast.translations?.length) {
        translations = broadcast.translations;
      } else {
        try {
          translations = (await translationsService.readByQuery({
            filter: {
              notification_broadcast_id: { _eq: broadcastId },
            },
            fields: ["languages_code", "title", "body"],
            limit: -1,
          })) as Array<{
            languages_code: string;
            title: string;
            body: string;
          }>;
        } catch {
          logger.debug(
            "[Broadcast Processor] Could not fetch translations, using fallback fields",
          );
        }
      }

      let created = 0;
      let failed = 0;

      for (let i = 0; i < targetUsers.length; i += BATCH_SIZE) {
        const batch = targetUsers.slice(i, i + BATCH_SIZE);

        const results = await Promise.allSettled(
          batch.map(async (user) => {
            if (broadcast.channel === "push" && !user.push_enabled) {
              return { created: false };
            }

            const resolved = resolveTranslation({
              title: broadcast.title,
              body: broadcast.body,
              translations,
              user_language: user.language,
            });

            await notificationService.createOne({
              user: user.id,
              title: resolved.title,
              body: resolved.body,
              channel: broadcast.channel,
              priority: broadcast.priority ?? "normal",
              icon: broadcast.icon ?? null,
              icon_url: broadcast.icon_url ?? null,
              action_url: broadcast.action_url ?? null,
              data: broadcast.data ?? null,
              broadcast: broadcastId,
              date_expires: broadcast.date_expires ?? null,
            });

            return { created: true };
          }),
        );

        for (const result of results) {
          if (result.status === "fulfilled" && result.value.created) {
            created++;
          } else if (result.status === "rejected") {
            failed++;
            const reason = result.reason as { message?: string };
            logger.error("[Broadcast Processor] Failed to create notification", {
              broadcast_id: broadcastId,
              error: reason?.message ?? String(result.reason),
            });
          }
        }
      }

      await broadcastService.updateOne(broadcastId, {
        status: "completed",
        total_users: targetUsers.length,
        total_created: created,
        total_failed: failed,
        date_processed: new Date().toISOString(),
      });

      logger.info(
        `[Broadcast Processor] Broadcast ${broadcastId} completed: ${created}/${targetUsers.length} notifications created, ${failed} failed`,
      );
    } catch (error: unknown) {
      const err = error as { message?: string; stack?: string };
      logger.error("[Broadcast Processor] Error processing broadcast", {
        broadcast_id: broadcastId,
        error: err.message,
        stack: err.stack,
      });

      try {
        await broadcastService.updateOne(broadcastId, { status: "failed" });
      } catch {
        // ignore secondary failure
      }
    } finally {
      processingBroadcasts.delete(broadcastKey);
    }
  }

  action("items.create", async (meta, context) => {
    if (meta.collection !== "notification_broadcast") return;

    logger.info("[Broadcast Processor] Processing items.create", {
      key: meta.key,
    });

    await processBroadcast(
      meta.key as string,
      context,
      meta.payload as Partial<NotificationBroadcast>,
    );
  });

  action("items.update", async (meta, context) => {
    if (meta.collection !== "notification_broadcast") return;
    if (meta.payload?.status !== "processing") return;

    const broadcastId = Array.isArray(meta.keys) ? meta.keys[0] : meta.key;

    logger.info("[Broadcast Processor] Processing items.update → processing", {
      key: broadcastId,
    });

    await processBroadcast(
      broadcastId as string,
      context,
      meta.payload as Partial<NotificationBroadcast>,
    );
  });
});
