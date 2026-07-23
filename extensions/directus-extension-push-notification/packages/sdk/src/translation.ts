/**
 * Push Notification SDK — Translation Resolution
 *
 * Função pura para resolver title/body no idioma correto.
 * Re-exportada do SDK para uso em projetos externos.
 */

import type { TranslationSource, ResolvedTranslation } from "./types.js";

export const DEFAULT_FALLBACK_LANGUAGE = "en-US";

/**
 * Resolve title e body da notificação com base no idioma do usuário.
 *
 * Cadeia de fallback:
 * 1. Tradução no idioma do usuário (`user_language`)
 * 2. Tradução no idioma fallback (`fallback_language`, padrão: `"en-US"`)
 * 3. Campos `title`/`body` diretos (fallback final)
 *
 * Comparação de idioma é case-insensitive (BCP 47).
 *
 * @example
 * ```ts
 * const resolved = resolveTranslation({
 *   title: "Default",
 *   body: "Default body",
 *   translations: [
 *     { languages_code: "pt-BR", title: "Olá", body: "Mundo" },
 *     { languages_code: "en-US", title: "Hello", body: "World" },
 *   ],
 *   user_language: "pt-BR",
 * });
 * // => { title: "Olá", body: "Mundo" }
 * ```
 */
export function resolveTranslation(
  source: TranslationSource,
): ResolvedTranslation {
  const {
    title,
    body,
    translations,
    user_language,
    fallback_language = DEFAULT_FALLBACK_LANGUAGE,
  } = source;

  if (!translations || translations.length === 0) {
    return { title, body };
  }

  const findByLang = (lang: string) =>
    translations.find(
      (t) => t.languages_code.toLowerCase() === lang.toLowerCase(),
    );

  // 1. Idioma do usuário
  if (user_language) {
    const match = findByLang(user_language);
    if (match) {
      return { title: match.title, body: match.body };
    }
  }

  // 2. Idioma fallback
  const fallback = findByLang(fallback_language);
  if (fallback) {
    return { title: fallback.title, body: fallback.body };
  }

  // 3. Campos diretos
  return { title, body };
}
