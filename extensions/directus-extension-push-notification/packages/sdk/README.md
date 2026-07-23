# @anthropic/push-notification-sdk

TypeScript SDK para integração com [directus-extension-push-notification](https://github.com/devix-tecnologia/directus-extension-push-notification).

## Instalação

```bash
pnpm add @anthropic/push-notification-sdk
```

## Uso

### API Client (Node.js / Backend)

```ts
import { PushNotificationClient } from "@anthropic/push-notification-sdk";

const client = new PushNotificationClient({
  baseUrl: "https://directus.example.com",
  token: "your-static-token",
});

// Enviar notificação
const result = await client.sendNotification({
  user: "user-uuid",
  title: "Nova mensagem",
  body: "Você tem uma nova mensagem",
  priority: "high",
  translations: [
    {
      languages_code: "en-US",
      title: "New message",
      body: "You have a new message",
    },
    {
      languages_code: "pt-BR",
      title: "Nova mensagem",
      body: "Você tem uma nova mensagem",
    },
  ],
});

// Listar subscriptions
const subs = await client.getSubscriptions();

// Obter VAPID public key
const vapidKey = await client.getVapidPublicKey();
```

### Subscribe Helper (Browser / Frontend)

```ts
import {
  subscribe,
  unsubscribe,
  isPushSupported,
} from "@anthropic/push-notification-sdk/subscribe";

if (isPushSupported()) {
  const result = await subscribe({
    vapidPublicKey: "BEl62i...",
    baseUrl: "https://directus.example.com",
  });

  if (result.success) {
    console.log("Inscrito!", result.subscription?.endpoint);
  }
}

// Para cancelar
await unsubscribe("https://directus.example.com");
```

### Resolução de Tradução

```ts
import { resolveTranslation } from "@anthropic/push-notification-sdk";

const resolved = resolveTranslation({
  title: "Default Title",
  body: "Default Body",
  translations: [
    { languages_code: "pt-BR", title: "Olá", body: "Mundo" },
    { languages_code: "en-US", title: "Hello", body: "World" },
  ],
  user_language: "pt-BR",
});
// => { title: "Olá", body: "Mundo" }
```

### Apenas Tipos

```ts
import type {
  UserNotification,
  PushDelivery,
} from "@anthropic/push-notification-sdk/types";
```

## Exports

| Path                                         | Conteúdo                                     |
| -------------------------------------------- | -------------------------------------------- |
| `@anthropic/push-notification-sdk`           | Tudo (tipos, client, subscribe, translation) |
| `@anthropic/push-notification-sdk/types`     | Apenas tipos                                 |
| `@anthropic/push-notification-sdk/client`    | API client                                   |
| `@anthropic/push-notification-sdk/subscribe` | Browser subscribe helpers                    |

## Requisitos

- Node.js ≥ 18 (ou qualquer runtime com `fetch` nativo)
- Zero dependencies
