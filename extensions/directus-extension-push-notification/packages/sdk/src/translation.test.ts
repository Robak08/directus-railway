import { describe, it, expect } from "vitest";
import {
  resolveTranslation,
  DEFAULT_FALLBACK_LANGUAGE,
} from "./translation.js";

describe("resolveTranslation (SDK)", () => {
  it("deve resolver idioma do usuário", () => {
    const result = resolveTranslation({
      title: "Default",
      body: "Default body",
      translations: [
        { languages_code: "en-US", title: "Hello", body: "World" },
        { languages_code: "pt-BR", title: "Olá", body: "Mundo" },
      ],
      user_language: "pt-BR",
    });

    expect(result).toEqual({ title: "Olá", body: "Mundo" });
  });

  it("deve cair no fallback quando idioma do usuário não existe", () => {
    const result = resolveTranslation({
      title: "Default",
      body: "Default body",
      translations: [
        { languages_code: "en-US", title: "Hello", body: "World" },
      ],
      user_language: "fr-FR",
    });

    expect(result).toEqual({ title: "Hello", body: "World" });
  });

  it("deve usar campos diretos quando não há traduções", () => {
    const result = resolveTranslation({
      title: "Direct",
      body: "Direct body",
      user_language: "pt-BR",
    });

    expect(result).toEqual({ title: "Direct", body: "Direct body" });
  });

  it("deve comparar case-insensitive", () => {
    const result = resolveTranslation({
      title: "Default",
      body: "Default body",
      translations: [{ languages_code: "PT-BR", title: "Olá", body: "Mundo" }],
      user_language: "pt-br",
    });

    expect(result).toEqual({ title: "Olá", body: "Mundo" });
  });

  it("deve usar fallback quando user_language é null", () => {
    const result = resolveTranslation({
      title: "Default",
      body: "Default body",
      translations: [
        { languages_code: "en-US", title: "Hello", body: "World" },
      ],
      user_language: null,
    });

    expect(result).toEqual({ title: "Hello", body: "World" });
  });

  it("deve aceitar fallback_language customizado", () => {
    const result = resolveTranslation({
      title: "Default",
      body: "Default body",
      translations: [{ languages_code: "pt-BR", title: "Olá", body: "Mundo" }],
      user_language: "de-DE",
      fallback_language: "pt-BR",
    });

    expect(result).toEqual({ title: "Olá", body: "Mundo" });
  });

  it("deve exportar DEFAULT_FALLBACK_LANGUAGE como en-US", () => {
    expect(DEFAULT_FALLBACK_LANGUAGE).toBe("en-US");
  });
});
