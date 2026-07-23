import { defineEndpoint } from "@directus/extensions-sdk";

/**
 * Mock Push Server - Simula um servidor de push notifications para testes
 * Responde como se fosse Firebase Cloud Messaging ou Apple Push Notification Service
 */
export default defineEndpoint({
  id: "mock-push-server",
  handler: (router, { logger }) => {
    // Endpoints de erro devem vir ANTES do wildcard catch-all

    // Endpoint para simular erro 410 Gone
    router.post("/error/410", (_req, res) => {
      logger.info("[Mock Push Server] Simulating 410 Gone");
      res.status(410).json({
        error: "Gone",
        message: "The subscription has expired or is no longer valid",
      });
    });

    // Endpoint para simular erro 404
    router.post("/error/404", (_req, res) => {
      logger.info("[Mock Push Server] Simulating 404 Not Found");
      res.status(404).json({
        error: "Not Found",
        message: "The endpoint was not found",
      });
    });

    // Endpoint principal que aceita qualquer POST (catch-all, deve ser o último)
    router.post("/*", (req, res) => {
      const body = req.body;
      const headers = req.headers;

      // Log para debug
      logger.info("[Mock Push Server] Received push request:", {
        path: req.path,
        headers: {
          authorization: headers.authorization ? "present" : "missing",
          "content-type": headers["content-type"],
        },
        body: body ? "present" : "empty",
      });

      // Simular resposta de sucesso (como Firebase/APNS)
      res.status(201).json({
        success: true,
        messageId: `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
      });
    });

    // Health check
    router.get("/health", (_req, res) => {
      res.json({
        status: "ok",
        service: "mock-push-server",
        timestamp: new Date().toISOString(),
      });
    });
  },
});
