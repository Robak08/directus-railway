# Testes - Directus Extension Push Notification

Estrutura completa de testes para a extensão de Push Notification do Directus.

## Estrutura

```
tests/
├── e2e/                                  # Testes End-to-End com Playwright
│   ├── helpers/                          # Helpers para testes E2E
│   │   └── DirectusE2EHelper.ts          # Classe auxiliar para operações no Directus
│   ├── screenshots/                      # Screenshots gerados durante os testes
│   ├── push-notification-collections.spec.ts  # Testes das coleções
│   └── README.md                         # Documentação dos testes E2E
│
├── integration/                          # Testes de integração com Vitest
│   ├── helpers/                          # Helpers para testes de integração
│   ├── debug-hook.test.ts                # Testes do hook de debug
│   ├── delivery-states.test.ts           # Testes dos estados de entrega
│   ├── error-handling.test.ts            # Testes de tratamento de erros
│   ├── multiple-devices.test.ts          # Testes com múltiplos dispositivos
│   ├── push-delivery-flow.test.ts        # Testes do fluxo de entrega
│   └── README.md                         # Documentação dos testes de integração
│
├── run-e2e.js                            # Script automatizado para rodar testes E2E
├── setup.ts                              # Setup global para testes
├── test-env.ts                           # Configuração de variáveis de ambiente
├── test-logger.ts                        # Logger para testes
├── global-setup.ts                       # Setup global do Playwright
└── global-teardown.ts                    # Teardown global do Playwright
```

## Tipos de Testes

### 1. Testes E2E (End-to-End)

Testes que simulam o comportamento real do usuário no browser usando Playwright.

**Localização:** `tests/e2e/`

**Executar:**

```bash
# Todos os testes E2E
pnpm test:e2e

# Com interface do Playwright
pnpm test:e2e:ui

# Em modo debug
pnpm test:e2e:debug

# Com browser visível
pnpm test:e2e:headed

# Ver relatório
pnpm test:e2e:report
```

**O que testam:**

- Login e autenticação no Directus
- Criação e verificação de coleções
- Interface do usuário
- Navegação entre páginas
- Funcionalidades de push notification no frontend

### 2. Testes de Integração

Testes que verificam a integração entre componentes usando Vitest.

**Localização:** `tests/integration/`

**Executar:**

```bash
# Todos os testes de integração
pnpm test:integration

# Em modo watch
pnpm test:integration:watch

# Com ambiente Docker
pnpm test:integration:ci
```

**O que testam:**

- Hooks do Directus
- Endpoints da API
- Fluxo de entrega de notificações
- Estados de entrega (queued, sent, delivered, failed)
- Múltiplos dispositivos
- Tratamento de erros

## Scripts Disponíveis

### Testes E2E

- `pnpm test:e2e` - Executa todos os testes E2E com verbose
- `pnpm test:e2e:ui` - Abre a interface do Playwright
- `pnpm test:e2e:debug` - Executa em modo debug (passo a passo)
- `pnpm test:e2e:headed` - Executa com browser visível
- `pnpm test:e2e:report` - Mostra o relatório HTML dos testes
- `pnpm test:e2e:clean` - Limpa resultados de testes anteriores

### Testes de Integração

- `pnpm test:integration` - Executa testes de integração
- `pnpm test:integration:watch` - Executa em modo watch
- `pnpm test:integration:ci` - Executa com setup/teardown completo do Docker
- `pnpm test:integration:env-up` - Sobe ambiente Docker para testes
- `pnpm test:integration:env-down` - Para ambiente Docker

### Setup e Utilitários

- `pnpm test:setup` - Gera chaves VAPID para testes
- `pnpm docker:start` - Inicia container de desenvolvimento
- `pnpm docker:stop` - Para container de desenvolvimento
- `pnpm docker:clear` - Remove todos os containers e limpa networks

## Ambiente de Teste

### Docker

Os testes usam Docker Compose para criar ambientes isolados:

