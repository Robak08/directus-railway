const DEFAULT_ICON = "/admin/favicon.ico";

interface IconSource {
  notification_id?: string | null;
  icon?: string | null;
  icon_url?: string | null;
}

/**
 * Resolve a URL do ícone para push notification.
 *
 * Prioridade:
 * 1. `icon` (ID de arquivo no Directus) → `/push-notification/icon/{notification_id}`
 *    O endpoint dedicado faz proxy do asset com transformação 192×192px,
 *    sem exigir autenticação.
 * 2. `icon_url` (URL externa) → `/push-notification/icon/{notification_id}`
 *    O endpoint faz redirect (302) para a URL externa.
 * 3. Fallback → `/admin/favicon.ico`
 *
 * Quando há icon ou icon_url, o endpoint é usado para:
 * - Evitar expor directus_files publicamente
 * - Aplicar transformação de imagem automaticamente
 * - Centralizar o acesso ao ícone em um único URL público
 */
export function resolveIconUrl(source: IconSource): string {
  if (source.icon || source.icon_url) {
    if (source.notification_id) {
      return `/push-notification/icon/${source.notification_id}`;
    }
  }

  return DEFAULT_ICON;
}
