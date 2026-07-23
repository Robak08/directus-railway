# Task 005 — Standardize Field Nomenclature

Status: in-progress
Type: refactor
Assignee: Sidarta Veloso

## Description

Align field names with Directus conventions (`date_*` for timestamps, `user_*` for user references, no `_id` suffix for relations).

**Summary:**

- 13 unique field renames across 3 collections (16 field occurrences total)
- 2 new O2M virtual fields (deliveries on user_notification and push_subscription)
- 3 display_template updates
- 2 sort_field updates
- 1 special field fix (queued_at)
- Interface/display fixes for user and datetime fields
- Relations array: 6 M2O + 2 O2M relations
- i18n support: en-US and pt-BR translations (3 collections + 37 fields)

## Field Mapping

| Current Name           | Standard Name    | Collection        | Note                                    | Special                      |
| ---------------------- | ---------------- | ----------------- | --------------------------------------- | ---------------------------- |
| `created_by`           | `user_created`   | user_notification | User who created this notification      | `["user-created"]` ✅        |
| `created_at`           | `date_created`   | user_notification | When this notification was created      | `["date-created"]` ✅        |
| `created_at`           | `date_created`   | push_subscription | When this subscription was created      | `["date-created"]` ✅        |
| `queued_at`            | `date_queued`    | push_delivery     | When delivery was queued                | Remove `["date-created"]` ⚠️ |
| `sent_at`              | `date_sent`      | push_delivery     | When push was sent to service           | -                            |
| `delivered_at`         | `date_delivered` | push_delivery     | When push was delivered to device       | -                            |
| `read_at`              | `date_read`      | push_delivery     | When user read the notification         | -                            |
| `failed_at`            | `date_failed`    | push_delivery     | When delivery permanently failed        | -                            |
| `retry_after`          | `date_retry`     | push_delivery     | Scheduled time for next retry attempt   | -                            |
| `last_used_at`         | `date_last_used` | push_subscription | Last time this subscription was used    | -                            |
| `expires_at`           | `date_expires`   | user_notification | When this notification expires          | -                            |
| `expires_at`           | `date_expires`   | push_subscription | When this subscription expires          | -                            |
| `user_id`              | `user`           | user_notification | User who will receive this notification | Keep `["m2o"]`               |
| `user_id`              | `user`           | push_subscription | User who owns this subscription         | Keep `["m2o"]`               |
| `user_notification_id` | `notification`   | push_delivery     | Related notification message            | Keep `["m2o"]`               |
| `push_subscription_id` | `subscription`   | push_delivery     | Target device subscription              | Keep `["m2o"]`               |

## Tasks

- [ ] Update collection schemas in [db-configuration/index.ts](../src/db-configuration/index.ts)
- [ ] Update [directus-state.json](../directus-state.json) field definitions
- [ ] Add translations to collection metadata (en-US, pt-BR)
- [ ] Add translations to field metadata (en-US, pt-BR)
- [ ] Fix interface and display options for user fields (add `display: "user"`)
- [ ] Fix display options for datetime fields (add `display: "datetime"`)
- [ ] Add missing relations to new relations array
- [ ] Create O2M virtual fields (deliveries on user_notification and push_subscription)
- [ ] Update TypeScript interfaces in `src/*/_types.ts`
- [ ] Update backend logic (hooks, endpoints, queries)
- [ ] Update Service Worker payload handling
- [ ] Update [CONTRIBUTING.md](../CONTRIBUTING.md) ERD and schema docs
- [ ] Update [README.md](../README.md) examples
- [ ] Fix `queued_at` special field (remove incorrect `date-created` special)
- [ ] Update display templates using old field names
- [ ] Run migration script for existing data (if needed)
- [ ] Update E2E tests assertions
- [ ] Verify backward compatibility or add migration guide

## Additional Schema Issues Found

### Current Issues in directus-state.json

**1. User fields missing proper display:**

- `user_notification.created_by` - Missing `display: "user"`
- `user_notification.user_id` - Only has `template`, missing `display: "user"`
- `push_subscription.user_id` - Only has `template`, missing `display: "user"`

**2. DateTime fields missing display options:**

- All datetime fields lack `display: "datetime"` and `display_options`

**3. Missing relations array:**

- Current `directus-state.json` doesn't have a `relations` array
- Need to add all M2O relations explicitly

