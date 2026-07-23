# Testes de Integração - Push Notification v2

Este diretório contém os testes de integração para a arquitetura v2 da extensão de push notifications do Directus, que suporta múltiplos dispositivos por usuário.

## Estrutura

```
tests/integration/
├── helpers/
│   └── test-helpers.ts        # Funções auxiliares e factories para testes
├── push-delivery-flow.test.ts  # Testes do fluxo de entrega de notificações
├── multiple-devices.test.ts    # Testes de cenários com múltiplos dispositivos
├── delivery-states.test.ts     # Testes de estados e transições de delivery
├── error-handling.test.ts      # Testes de tratamento de erros
└── README.md                   # Este arquivo
```

## Arquivos de Teste

### 1. push-delivery-flow.test.ts (4 testes)

Testa o fluxo completo de entrega de notificações push:

- ✅ Deve criar `push_delivery` automaticamente ao criar `user_notification` com `channel=push`
- ✅ Deve atualizar `last_used_at` da subscription após envio
- ✅ Não deve criar `push_delivery` para channel diferente de push
- ✅ Deve incluir todos os dados da notification no payload

**Objetivo**: Validar que o hook de criação de notificações funciona corretamente e cria os deliveries apropriados.

### 2. multiple-devices.test.ts (5 testes)

Testa cenários com múltiplos dispositivos por usuário:

- ✅ Deve enviar para todos os dispositivos ativos do usuário
- ✅ Deve ignorar dispositivos inativos
- ✅ Deve identificar dispositivos corretamente por `device_name`
- ✅ Deve atualizar `last_used_at` em todos os dispositivos
- ✅ Deve lidar com falha parcial em múltiplos dispositivos

**Objetivo**: Validar o suporte a múltiplos dispositivos, principal feature da arquitetura v2.

### 3. delivery-states.test.ts (6 testes)

Testa estados e transições de push deliveries:

- ✅ Deve transicionar de `queued` para `sent` com timestamps corretos
- ✅ Deve aceitar atualização para `delivered` via callback
- ✅ Deve aceitar atualização para `read` quando usuário clica
- ✅ Deve validar sequência de timestamps: `queued_at < sent_at < delivered_at < read_at`
- ✅ Deve incrementar `attempt_count` a cada tentativa
- ✅ Deve respeitar `max_attempts` configurado

**Objetivo**: Validar a máquina de estados e os timestamps de cada transição.

### 4. error-handling.test.ts (7 testes)

Testa tratamento de erros e casos edge:

- ✅ Não deve criar delivery se `push_enabled=false`
- ✅ Deve registrar `error_code` e `error_message` em falhas
- ✅ Deve desativar subscription em erro 410 Gone
- ✅ Deve setar `retry_after` em falhas temporárias
- ✅ Deve marcar como `failed` após exceder `max_attempts`
- ✅ Deve lidar com subscription sem endpoint válido
- ✅ Deve validar que `keys.p256dh` e `keys.auth` existem

**Objetivo**: Validar robustez e tratamento de erros do sistema.

## Helpers (test-helpers.ts)

Fornece funções auxiliares para os testes:

### Interfaces TypeScript

- `PushSubscription`: Tipagem para subscriptions
- `UserNotification`: Tipagem para notifications
- `PushDelivery`: Tipagem para deliveries

### Funções Factory

- `createPushSubscription(userId, options, testSuiteId)`: Cria uma subscription de teste
- `createUserNotification(data, testSuiteId)`: Cria uma notification de teste
- `getPushDeliveries(notificationId, testSuiteId)`: Busca deliveries por notification
- `getPushDelivery(notificationId, subscriptionId, testSuiteId)`: Busca delivery específico
- `updatePushDelivery(deliveryId, updates, testSuiteId)`: Atualiza um delivery
- `getPushSubscription(subscriptionId, testSuiteId)`: Busca subscription por ID
- `updateUserPushEnabled(userId, enabled, testSuiteId)`: Atualiza flag push_enabled do usuário
- `getAdminUserId(testSuiteId)`: Obtém ID do usuário admin

