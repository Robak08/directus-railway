/**
 * Endpoint para servir o script client-side de Push Notifications
 *
 * Serve o JavaScript que gerencia registro de Service Worker e subscriptions
 * no frontend do Directus, com variáveis de ambiente interpoladas
 */
import { defineEndpoint } from "@directus/extensions-sdk";
import { getClientScript } from "./client-script.js";

export default defineEndpoint((router, { env, logger }) => {
  // Serve o client script com variáveis de ambiente interpoladas
  router.get("/client.js", (_req, res) => {
    logger.debug("[Push Client Script] Serving client script");

    try {
      const vapidPublicKey = env["PUSH_PUBLIC_VAPID_KEY"] || "";
      const publicUrl = env["PUBLIC_URL"] || "";

      const clientScript = getClientScript(vapidPublicKey, publicUrl);

      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.send(clientScript);
    } catch (error) {
      logger.error(
        "[Push Client Script] Failed to generate client script",
        error,
      );
      res.status(500).json({ error: "Failed to generate client script" });
    }
  });
});