**4. Missing O2M virtual fields:**

- `user_notification.deliveries` field doesn't exist
- `push_subscription.deliveries` field doesn't exist

### display_template Needs Update

**push_delivery:**

```json
"display_template": "{{user_notification_id}} → {{push_subscription_id}} ({{status}})"
```

Should become:

```json
"display_template": "{{notification.title}} → {{subscription.device_name}} ({{status}})"
```

**user_notification:**

```json
"display_template": "{{title}} - {{user_id}}"
```

Should become:

```json
"display_template": "{{title}} - {{user.first_name}} {{user.last_name}}"
```

### sort_field Needs Update

**user_notification:**

```json
"sort_field": "created_at"
```

Should become:

```json
"sort_field": "date_created"
```

**push_delivery:**

```json
"sort_field": "queued_at"
```

Should become:

```json
"sort_field": "date_queued"
```

### Schema Foreign Key References

Current schema explicitly sets `foreign_key_table` and `foreign_key_column` for M2O fields. After renaming:

**Before:**

```json
{
  "field": "user_id",
  "schema": {
    "foreign_key_table": "directus_users",
    "foreign_key_column": "id"
  }
}
```

**After:**

```json
{
  "field": "user",
  "schema": {
    "foreign_key_table": "directus_users",
    "foreign_key_column": "id"
  }
}
```

This affects:

- `push_subscription.user_id` → `user`
- `user_notification.user_id` → `user`
- `user_notification.created_by` → `user_created`
- `push_delivery.user_notification_id` → `notification`
- `push_delivery.push_subscription_id` → `subscription`

## Interface and Display Configuration

### User Reference Fields

All fields referencing `directus_users` must have proper interface and display:

**`user_created` (system field):**

```json
{
  "meta": {
    "interface": "select-dropdown-m2o",
    "options": {
      "template": "{{avatar}} {{first_name}} {{last_name}}"
    },
    "display": "user",
    "display_options": null,
    "readonly": true,
    "hidden": true
  }
}
```

**`user` (business logic field):**

```json
{
  "meta": {
    "interface": "select-dropdown-m2o",
    "options": {
      "template": "{{avatar}} {{first_name}} {{last_name}}"
    },
    "display": "user",
    "display_options": null,
    "readonly": false,
    "hidden": false,
    "required": true
  }
}
```

### DateTime Fields

**`date_created` (system field):**

```json
{
  "meta": {
    "special": ["date-created"],
    "interface": "datetime",
    "options": null,
    "display": "datetime",
    "display_options": {
      "format": "short",
      "use24": true,
      "includeSeconds": true
    },
    "readonly": true,
    "hidden": true
  }
}
```

**`date_updated` (system field):**

```json
{
  "meta": {
    "special": ["date-updated"],
    "interface": "datetime",
    "options": null,
    "display": "datetime",
    "display_options": {
      "relative": true
    },
    "readonly": true,
    "hidden": true
  }
}
```

**Manual datetime fields (date_queued, date_sent, date_delivered, etc.):**

```json
{
  "meta": {
    "special": null,
    "interface": "datetime",
    "options": null,
    "display": "datetime",
    "display_options": {
      "relative": true
    },
    "readonly": false,
    "hidden": false
  }
}
```

### Relations Array

Relations must be explicitly declared in the `relations` array:

**user_created relation:**

```json
{
  "collection": "user_notification",
  "field": "user_created",
  "related_collection": "directus_users",
  "schema": {
    "constraint_name": "user_notification_user_created_foreign",
    "table": "user_notification",
    "column": "user_created",
    "foreign_key_schema": "public",
    "foreign_key_table": "directus_users",
    "foreign_key_column": "id",
    "on_update": "NO ACTION",
    "on_delete": "NO ACTION"
  },
  "meta": {
    "many_collection": "user_notification",
    "many_field": "user_created",
    "one_collection": "directus_users",
    "one_field": null,
    "one_collection_field": null,
    "one_allowed_collections": null,
    "junction_field": null,
    "sort_field": null,
    "one_deselect_action": "nullify"
  }
}
```

**user relation:**

