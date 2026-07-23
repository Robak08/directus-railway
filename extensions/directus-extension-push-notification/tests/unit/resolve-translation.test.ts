import { describe, it, expect } from "vitest";
import {
  resolveTranslation,
  DEFAULT_FALLBACK_LANGUAGE,
} from "../../src/notification-trigger/resolve-translation.js";

describe("resolveTranslation", () => {
  describe("Caso 1: Envio no idioma do usuário", () => {
    it("deve retornar title/body em pt-BR quando usuário tem language pt-BR", () => {
      const result = resolveTranslation({
        title: "Default Title",
        body: "Default Body",
        translations: [
          {
            languages_code: "en-US",
            title: "English Title",
            body: "English Body",
          },
          {
            languages_code: "pt-BR",
            title: "Título em Português",
            body: "Corpo em Português",
          },
        ],
        user_language: "pt-BR",
      });

      expect(result.title).toBe("Título em Português");
      expect(result.body).toBe("Corpo em Português");
    });

    it("deve retornar title/body em en-US quando usuário tem language en-US", () => {
      const result = resolveTranslation({
        title: "Default Title",
        body: "Default Body",
        translations: [
          {
            languages_code: "en-US",
            title: "English Title",
            body: "English Body",
          },
          {
            languages_code: "pt-BR",
            title: "Título em Português",
            body: "Corpo em Português",
          },
        ],
        user_language: "en-US",
      });

      expect(result.title).toBe("English Title");
      expect(result.body).toBe("English Body");
    });

    it("deve retornar tradução correta quando há muitos idiomas disponíveis", () => {
      const result = resolveTranslation({
        title: "Default Title",
        body: "Default Body",
        translations: [
          {
            languages_code: "en-US",
            title: "English Title",
            body: "English Body",
          },
          {
            languages_code: "pt-BR",
            title: "Título em Português",
            body: "Corpo em Português",
          },
          {
            languages_code: "es-ES",
            title: "Título en Español",
            body: "Cuerpo en Español",
          },
          {
            languages_code: "fr-FR",
            title: "Titre en Français",
            body: "Corps en Français",
          },
        ],
        user_language: "es-ES",
      });

      expect(result.title).toBe("Título en Español");
      expect(result.body).toBe("Cuerpo en Español");
    });
  });

  describe("Caso 2: Fallback de idioma", () => {
    it("deve usar idioma fallback (en-US) quando idioma do usuário não tem tradução", () => {
      const result = resolveTranslation({
        title: "Default Title",
        body: "Default Body",
        translations: [
          {
            languages_code: "en-US",
            title: "English Title",
            body: "English Body",
          },
          {
            languages_code: "pt-BR",
            title: "Título em Português",
            body: "Corpo em Português",
          },
        ],
        user_language: "fr-FR",
      });

      expect(result.title).toBe("English Title");
      expect(result.body).toBe("English Body");
    });

    it("deve usar title/body direto quando nenhuma tradução existe", () => {
      const result = resolveTranslation({
        title: "Direct Title",
        body: "Direct Body",
        translations: [],
        user_language: "pt-BR",
      });

      expect(result.title).toBe("Direct Title");
      expect(result.body).toBe("Direct Body");
    });

    it("deve usar title/body direto quando translations é undefined", () => {
      const result = resolveTranslation({
        title: "Direct Title",
        body: "Direct Body",
        user_language: "pt-BR",
      });

      expect(result.title).toBe("Direct Title");
      expect(result.body).toBe("Direct Body");
    });

    it("deve usar idioma fallback quando language do usuário é null", () => {
      const result = resolveTranslation({
        title: "Default Title",
        body: "Default Body",
        translations: [
          {
            languages_code: "en-US",
            title: "English Title",
            body: "English Body",
          },
          {
            languages_code: "pt-BR",
            title: "Título em Português",
            body: "Corpo em Português",
          },
        ],
        user_language: null,
      });

      expect(result.title).toBe("English Title");
      expect(result.body).toBe("English Body");
    });

    it("deve usar idioma fallback quando language do usuário é undefined", () => {
      const result = resolveTranslation({
        title: "Default Title",
        body: "Default Body",
        translations: [
          {
            languages_code: "en-US",
            title: "English Title",
            body: "English Body",
          },
        ],
      });

      expect(result.title).toBe("English Title");
      expect(result.body).toBe("English Body");
    });

    it("deve usar title/body direto quando idioma do usuário e fallback não têm tradução", () => {
      const result = resolveTranslation({
        title: "Direct Title",
        body: "Direct Body",
        translations: [
          {
            languages_code: "de-DE",
            title: "Deutscher Titel",
            body: "Deutscher Text",
          },
        ],
        user_language: "ja-JP",
      });

      expect(result.title).toBe("Direct Title");
      expect(result.body).toBe("Direct Body");
    });

    it("deve usar title/body direto quando translations é null", () => {
      const result = resolveTranslation({
        title: "Direct Title",
        body: "Direct Body",
        translations: null as unknown as undefined,
        user_language: "pt-BR",
      });

      expect(result.title).toBe("Direct Title");
      expect(result.body).toBe("Direct Body");
    });
  });

  describe("Caso 3: Fallback language customizado", () => {
    it("deve usar fallback language customizado quando fornecido", () => {
      const result = resolveTranslation({
        title: "Default Title",
        body: "Default Body",
        translations: [
          {
            languages_code: "pt-BR",
            title: "Título em Português",
            body: "Corpo em Português",
          },
        ],
        user_language: "ja-JP",
        fallback_language: "pt-BR",
      });

      expect(result.title).toBe("Título em Português");
      expect(result.body).toBe("Corpo em Português");
    });

    it("deve usar title/body direto quando nem user_language nem fallback customizado têm tradução", () => {
      const result = resolveTranslation({
        title: "Direct Title",
        body: "Direct Body",
        translations: [
          {
            languages_code: "de-DE",
            title: "Deutscher Titel",
            body: "Deutscher Text",
          },
        ],
        user_language: "ja-JP",
        fallback_language: "fr-FR",
      });

      expect(result.title).toBe("Direct Title");
      expect(result.body).toBe("Direct Body");
    });
  });

  describe("Caso 4: Testes de borda", () => {
    it("deve fazer match case-insensitive (pt-br → pt-BR)", () => {
      const result = resolveTranslation({
        title: "Default Title",
        body: "Default Body",
        translations: [
          {
            languages_code: "pt-BR",
            title: "Título em Português",
            body: "Corpo em Português",
          },
        ],
        user_language: "pt-br",
      });

      expect(result.title).toBe("Título em Português");
      expect(result.body).toBe("Corpo em Português");
    });

    it("deve fazer match case-insensitive no fallback (EN-US → en-US)", () => {
      const result = resolveTranslation({
        title: "Default Title",
        body: "Default Body",
        translations: [
          {
            languages_code: "en-US",
            title: "English Title",
            body: "English Body",
          },
        ],
        user_language: "ja-JP",
        fallback_language: "EN-US",
      });

      expect(result.title).toBe("English Title");
      expect(result.body).toBe("English Body");
    });

    it("deve tratar user_language como string vazia igual a ausente (cai no fallback)", () => {
      const result = resolveTranslation({
        title: "Default Title",
        body: "Default Body",
        translations: [
          {
            languages_code: "en-US",
            title: "English Title",
            body: "English Body",
          },
        ],
        user_language: "",
      });

      expect(result.title).toBe("English Title");
      expect(result.body).toBe("English Body");
    });

    it("deve retornar tradução com título/body vazio se a tradução existir assim", () => {
      const result = resolveTranslation({
        title: "Default Title",
        body: "Default Body",
        translations: [
          {
            languages_code: "pt-BR",
            title: "",
            body: "",
          },
        ],
        user_language: "pt-BR",
      });

      expect(result.title).toBe("");
      expect(result.body).toBe("");
    });
  });

  describe("Constantes exportadas", () => {
    it("deve exportar DEFAULT_FALLBACK_LANGUAGE como en-US", () => {
      expect(DEFAULT_FALLBACK_LANGUAGE).toBe("en-US");
    });
  });
});
