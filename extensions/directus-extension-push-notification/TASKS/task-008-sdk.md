# Task 008 — SDK para Push Notification Extension

Status: done
Type: feature
Assignee: Sidarta Veloso

## Description

Criar um pacote SDK TypeScript (`@anthropic/push-notification-sdk`) que expõe tipos, API client e helpers reutilizáveis para integração com a extensão `directus-extension-push-notification`.

### Motivação

- Outros projetos Directus podem enviar notificações programaticamente via API client tipado
- Frontends (Vue, React, vanilla) podem importar o subscribe helper ao invés de copiar scripts
- Tipagem compartilhada — autocomplete e validação sem manter tipos manualmente
- Versionamento independente do pacote da extensão

### Estrutura

```
packages/sdk/
  src/
    index.ts            # barrel export
    types.ts            # tipos canônicos (zero deps)
    client.ts           # API client (fetch-based, zero deps)
    client.test.ts      # 12 testes
    subscribe.ts        # browser subscribe/unsubscribe helpers
    subscribe.test.ts   # 6 testes
    translation.ts      # resolveTranslation (pure function)
    translation.test.ts # 7 testes
  package.json
  tsconfig.json
  vitest.config.ts
```

### O que o SDK expõe

| Export                          | Descrição                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `PushNotificationClient`        | API client com métodos: `registerSubscription`, `unregisterSubscription`, `getSubscriptions`, `sendNotification`, `getVapidPublicKey` |
| `subscribe()` / `unsubscribe()` | Helpers para subscription no browser (SW registration, permissão, registerão no backend)                                              |
| `isPushSupported()`             | Detecta suporte a Push API no ambiente                                                                                                |
| `detectDeviceName()`            | Detecta nome do dispositivo via User-Agent                                                                                            |
| `vapidKeyToUint8Array()`        | Converte VAPID key de base64url para `Uint8Array`                                                                                     |
| `resolveTranslation()`          | Resolve title/body no idioma do usuário com fallback                                                                                  |
| Todos os tipos                  | `UserNotification`, `PushSubscription`, `PushDelivery`, `SendNotificationRequest`, etc.                                               |

### Características

- **Zero dependencies** — apenas `fetch` nativo
- **Isomórfico** — funciona em Node.js ≥ 18, Deno, Bun e browsers
- **Tree-shakeable** — exports granulares (`/types`, `/client`, `/subscribe`)
- **TypeScript puro** — `.types.ts` para definições, `.test.ts` para testes

## Tasks

- [x] Criar estrutura `packages/sdk/` no monorepo
- [x] Atualizar `pnpm-workspace.yaml` para incluir `packages/*`
- [x] Criar `types.ts` com todos os tipos canônicos
- [x] Criar `client.ts` (API client fetch-based, zero deps)
- [x] Criar `client.test.ts` (12 testes)
- [x] Criar `subscribe.ts` (browser helpers)
- [x] Criar `subscribe.test.ts` (6 testes)
- [x] Criar `translation.ts` (resolveTranslation)
- [x] Criar `translation.test.ts` (7 testes)
- [x] Criar `index.ts` (barrel export)
- [x] Configurar `tsconfig.json` e `vitest.config.ts` do SDK
- [x] Verificar 25 testes passando
- [x] Verificar build gera `.js` + `.d.ts` + `.map`
- [x] Verificar projeto root continua válido (`pnpm lint && pnpm typecheck && pnpm validate`)