```json
{
  "collection": "push_subscription",
  "field": "user",
  "related_collection": "directus_users",
  "schema": {
    "constraint_name": "push_subscription_user_foreign",
    "table": "push_subscription",
    "column": "user",
    "foreign_key_schema": "public",
    "foreign_key_table": "directus_users",
    "foreign_key_column": "id",
    "on_update": "NO ACTION",
    "on_delete": "NO ACTION"
  },
  "meta": {
    "many_collection": "push_subscription",
    "many_field": "user",
    "one_collection": "directus_users",
    "one_field": null,
    "one_collection_field": null,
    "one_allowed_collections": null,
    "junction_field": null,
    "sort_field": null,
    "one_deselect_action": "nullify"
  }
}
```

**notification relation:**

```json
{
  "collection": "push_delivery",
  "field": "notification",
  "related_collection": "user_notification",
  "schema": {
    "constraint_name": "push_delivery_notification_foreign",
    "table": "push_delivery",
    "column": "notification",
    "foreign_key_schema": "public",
    "foreign_key_table": "user_notification",
    "foreign_key_column": "id",
    "on_update": "NO ACTION",
    "on_delete": "CASCADE"
  },
  "meta": {
    "many_collection": "push_delivery",
    "many_field": "notification",
    "one_collection": "user_notification",
    "one_field": "deliveries",
    "one_collection_field": null,
    "one_allowed_collections": null,
    "junction_field": null,
    "sort_field": null,
    "one_deselect_action": "nullify"
  }
}
```

**subscription relation:**

```json
{
  "collection": "push_delivery",
  "field": "subscription",
  "related_collection": "push_subscription",
  "schema": {
    "constraint_name": "push_delivery_subscription_foreign",
    "table": "push_delivery",
    "column": "subscription",
    "foreign_key_schema": "public",
    "foreign_key_table": "push_subscription",
    "foreign_key_column": "id",
    "on_update": "NO ACTION",
    "on_delete": "CASCADE"
  },
  "meta": {
    "many_collection": "push_delivery",
    "many_field": "subscription",
    "one_collection": "push_subscription",
    "one_field": "deliveries",
    "one_collection_field": null,
    "one_allowed_collections": null,
    "junction_field": null,
    "sort_field": null,
    "one_deselect_action": "nullify"
  }
}
```

### One-to-Many (O2M) Virtual Fields

These virtual fields should be added to display related items:

**user_notification.deliveries (O2M to push_delivery):**

```json
{
  "collection": "user_notification",
  "field": "deliveries",
  "type": "alias",
  "meta": {
    "interface": "list-o2m",
    "special": ["o2m"],
    "display": "related-values",
    "display_options": {
      "template": "{{subscription.device_name}} - {{status}}"
    },
    "readonly": true,
    "hidden": false
  }
}
```

**push_subscription.deliveries (O2M to push_delivery):**

```json
{
  "collection": "push_subscription",
  "field": "deliveries",
  "type": "alias",
  "meta": {
    "interface": "list-o2m",
    "special": ["o2m"],
    "display": "related-values",
    "display_options": {
      "template": "{{notification.title}} - {{status}}"
    },
    "readonly": true,
    "hidden": false
  }
}
```

## Translations

### Collection Translations

| Collection          | en-US              | pt-BR                   |
| ------------------- | ------------------ | ----------------------- |
| `push_subscription` | Push Subscriptions | Inscrições Push         |
| `user_notification` | User Notifications | Notificações de Usuário |
| `push_delivery`     | Push Deliveries    | Entregas Push           |

### Collection Notes Translations

| Collection          | en-US                                     | pt-BR                                         |
| ------------------- | ----------------------------------------- | --------------------------------------------- |
| `push_subscription` | Push notification subscriptions (devices) | Inscrições de notificação push (dispositivos) |
| `user_notification` | User notifications (messages)             | Notificações de usuário (mensagens)           |
| `push_delivery`     | Push delivery status (join table)         | Status de entrega push (tabela de junção)     |

### Field Translations