- **docker-compose.yml**: Ambiente de desenvolvimento
- **docker-compose.test.yml**: Ambiente de testes (E2E e integração)

Cada teste suite recebe um ID único e usa porta dinâmica para evitar conflitos.

### Variáveis de Ambiente

Configuradas em `test-env.ts`:

```typescript
{
  DIRECTUS_ADMIN_EMAIL: 'admin@example.com',
  DIRECTUS_ADMIN_PASSWORD: 'test-password-not-a-leak',
  PUSH_PUBLIC_VAPID_KEY: '...',
  PUSH_PRIVATE_VAPID_KEY: '...',
  // ... outras configurações
}
```

## Helpers de Teste

### DirectusE2EHelper

Classe auxiliar para simplificar operações comuns em testes E2E:

```typescript
import { DirectusE2EHelper } from './helpers/DirectusE2EHelper';

const directus = new DirectusE2EHelper(page, baseURL);

// Login
await directus.login('admin@example.com', 'password');

// Navegação
await directus.navigateToCollection('user_notification');

// Operações com coleções
const exists = await directus.collectionExists('push_subscription');
await directus.createItem('user_notification', { title: 'Test', body: 'Message' });

// Push notification específico
await directus.createPushSubscription({ ... });
await directus.createNotification({ title: 'Test', body: 'Message' });
const deliveries = await directus.getDeliveries(notificationId);

// Utilitários
await directus.screenshot('my-test');
await directus.wait(1000);
```

## Workflow de Testes E2E

O script `run-e2e.js` automatiza todo o processo:

1. **Detecção**: Verifica se deve usar `docker compose` ou `docker-compose`
2. **Limpeza**: Para containers existentes se necessário
3. **Build**: Compila a extensão
4. **Inicialização**: Sobe container do Directus com a extensão
5. **Health Check**: Aguarda container ficar healthy (até 3 minutos)
6. **Execução**: Roda testes do Playwright
7. **Relatório**: Gera relatório HTML com resultados

## CI/CD

Exemplo de pipeline GitHub Actions:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "20"

      - name: Install pnpm
        run: npm install -g pnpm@10.29.2

      - name: Install dependencies
        run: pnpm install

      - name: Generate VAPID keys
        run: pnpm test:setup

      - name: Run E2E tests
        run: pnpm test:e2e

      - name: Run Integration tests
        run: pnpm test:integration:ci

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: |
            playwright-report/
            test-results/

      - name: Cleanup
        if: always()
        run: pnpm docker:clear
```

## Troubleshooting

### Testes E2E falham no login

1. Verifique se o container está healthy: `docker ps`
2. Veja os logs: `docker logs directus-push-notification-main-11.14.1`
3. Execute com verbose: `VERBOSE=true pnpm test:e2e`
4. Execute em modo headed para ver o browser: `pnpm test:e2e:headed`

### Container não fica healthy

1. Aumente o timeout em `run-e2e.js`
2. Verifique memória e recursos disponíveis
3. Verifique logs do container

### Conflitos de porta

Execute `pnpm docker:clear` para limpar todos os containers.

### Testes de integração falham

1. Verifique se as chaves VAPID foram geradas: `pnpm test:setup`
2. Verifique o arquivo `.env.test`
3. Execute com ambiente completo: `pnpm test:integration:ci`

## Boas Práticas

1. **Execute `test:setup` antes dos testes** para gerar chaves VAPID
2. **Use `docker:clear` regularmente** para evitar acúmulo de containers
3. **Screenshots** são salvos automaticamente em falhas
4. **Traces e vídeos** são preservados apenas em falhas
5. **Use helpers** para simplificar operações comuns
6. **Nomeie testes descritivamente** para facilitar debug

## Recursos

- [Playwright Documentation](https://playwright.dev/)
- [Vitest Documentation](https://vitest.dev/)
- [Directus API Reference](https://docs.directus.io/reference/introduction/)
