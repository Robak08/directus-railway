/**
 * Hook para injetar o script de Push Notification no frontend do Directus
 *
 * Injeta apenas uma tag <script> que referencia o arquivo JavaScript externo.
 * O script real é servido pelo endpoint /push-client-script/client.js
 * com as variáveis de ambiente já interpoladas.
 *
 * Benefícios:
 * - Não requer CSP relaxado (unsafe-inline)
 * - Melhor segurança
 * - Cache do navegador pode ser usado
 */
import { defineHook } from "@directus/extensions-sdk";

export default defineHook(({ embed }) => {
  // Injeta apenas a referência ao script externo
  const scriptTag = '<script src="/push-client-script/client.js"></script>';

  embed("body", scriptTag);
});