| Field            | Collection        | en-US         | pt-BR                |
| ---------------- | ----------------- | ------------- | -------------------- |
| `user_created`   | user_notification | Created By    | Criado Por           |
| `date_created`   | user_notification | Created At    | Criado Em            |
| `date_created`   | push_subscription | Created At    | Criado Em            |
| `date_queued`    | push_delivery     | Queued At     | Enfileirado Em       |
| `date_sent`      | push_delivery     | Sent At       | Enviado Em           |
| `date_delivered` | push_delivery     | Delivered At  | Entregue Em          |
| `date_read`      | push_delivery     | Read At       | Lido Em              |
| `date_failed`    | push_delivery     | Failed At     | Falhou Em            |
| `date_retry`     | push_delivery     | Retry At      | Tentar Novamente Em  |
| `date_last_used` | push_subscription | Last Used At  | Último Uso Em        |
| `date_expires`   | user_notification | Expires At    | Expira Em            |
| `date_expires`   | push_subscription | Expires At    | Expira Em            |
| `user`           | user_notification | User          | Usuário              |
| `user`           | push_subscription | User          | Usuário              |
| `notification`   | push_delivery     | Notification  | Notificação          |
| `subscription`   | push_delivery     | Subscription  | Inscrição            |
| `title`          | user_notification | Title         | Título               |
| `body`           | user_notification | Body          | Corpo                |
| `channel`        | user_notification | Channel       | Canal                |
| `priority`       | user_notification | Priority      | Prioridade           |
| `action_url`     | user_notification | Action URL    | URL de Ação          |
| `icon_url`       | user_notification | Icon URL      | URL do Ícone         |
| `data`           | user_notification | Data          | Dados                |
| `endpoint`       | push_subscription | Endpoint      | Endpoint             |
| `keys`           | push_subscription | Keys          | Chaves               |
| `user_agent`     | push_subscription | User Agent    | User Agent           |
| `device_name`    | push_subscription | Device Name   | Nome do Dispositivo  |
| `is_active`      | push_subscription | Active        | Ativo                |
| `status`         | push_delivery     | Status        | Status               |
| `attempt_count`  | push_delivery     | Attempt Count | Tentativas           |
| `max_attempts`   | push_delivery     | Max Attempts  | Máximo de Tentativas |
| `error_code`     | push_delivery     | Error Code    | Código de Erro       |
| `error_message`  | push_delivery     | Error Message | Mensagem de Erro     |
| `metadata`       | push_delivery     | Metadata      | Metadados            |
| `deliveries`     | user_notification | Deliveries    | Entregas             |
| `deliveries`     | push_subscription | Deliveries    | Entregas             |

### Field Notes Translations

| Field            | Collection        | en-US                                   | pt-BR                                      |
| ---------------- | ----------------- | --------------------------------------- | ------------------------------------------ |
| `user_created`   | user_notification | User who created this notification      | Usuário que criou esta notificação         |
| `date_created`   | user_notification | When this notification was created      | Quando esta notificação foi criada         |
| `date_created`   | push_subscription | When this subscription was created      | Quando esta inscrição foi criada           |
| `date_queued`    | push_delivery     | When delivery was queued                | Quando a entrega foi enfileirada           |
| `date_sent`      | push_delivery     | When push was sent to service           | Quando o push foi enviado ao serviço       |
| `date_delivered` | push_delivery     | When push was delivered to device       | Quando o push foi entregue ao dispositivo  |
| `date_read`      | push_delivery     | When user read the notification         | Quando o usuário leu a notificação         |
| `date_failed`    | push_delivery     | When delivery permanently failed        | Quando a entrega falhou permanentemente    |
| `date_retry`     | push_delivery     | Scheduled time for next retry attempt   | Horário agendado para próxima tentativa    |
| `date_last_used` | push_subscription | Last time this subscription was used    | Última vez que esta inscrição foi usada    |
| `date_expires`   | user_notification | When this notification expires          | Quando esta notificação expira             |
| `date_expires`   | push_subscription | When this subscription expires          | Quando esta inscrição expira               |
| `user`           | user_notification | User who will receive this notification | Usuário que receberá esta notificação      |
| `user`           | push_subscription | User who owns this subscription         | Usuário que possui esta inscrição          |
| `notification`   | push_delivery     | Related notification message            | Mensagem de notificação relacionada        |
| `subscription`   | push_delivery     | Target device subscription              | Inscrição do dispositivo alvo              |
| `endpoint`       | push_subscription | Push subscription endpoint              | Endpoint da inscrição push                 |
| `keys`           | push_subscription | Push subscription keys (p256dh, auth)   | Chaves da inscrição push (p256dh, auth)    |
| `user_agent`     | push_subscription | Browser user agent                      | User agent do navegador                    |
| `device_name`    | push_subscription | Friendly device name                    | Nome amigável do dispositivo               |
| `is_active`      | push_subscription | Whether the subscription is active      | Se a inscrição está ativa                  |
| `title`          | user_notification | Notification title                      | Título da notificação                      |
| `body`           | user_notification | Notification content                    | Conteúdo da notificação                    |
| `channel`        | user_notification | Delivery channel                        | Canal de entrega                           |
| `priority`       | user_notification | Priority level                          | Nível de prioridade                        |
| `action_url`     | user_notification | URL to open on click                    | URL para abrir ao clicar                   |
| `icon_url`       | user_notification | Custom notification icon                | Ícone customizado da notificação           |
| `data`           | user_notification | Additional data for the app             | Dados adicionais para o app                |
| `status`         | push_delivery     | Delivery status                         | Status da entrega                          |
| `attempt_count`  | push_delivery     | Number of send attempts                 | Número de tentativas de envio              |
| `max_attempts`   | push_delivery     | Maximum retry attempts                  | Máximo de tentativas                       |
| `error_code`     | push_delivery     | Error code                              | Código do erro                             |
| `error_message`  | push_delivery     | Detailed error message                  | Mensagem de erro detalhada                 |
| `metadata`       | push_delivery     | Additional delivery info                | Informações adicionais da entrega          |
| `deliveries`     | user_notification | Delivery records for this notification  | Registros de entrega desta notificação     |
| `deliveries`     | push_subscription | Delivery records for this device        | Registros de entrega para este dispositivo |

