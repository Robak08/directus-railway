# Task 009 — Notificações em Grupo/Broadcast

Status: done
Type: feature
Assignee: TBD

## Description

Criar funcionalidade de envio de notificações para grupos de usuários (broadcast), permitindo especificar destinatários por roles, lista de usuários, ou filtros customizados. O sistema criará automaticamente uma `user_notification` individual para cada usuário do grupo, já com título e body resolvidos no idioma do usuário.

### Motivação

Atualmente, para enviar uma notificação para múltiplos usuários é necessário:

1. Criar manualmente uma `user_notification` para cada usuário
2. Não há tracking centralizado de notificações em massa
3. Não há forma de enviar para todos usuários de uma role específica

Com esta feature:

- ✅ Enviar para todos usuários com role "premium"
- ✅ Enviar para lista específica de usuários
- ✅ Enviar para todos usuários do sistema
- ✅ Criar automaticamente notificações individuais com idioma resolvido
- ✅ Tracking centralizado: quantas notificações foram geradas, quantas entregues, etc.

### Arquitetura Proposta

#### Nova coleção: `notification_broadcast`

Template de notificação em grupo que gera múltiplas `user_notification`:

**Campos:**

- `id` (uuid, PK)
- `title` (string) — Título fallback (quando usuário não tem idioma com tradução)
- `body` (text) — Corpo fallback
- `translations` (O2M → `notification_broadcast_translations`) — Traduções do template
- `target_type` (dropdown: 'all' | 'roles' | 'users' | 'filter') — Como definir destinatários
- `target_roles` (M2M → `directus_roles`) — Roles a receber (quando target_type='roles')
- `target_users` (M2M → `directus_users`) — Usuários específicos (quando target_type='users')
- `target_filter` (json) — Filtro customizado (quando target_type='filter')
- `channel` (dropdown: 'push', 'email', 'sms', 'in_app')
- `priority` (dropdown: 'low', 'normal', 'high', 'urgent')
- `icon` (M2O → `directus_files`)
- `icon_url` (string)
- `action_url` (string)
- `data` (json)
- `status` (dropdown: 'draft', 'processing', 'completed', 'failed')
- `total_users` (integer, readonly) — Quantos usuários foram alvo
- `total_created` (integer, readonly) — Quantas user_notification foram criadas
- `total_failed` (integer, readonly) — Quantas falharam na criação
- `user_created` (M2O → `directus_users`)
- `date_created` (timestamp)
- `date_processed` (timestamp)
- `date_expires` (timestamp)

#### Nova coleção: `notification_broadcast_translations`

Traduções do broadcast template:

**Campos:**

- `id` (integer, PK, auto-increment)
- `notification_broadcast_id` (M2O → `notification_broadcast`)
- `languages_code` (string) — Código do idioma (ex: `en-US`, `pt-BR`)
- `title` (string)
- `body` (text)

#### Relação com `user_notification`

Adicionar campo em `user_notification`:

- `broadcast_id` (M2O → `notification_broadcast`, nullable) — Referência ao broadcast que gerou esta notificação

Isso permite:

- Tracking: "Quais notificações individuais foram geradas por este broadcast?"
- Analytics: "Quantas pessoas leram a campanha X?"

### Fluxo de Funcionamento

#### 1. Criação do Broadcast

Admin cria um `notification_broadcast`:

```json
{
  "title": "System Maintenance",
  "body": "Our system will be under maintenance on Sunday",
  "translations": [
    {
      "languages_code": "pt-BR",
      "title": "Manutenção do Sistema",
      "body": "Nosso sistema entrará em manutenção no domingo"
    },
    {
      "languages_code": "es-ES",
      "title": "Mantenimiento del Sistema",
      "body": "Nuestro sistema estará en mantenimiento el domingo"
    }
  ],
  "target_type": "roles",
  "target_roles": ["admin", "premium"],
  "channel": "push",
  "priority": "high"
}
```

#### 2. Hook Processa o Broadcast

Novo hook `broadcast-processor` escuta `notification_broadcast.items.create`:

```typescript
action(
  "notification_broadcast.items.create",
  async ({ payload, key }, { schema, database }) => {
    const broadcast = { ...payload, id: key };

    // 1. Atualizar status para 'processing'
    await broadcastService.updateOne(broadcast.id, { status: "processing" });

    // 2. Resolver lista de usuários baseado no target_type
    const targetUsers = await resolveTargetUsers(broadcast, schema, database);

    // 3. Buscar traduções do broadcast
    const translations = await translationsService.readByQuery({
      filter: { notification_broadcast_id: { _eq: broadcast.id } },
    });

    // 4. Para cada usuário
    let created = 0;
    let failed = 0;

    for (const user of targetUsers) {
      try {
        // Verificar se usuário tem push habilitado
        if (!user.push_enabled && broadcast.channel === "push") {
          continue;
        }

        // Resolver tradução no idioma do usuário
        const resolved = resolveTranslation(
          translations,
          user.language,
          broadcast.title,
          broadcast.body,
        );

        // Criar user_notification individual
        await notificationService.createOne({
          user: user.id,
          title: resolved.title,
          body: resolved.body,
          channel: broadcast.channel,
          priority: broadcast.priority,
          icon: broadcast.icon,
          icon_url: broadcast.icon_url,
          action_url: broadcast.action_url,
          data: broadcast.data,
          broadcast_id: broadcast.id, // ⭐ Link para tracking
          date_expires: broadcast.date_expires,
        });

        created++;
      } catch (error) {
        logger.error(
          `Failed to create notification for user ${user.id}`,
          error,
        );
        failed++;
      }
    }

    // 5. Atualizar status final
    await broadcastService.updateOne(broadcast.id, {
      status: "completed",
      total_users: targetUsers.length,
      total_created: created,
      total_failed: failed,
      date_processed: new Date().toISOString(),
    });
  },
);
```

#### 3. Resolução de Usuários Alvo

Função `resolveTargetUsers()`:

```typescript
async function resolveTargetUsers(broadcast, schema, database) {
  const usersService = new ItemsService("directus_users", {
    schema,
    knex: database,
  });

  switch (broadcast.target_type) {
    case "all":
      // Todos usuários ativos
      return await usersService.readByQuery({
        filter: { status: { _eq: "active" } },
        fields: ["id", "push_enabled", "language"],
        limit: -1,
      });

    case "roles":
      // Usuários com roles específicas
      return await usersService.readByQuery({
        filter: {
          status: { _eq: "active" },
          role: { _in: broadcast.target_roles },
        },
        fields: ["id", "push_enabled", "language"],
        limit: -1,
      });

    case "users":
      // Lista específica de usuários
      return await usersService.readByQuery({
        filter: {
          id: { _in: broadcast.target_users },
        },
        fields: ["id", "push_enabled", "language"],
        limit: -1,
      });

    case "filter":
      // Filtro customizado (JSON filter)
      return await usersService.readByQuery({
        filter: broadcast.target_filter,
        fields: ["id", "push_enabled", "language"],
        limit: -1,
      });

    default:
      throw new Error(`Invalid target_type: ${broadcast.target_type}`);
  }
}
```

### Vantagens da Arquitetura

1. **Idioma Resolvido na Criação:**
   - Cada `user_notification` já tem `title` e `body` no idioma do usuário
   - Sem necessidade de resolver idioma no momento do push
   - Hook `notification-trigger` continua funcionando normalmente

2. **Tracking Granular:**
   - `notification_broadcast`: quantas notificações foram criadas, status geral
   - `user_notification`: status por usuário (enviada, lida, etc.)
   - `push_delivery`: status por dispositivo

3. **Compatibilidade:**
   - Sistema de push existente (`notification-trigger`) continua funcionando
   - Apenas adiciona camada de "template" acima
   - Sem breaking changes

4. **Flexibilidade:**
   - Enviar para grupos pré-definidos (roles)
   - Enviar para usuários específicos
   - Enviar com filtro customizado (ex: `country: "BR", premium: true`)

### Casos de Uso

#### 1. Notificação para admins

```json
{
  "title": "Security Alert",
  "target_type": "roles",
  "target_roles": ["admin"],
  "channel": "push",
  "priority": "urgent"
}
```

#### 2. Campanha para todos usuários premium

```json
{
  "title": "New Premium Feature Available",
  "target_type": "filter",
  "target_filter": {
    "subscription_type": { "_eq": "premium" },
    "status": { "_eq": "active" }
  },
  "channel": "push",
  "priority": "normal"
}
```

#### 3. Notificação para lista específica

```json
{
  "title": "Welcome to Beta Testing",
  "target_type": "users",
  "target_users": ["user-uuid-1", "user-uuid-2", "user-uuid-3"],
  "channel": "push",
  "priority": "normal"
}
```

## Estrutura de Arquivos

```
src/
  broadcast-processor/
    _types.ts              # Tipos TypeScript
    index.ts               # Hook principal
    resolve-target.ts      # Função resolveTargetUsers
    resolve-target.test.ts # Testes unitários

  db-configuration/
    index.ts               # Adicionar coleções notification_broadcast e translation
```

