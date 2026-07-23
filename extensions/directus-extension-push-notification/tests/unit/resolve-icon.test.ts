import { describe, it, expect } from "vitest";
import { resolveIconUrl } from "../../src/notification-trigger/resolve-icon.js";

const NOTIFICATION_ID = "notif-abc-123";

describe("resolveIconUrl", () => {
  describe("Caso 1: Ícone via arquivo do Directus (campo icon)", () => {
    it("deve retornar URL do endpoint /push-notification/icon/:id quando icon está preenchido", () => {
      const result = resolveIconUrl({
        notification_id: NOTIFICATION_ID,
        icon: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      });

      expect(result).toBe(`/push-notification/icon/${NOTIFICATION_ID}`);
    });

    it("deve usar endpoint quando ambos icon e icon_url estão preenchidos", () => {
      const result = resolveIconUrl({
        notification_id: NOTIFICATION_ID,
        icon: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        icon_url: "https://example.com/external-icon.png",
      });

      expect(result).toBe(`/push-notification/icon/${NOTIFICATION_ID}`);
    });

    it("deve ignorar icon quando é string vazia e usar icon_url via endpoint", () => {
      const result = resolveIconUrl({
        notification_id: NOTIFICATION_ID,
        icon: "",
        icon_url: "https://example.com/icon.png",
      });

      expect(result).toBe(`/push-notification/icon/${NOTIFICATION_ID}`);
    });

    it("deve ignorar icon quando é null e usar icon_url via endpoint", () => {
      const result = resolveIconUrl({
        notification_id: NOTIFICATION_ID,
        icon: null,
        icon_url: "https://example.com/icon.png",
      });

      expect(result).toBe(`/push-notification/icon/${NOTIFICATION_ID}`);
    });
  });

  describe("Caso 2: Ícone via URL externa (campo icon_url)", () => {
    it("deve retornar URL do endpoint quando apenas icon_url está preenchido", () => {
      const result = resolveIconUrl({
        notification_id: NOTIFICATION_ID,
        icon_url: "https://example.com/my-icon.png",
      });

      expect(result).toBe(`/push-notification/icon/${NOTIFICATION_ID}`);
    });

    it("deve retornar URL do endpoint quando icon é undefined e icon_url preenchido", () => {
      const result = resolveIconUrl({
        notification_id: NOTIFICATION_ID,
        icon: undefined,
        icon_url: "https://cdn.example.com/notification-icon.png",
      });

      expect(result).toBe(`/push-notification/icon/${NOTIFICATION_ID}`);
    });

    it("deve retornar fallback /admin/favicon.ico quando nem icon nem icon_url estão preenchidos", () => {
      const result = resolveIconUrl({ notification_id: NOTIFICATION_ID });

      expect(result).toBe("/admin/favicon.ico");
    });

    it("deve retornar fallback quando ambos são null", () => {
      const result = resolveIconUrl({
        notification_id: NOTIFICATION_ID,
        icon: null,
        icon_url: null,
      });

      expect(result).toBe("/admin/favicon.ico");
    });

    it("deve retornar fallback quando ambos são undefined", () => {
      const result = resolveIconUrl({
        notification_id: NOTIFICATION_ID,
        icon: undefined,
        icon_url: undefined,
      });

      expect(result).toBe("/admin/favicon.ico");
    });

    it("deve retornar fallback quando ambos são strings vazias", () => {
      const result = resolveIconUrl({
        notification_id: NOTIFICATION_ID,
        icon: "",
        icon_url: "",
      });

      expect(result).toBe("/admin/favicon.ico");
    });
  });

  describe("Caso 3: Sem notification_id", () => {
    it("deve retornar fallback quando notification_id é null mesmo com icon preenchido", () => {
      const result = resolveIconUrl({
        notification_id: null,
        icon: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      });

      expect(result).toBe("/admin/favicon.ico");
    });

    it("deve retornar fallback quando notification_id é undefined mesmo com icon_url preenchido", () => {
      const result = resolveIconUrl({
        icon_url: "https://example.com/icon.png",
      });

      expect(result).toBe("/admin/favicon.ico");
    });
  });
});