### Utilitários

- `wait(ms)`: Helper para aguardar processamento assíncrono

## Executando os Testes

### Todos os testes de integração

```bash
pnpm test:integration
```

### Teste específico

```bash
pnpm vitest tests/integration/push-delivery-flow.test.ts
```

### Com cobertura

```bash
pnpm test:integration --coverage
```

### Watch mode

```bash
pnpm vitest tests/integration --watch
```

## Ambiente de Teste

Os testes de integração usam:

- **Docker Compose**: Container isolado do Directus para cada suíte
- **SQLite**: Banco de dados em memória para velocidade
- **Versão Directus**: 11.15.1 por padrão (configurável via `DIRECTUS_TEST_VERSION`, ex: `12.1.1`)
- **Credenciais**: admin@example.com / test-password-not-a-leak
- **Timeout**: 420 segundos (7 minutos) para setup
- **Isolamento**: Cada suíte usa um `testSuiteId` único

## Arquitetura Testada

### Coleções

1. **push_subscription**
   - Armazena informações de subscription do Web Push API
   - Suporta múltiplos dispositivos por usuário
   - Campos: `endpoint`, `keys`, `device_name`, `is_active`, `last_used_at`, `expires_at`

2. **user_notification**
   - Notificações destinadas a usuários
   - Campos: `title`, `body`, `channel`, `priority`, `action_url`, `icon_url`, `data`

3. **push_delivery**
   - Registro de entregas de push por dispositivo
   - Estados: `queued` → `sending` → `sent` → `delivered` → `read`
   - Rastreamento: timestamps, tentativas, erros, retry

### Fluxo Principal

1. Usuário cria `user_notification` com `channel=push`
2. Hook busca `push_subscription` ativas do usuário
3. Para cada subscription, cria um `push_delivery` com status `queued`
4. Sistema envia via Web Push API
5. Status atualiza para `sent` (ou `failed` em erro)
6. Service Worker notifica `delivered` quando recebe
7. Usuário clica: atualiza para `read`

## Notas Importantes

### Tempos de Espera

Os testes usam `wait(3000)` para aguardar processamento de hooks. Em produção, isso é instantâneo, mas em testes precisamos dar tempo para o Docker processar.

### Mocking

Atualmente, os testes NÃO usam mocks do web-push. Testes de erros específicos (como 410 Gone) validam a estrutura mas podem não executar o cenário exato sem um mock server.

### Melhorias Futuras

1. Adicionar mock server para web-push para testar erros específicos
2. Adicionar testes de performance (latência de envio)
3. Adicionar testes de carga (muitos dispositivos, muitas notificações)
4. Adicionar testes de concorrência
5. Adicionar testes de migração (v1 → v2)

## Cobertura Esperada

✅ **Fluxo de Entrega**: 100%  
✅ **Múltiplos Dispositivos**: 100%  
✅ **Estados e Transições**: 100%  
✅ **Tratamento de Erros**: ~80% (alguns cenários precisam mock)

**Total: 22 testes de integração implementados**

## Troubleshooting

### Testes lentos

Os testes de integração são lentos por natureza (usam Docker). Isso é esperado. Use watch mode durante desenvolvimento.

### Container não para

Se o container não parar após os testes, execute:

```bash
docker-compose -f docker-compose.test.yml down -v
```

### Erros de timeout

Aumente o timeout no `beforeAll` se seu hardware for mais lento:

```typescript
beforeAll(async () => {
  // ...
}, 600000); // 10 minutos em vez de 7
```

### Porta já em uso

O Docker usa portas aleatórias para evitar conflitos. Se ainda assim houver conflito, mude a porta base em `docker-compose.test.yml`.

## Referências

- [Directus Hooks](https://docs.directus.io/extensions/hooks.html)
- [Web Push Protocol](https://datatracker.ietf.org/doc/html/rfc8030)
- [Vitest](https://vitest.dev/)
- [Task 004 - Implementar Push Notification v2](../../TASKS/task-004-implementar-push-notification-v2.md)
