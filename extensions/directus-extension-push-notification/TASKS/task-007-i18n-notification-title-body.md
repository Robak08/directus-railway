# Task 007 — Suporte a Multi-idioma no Título e Body da Notificação

Status: done
Type: feature
Assignee: Sidarta Veloso

## Description

Adicionar suporte a internacionalização (i18n) nos campos `title` e `body` da coleção `user_notification`. O conteúdo da notificação será cadastrado em múltiplos idiomas, e no momento do envio, o sistema resolverá automaticamente o idioma preferido do usuário a partir do campo `language` da coleção `directus_users`.

### Como funciona

1. **Cadastro:** O usuário admin cadastra `title` e `body` usando o campo `translations` (interface nativa do Directus para i18n), informando as versões em cada idioma suportado (ex: `en-US`, `pt-BR`)
2. **Envio:** Ao disparar a notificação, o sistema:
   - Consulta o campo `language` do usuário destinatário em `directus_users`
   - Resolve `title` e `body` no idioma correspondente
   - Se o idioma do usuário não tiver tradução disponível, usa um idioma fallback (ex: `en-US`)
3. **Payload:** O service worker recebe `title` e `body` já resolvidos no idioma correto — sem lógica de i18n no client-side

### Estrutura de dados

Opção recomendada: usar uma **coleção de traduções** (padrão Directus):

- `user_notification_translations` (nova coleção)
  - `id` (integer, PK, auto-increment)
  - `user_notification_id` (M2O → `user_notification`)
  - `languages_code` (string — código do idioma, ex: `en-US`, `pt-BR`)
  - `title` (string — título traduzido)
  - `body` (text — corpo traduzido)

- Na coleção `user_notification`:
  - Adicionar campo `translations` (O2M → `user_notification_translations`, interface `translations`)
  - Os campos `title` e `body` originais podem ser mantidos como fallback ou removidos após migração

### Resolução do idioma

```
idioma_usuario = directus_users.language  (ex: "pt-BR")

1. Buscar tradução onde languages_code == idioma_usuario
2. Se não encontrada, buscar tradução onde languages_code == idioma_fallback (ex: "en-US")
3. Se nenhuma tradução encontrada, usar title/body diretamente da user_notification (fallback final)
```

## Abordagem TDD

Esta task **deve ser implementada usando TDD (Test-Driven Development)**.

### Caso 1: Envio no idioma do usuário

1. Escrever teste que cria uma notificação com traduções em `en-US` e `pt-BR`
2. Escrever teste que verifica que, para um usuário com `language: "pt-BR"`, o payload enviado contém `title` e `body` em português
3. Escrever teste que verifica que, para um usuário com `language: "en-US"`, o payload enviado contém `title` e `body` em inglês
4. Implementar a funcionalidade até os testes passarem

### Caso 2: Fallback de idioma

1. Escrever teste que verifica que, quando o idioma do usuário (ex: `fr-FR`) não possui tradução, o sistema usa o idioma fallback (`en-US`)
2. Escrever teste que verifica que, quando nenhuma tradução existe, o sistema usa `title`/`body` diretamente da `user_notification`
3. Escrever teste que verifica que, quando o campo `language` do usuário é `null`, o sistema usa o idioma fallback
4. Implementar a funcionalidade até os testes passarem

## Tasks

- [x] Escrever testes para o caso 1 (envio no idioma do usuário)
- [x] Escrever testes para o caso 2 (fallback de idioma)
- [x] Criar coleção `user_notification_translations` em `directus-state.json`
- [x] Configurar campos: `id`, `user_notification_id`, `languages_code`, `title`, `body`
- [x] Adicionar relação O2M `user_notification.translations` → `user_notification_translations`
- [x] Configurar interface `translations` no campo `translations` da `user_notification`
- [x] Atualizar `_types.ts` — adicionar tipos para traduções
- [x] Atualizar `notification-trigger/index.ts` — buscar `language` do usuário em `directus_users`
- [x] Implementar lógica de resolução de idioma (usuário → fallback → direto)
- [x] Adicionar traduções i18n para os novos campos (en-US, pt-BR)
- [x] Verificar que todos os testes passam
- [x] Rodar `pnpm validate` sem erros

## Referências

- [Directus Translations interface](https://docs.directus.io/app/data-model/fields/translations.html)
- [Directus Users — language field](https://docs.directus.io/reference/system/users.html)
- [Content Translations pattern](https://docs.directus.io/guides/headless-cms/content-translations.html)
