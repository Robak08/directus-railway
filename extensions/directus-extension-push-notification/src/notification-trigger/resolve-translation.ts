/**
 * Resolve title e body da notificação com base no idioma do usuário.
 *
 * Cadeia de fallback:
 * 1. Tradução no idioma do usuário (user_language)
 * 2. Tradução no idioma fallback (fallback_language, padrão: "en-US")
 * 3. Campos title/body diretos da user_notification (fallback final)
 */

export const DEFAULT_FALLBACK_LANGUAGE = "en-US";

export interface TranslationRecord {
  languages_code: string;
  title: string;
  body: string;
}

export interface TranslationSource {
  /** Título direto da user_notification (fallback final) */
  title: string;
  /** Body direto da user_notification (fallback final) */
  body: string;
  /** Traduções disponíveis (via junction table) */
  translations?: TranslationRecord[];
  /** Idioma preferido do usuário (directus_users.language) */
  user_language?: string | null;
  /** Idioma fallback customizado (padrão: "en-US") */
  fallback_language?: string;
}

export interface ResolvedTranslation {
  title: string;
  body: string;
}

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

  // Se não há traduções, usar campos diretos
  if (!translations || translations.length === 0) {
    return { title, body };
  }

  // Comparação case-insensitive (BCP 47 pode vir como "pt-br" ou "pt-BR")
  const findByLang = (lang: string) =>
    translations.find(
      (t) => t.languages_code.toLowerCase() === lang.toLowerCase(),
    );

  // 1. Tentar idioma do usuário
  if (user_language) {
    const userTranslation = findByLang(user_language);
    if (userTranslation) {
      return { title: userTranslation.title, body: userTranslation.body };
    }
  }

  // 2. Tentar idioma fallback
  const fallbackTranslation = findByLang(fallback_language);
  if (fallbackTranslation) {
    return { title: fallbackTranslation.title, body: fallbackTranslation.body };
  }

  // 3. Fallback final: campos diretos
  return { title, body };
}
