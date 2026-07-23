# Task 006 — Campo Icon como relação com directus_files

Status: done
Type: feature
Assignee: Sidarta Veloso

## Description

Adicionar um campo `icon` (M2O → `directus_files`) na coleção `user_notification`, permitindo upload de imagens diretamente pelo Directus. O campo `icon_url` existente (string) será mantido como alternativa para URLs externas.

### Endpoint público para ícone

Em vez de expor `directus_files` publicamente, foi criado um endpoint dedicado:

```
GET /push-notification/icon/:notification_id
```

Comportamento:

1. Se a notificação tem `icon` (arquivo no Directus) → redirect para `/assets/{id}?width=192&height=192&fit=cover&quality=80` (transformação automática para 192×192px)
2. Senão, se tem `icon_url` (URL externa) → redirect 302 para a URL
3. Senão → redirect para `/admin/favicon.ico`

**Vantagens:**

- Nenhum arquivo do Directus precisa ficar público
- Transformação de imagem aplicada automaticamente
- Service worker acessa um único URL público sem autenticação
- Zero configuração de permissões pelo admin

## Abordagem TDD

Esta task **deve ser implementada usando TDD (Test-Driven Development)**. Os testes devem ser escritos **antes** da implementação.

### Caso 1: Ícone via arquivo do Directus (campo `icon`)

1. Escrever teste que verifica que, ao criar uma notificação com um `icon` (ID de arquivo), o payload enviado ao service worker contém a URL `/assets/{id}`
2. Escrever teste que verifica que a URL do asset é acessível sem autenticação (resposta HTTP 200 sem header Authorization)
3. Escrever teste que verifica que, quando `icon` e `icon_url` estão ambos preenchidos, `icon` tem prioridade
4. Implementar a funcionalidade até os testes passarem

### Caso 2: Ícone via URL externa (campo `icon_url`)

1. Escrever teste que verifica que, ao criar uma notificação apenas com `icon_url`, o payload enviado ao service worker contém a URL fornecida diretamente
2. Escrever teste que verifica o fallback para `/admin/favicon.ico` quando nem `icon` nem `icon_url` estão preenchidos
3. Implementar a funcionalidade até os testes passarem

## Tasks

- [ ] Escrever testes para o caso 1 (icon via directus_files)
- [ ] Escrever testes para o caso 2 (icon via URL externa)
- [ ] Adicionar campo `icon` (uuid, M2O → `directus_files`) em `directus-state.json`
- [ ] Adicionar relação M2O `icon` → `directus_files` em `directus-state.json`
- [ ] Configurar interface `file-image` com opções de validação (apenas imagens)
- [ ] Configurar display `image` para preview na listagem
- [ ] Atualizar `_types.ts` — adicionar campo `icon?: string` em `UserNotification`
- [ ] Atualizar `notification-trigger/index.ts` — resolver `icon` para URL `/assets/{id}`
- [ ] Atualizar `service-worker.ts` — lógica de prioridade (icon > icon_url > fallback)
- [ ] Atualizar `PushPayload` type para incluir `icon`
- [ ] Adicionar traduções i18n para o campo `icon` (en-US, pt-BR)
- [ ] Verificar que todos os testes passam
- [ ] Rodar `pnpm validate` sem erros

## Referências

- [Directus Files API](https://docs.directus.io/reference/files.html)
- [Directus Assets endpoint](https://docs.directus.io/reference/files.html#accessing-a-file)
- [Web Push Notification icon spec](https://developer.mozilla.org/en-US/docs/Web/API/Notification/icon)
