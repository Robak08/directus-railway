import { describe, it, expect } from "vitest";
import {
  vapidKeyToUint8Array,
  detectDeviceName,
  isPushSupported,
} from "./subscribe.js";

describe("subscribe helpers", () => {
  describe("vapidKeyToUint8Array", () => {
    it("deve converter base64url para Uint8Array", () => {
      // "Hello" em base64url = "SGVsbG8"
      const result = vapidKeyToUint8Array("SGVsbG8");
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(5);
      expect(result[0]).toBe(72); // 'H'
      expect(result[1]).toBe(101); // 'e'
      expect(result[4]).toBe(111); // 'o'
    });

    it("deve lidar com padding correto", () => {
      // base64url sem padding
      const result = vapidKeyToUint8Array("YQ"); // "a"
      expect(result.length).toBe(1);
      expect(result[0]).toBe(97); // 'a'
    });

    it("deve substituir caracteres base64url por base64", () => {
      // '-' → '+', '_' → '/'
      // "?>" em base64url = "Pz4" (contém caracteres comuns)
      const result = vapidKeyToUint8Array("Pz4");
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(2);
    });

    it("deve gerar Uint8Array com tamanho correto para VAPID key real", () => {
      // Uma VAPID key de 65 bytes codificada em base64url teria 88 chars
      const fakeVapidKey =
        "BEl62iUYgUivxIkv69yViXuGAqrz2kZS3XRb6YP6bWYWXSqWBcRhCPKw" +
        "p5FCasJqycZ2NszNqNysMa21EqCvdBI";
      const result = vapidKeyToUint8Array(fakeVapidKey);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(65);
    });
  });

  describe("detectDeviceName", () => {
    it("deve retornar 'Unknown Device' quando navigator não existe", () => {
      // Em ambiente node, navigator é undefined
      const originalNavigator = globalThis.navigator;
      // @ts-ignore -- testing without navigator
      delete globalThis.navigator;

      expect(detectDeviceName()).toBe("Unknown Device");

      // @ts-ignore -- restore
      globalThis.navigator = originalNavigator;
    });
  });

  describe("isPushSupported", () => {
    it("deve retornar false em ambiente Node.js (sem browser APIs)", () => {
      // Em vitest com environment: node, não temos PushManager
      expect(isPushSupported()).toBe(false);
    });
  });
});