## Abordagem TDD

### Testes Unitários

**`resolve-target.test.ts`:**

- ✅ Deve retornar todos usuários quando target_type='all'
- ✅ Deve retornar apenas usuários com roles especificadas
- ✅ Deve retornar apenas usuários da lista target_users
- ✅ Deve aplicar filtro customizado corretamente
- ✅ Deve incluir campos necessários (id, push_enabled, language)

### Testes de Integração

**`broadcast-flow.test.ts`:**

- ✅ Deve criar user_notification para cada usuário do grupo
- ✅ Deve resolver tradução no idioma de cada usuário
- ✅ Deve atualizar counters (total_users, total_created)
- ✅ Deve criar link broadcast_id em cada user_notification
- ✅ Deve disparar push automaticamente (hook notification-trigger)
- ✅ Não deve criar notificação para usuário com push_enabled=false
- ✅ Deve usar fallback quando idioma do usuário não tem tradução

## Tasks

- [x] Escrever testes unitários para `resolveTargetUsers()`
- [x] Escrever testes de integração para fluxo completo
- [x] Criar coleção `notification_broadcast` em `db-configuration`
- [x] Criar coleção `notification_broadcast_translations`
- [x] Adicionar campo `broadcast` em `user_notification`
- [x] Configurar relações M2M para roles e users
- [x] Configurar interface `translations` no campo translations
- [x] Criar tipos TypeScript em `broadcast-processor/_types.ts`
- [x] Implementar hook `broadcast-processor/index.ts`
- [x] Implementar função `resolveTargetUsers()`
- [x] Integrar com `resolveTranslation()` do notification-trigger
- [x] Adicionar logs estruturados para debugging
- [x] Rodar `pnpm validate` sem erros
- [x] Criar documentação no README sobre broadcast notifications
- [x] Adicionar exemplos de uso no CONTRIBUTING.md

## Implementation Summary

- `notification_broadcast` template collection with translations, M2M targeting (roles/users), and status counters
- `broadcast-processor` hook fans out to `user_notification` records with per-user i18n resolution
- SDK: `NotificationBroadcast` types and `PushNotificationClient.createBroadcast()`
- Tests: `tests/unit/resolve-target.test.ts`, `tests/integration/broadcast-flow.test.ts`, E2E schema assertions

## Considerações de Performance

### Processamento Assíncrono

Para broadcasts grandes (ex: 10.000+ usuários), considerar:

1. **Queue System** (futuro):
   - Usar Directus Flow ou job queue externa
   - Processar em background
   - Status updates progressivos

2. **Batching**:
   - Criar notificações em lotes de 100-500
   - Commit transacional por lote

3. **Rate Limiting**:
   - Limitar pushes simultâneos
   - Respeitar limites do web-push service

### Exemplo de Implementação com Batches

```typescript
const BATCH_SIZE = 100;

for (let i = 0; i < targetUsers.length; i += BATCH_SIZE) {
  const batch = targetUsers.slice(i, i + BATCH_SIZE);

  const promises = batch.map((user) =>
    createNotificationForUser(user, broadcast, translations),
  );

  await Promise.allSettled(promises);

  // Update progress
  await broadcastService.updateOne(broadcast.id, {
    total_created: i + batch.length,
  });
}
```

## Questões em Aberto

1. **Duplicação de dados:**
   - Título/body são copiados para cada `user_notification`
   - Alternativa: manter apenas `broadcast_id` e resolver na leitura?
   - **Decisão recomendada:** Copiar dados (melhor performance na leitura, tracking imutável)

2. **Limite de destinatários:**
   - Deve haver limite máximo? (ex: 50.000 usuários por broadcast)
   - Como comunicar ao admin em caso de timeout?
   - **Decisão recomendada:** Implementar warning no frontend, processar em background

3. **Edição de broadcasts:**
   - Permitir editar broadcast após processado?
   - **Decisão recomendada:** Não permitir edição após status='processing', apenas draft

4. **Cancelamento:**
   - Como cancelar broadcast em processamento?
   - **Decisão recomendada:** Fase 2 (adicionar flag cancel_requested)

## Referências

- Firebase Cloud Messaging Topics: https://firebase.google.com/docs/cloud-messaging/android/topic-messaging
- OneSignal Segments: https://documentation.onesignal.com/docs/segmentation
- Directus Flows: https://docs.directus.io/app/flows.html
- Task 007 (i18n): Reutilizar lógica de `resolveTranslation()`