## Impact

- **API Changes**: Field names will change in API responses
- **Migration Required**: Existing `push_subscription` and `push_delivery` records need field renaming
- **Database Migration**: Column names will change (requires ALTER TABLE or data migration)
- **i18n Support**: Interface will display in user's language (en-US or pt-BR)
- **Version Bump**: Minor version in 0.x.x series (e.g., 0.1.3 → 0.2.0)
  - During beta (0.x.x), breaking changes are acceptable in minor versions
  - Major version stays at 0 until production-ready (1.0.0)

## Directus Field Conventions

### Timestamp Fields (`date_*`)

- `date_created` - Auto-set on item creation (requires `special: ["date-created"]`)
- `date_updated` - Auto-set on item update (requires `special: ["date-updated"]`)
- `date_queued` - When item entered queue (no special, manual timestamp)
- `date_sent` - When push sent to FCM/browser (no special, manual timestamp)
- `date_delivered` - When Service Worker received push (no special, manual timestamp)
- `date_read` - When user clicked/interacted (no special, manual timestamp)
- `date_failed` - When delivery permanently failed (no special, manual timestamp)
- `date_retry` - Scheduled time for next retry (no special, manual timestamp)
- `date_last_used` - Last successful usage timestamp (no special, manual timestamp)
- `date_expires` - Expiration/TTL timestamp (no special, manual timestamp)

**Convention**: Always prefix with `date_` for datetime fields

⚠️ **Important**: Only `date_created` and `date_updated` should use special fields. Other timestamps are set manually by business logic.

### User Reference Fields (`user_*`)

- `user_created` - User who created the item (system field)
- `user_updated` - User who last updated the item (system field)
- `user` - Generic M2O relation to directus_users (recipient/owner)

**Convention**: Prefix with `user_` for system tracking, use plain `user` for business logic

### Many-to-One Relations (M2O)

- `notification` - Reference to user_notification (no `_id` suffix)
- `subscription` - Reference to push_subscription (no `_id` suffix)
- `user` - Reference to directus_users (no `_id` suffix)

**Convention**: Relations use the collection name without `_id` suffix. Directus handles the foreign key internally.

### Translations Structure

Directus stores translations in the `translations` field of collection and field metadata:

```json
{
  "translations": [
    {
      "language": "en-US",
      "translation": "Push Subscriptions",
      "singular": "Push Subscription",
      "plural": "Push Subscriptions"
    },
    {
      "language": "pt-BR",
      "translation": "Inscrições Push",
      "singular": "Inscrição Push",
      "plural": "Inscrições Push"
    }
  ]
}
```

For fields, translations contain only the field name (not notes):

```json
{
  "translations": [
    {
      "language": "en-US",
      "translation": "Created At"
    },
    {
      "language": "pt-BR",
      "translation": "Criado Em"
    }
  ]
}
```

Field notes are translated separately in the `note` field per language context.
