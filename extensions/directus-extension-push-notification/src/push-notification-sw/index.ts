/**
 * Endpoint para servir o Service Worker de Push Notifications
 *
 * O Service Worker precisa ser servido de uma URL acessível pelo navegador.
 * Lê o arquivo service-worker.js empacotado com a extensão
 */
import { defineEndpoint } from "@directus/extensions-sdk";
import { readInnerFile } from "../utils/files.js";

export default defineEndpoint((router, { logger }) => {
  // Serve o Service Worker
  router.get("/sw.js", (_req, res) => {
    logger.debug("[Push Notification SW] Serving service worker");

    try {
      const serviceWorkerCode = readInnerFile("service-worker.js");

      res.setHeader("Content-Type", "application/javascript");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Service-Worker-Allowed", "/");
      res.send(serviceWorkerCode);
    } catch (error) {
      logger.error(
        "[Push Notification SW] Failed to load service worker file",
        error,
      );
      res.status(500).json({ error: "Failed to load service worker" });
    }
  });

  // Endpoint de health check
  router.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "push-notification-sw",
      timestamp: new Date().toISOString(),
    });
  });
});
