# Testes E2E - Push Notification Extension

Este diretório contém os testes end-to-end (E2E) usando Playwright para validar a funcionalidade completa da extensão de push notification no Directus.

## Estrutura

```
tests/e2e/
├── push-notification-collection.test.ts  # Testes principais
├── screenshots/                          # Screenshots dos testes (gitignored)
└── README.md                            # Esta documentação
```

## Executando os Testes

### Pré-requisitos

1. Ter o Docker e Docker Compose instalados
2. Ter o Node.js 20+ e pnpm instalados
3. Ter feito o build da extensão: `pnpm build`

### Comandos Disponíveis

**Testes Isolados (docker-compose.test.yml):**

```bash
# Executar todos os testes E2E em container isolado
pnpm test:e2e
```

Este comando sobe um ambiente Directus temporário, executa os testes e derruba tudo ao final.

**Testes contra Ambiente de Desenvolvimento:**

```bash
# 1. Subir o ambiente de desenvolvimento
pnpm docker:start

# 2. Executar testes contra localhost:8055
pnpm test:e2e:dev

# 3. Se necessário, inspecionar manualmente em http://localhost:8055

# 4. Derrubar o ambiente quando terminar
pnpm docker:stop
```

Este workflow é ideal para desenvolvimento iterativo, pois permite executar os testes sem derrubar o container, facilitando debug e inspeção manual.

**Outras Opções:**

```bash
# Executar com interface visual
pnpm test:e2e:ui

# Executar em modo debug
pnpm test:e2e:debug

# Executar com navegador visível
pnpm test:e2e:headed

# Ver relatório dos últimos testes
pnpm test:e2e:report
```

## O que os Testes Validam

### 1. Login e Dashboard

- Login com credenciais de admin
- Acesso ao dashboard do Directus
- Navegação lateral carregada

### 2. Collection no Menu

- Collection "PushNotification" aparece no menu lateral
- Navegação funciona corretamente

### 3. Acesso à Collection

- Página da collection PushNotification é acessível
- Sem erros de permissão ou forbidden
- Elementos da UI carregam corretamente

### 4. Campos da Collection

- Campos esperados estão presentes no formulário
- Status, endpoint, subscription, user
- Interface de criação funciona

### 5. Endpoints da API

- Endpoint `/push-notification` está registrado
- Não retorna 404
- Autenticação funciona

### 6. Criação de Items

- Criar item via API funciona
- Dados são salvos corretamente
- Validação de campos obrigatórios

### 7. Listagem de Items

- Items criados aparecem na listagem
- Tabela/grid exibe dados corretamente

## Configuração do Ambiente

Os testes usam o mesmo ambiente Docker configurado para os testes de integração:

- **URL Base:** `http://localhost:8055` (configurável via `DIRECTUS_URL`)
- **Admin Email:** `admin@example.com`
- **Admin Password:** `test-password-not-a-leak`
- **Directus Version:** Configurável via `DIRECTUS_VERSION`

## Debugging

### Screenshots

Todos os testes tiram screenshots automaticamente em `tests/e2e/screenshots/`:

- `dashboard.png` - Dashboard após login
- `navigation-with-push.png` - Menu lateral com collection
- `push-notification-collection.png` - Página da collection
- `push-notification-form.png` - Formulário de criação
- `push-notification-with-item.png` - Collection com item criado
- `push-notification-final.png` - Estado final

### Videos e Traces

Em caso de falha, o Playwright gera automaticamente:

- **Videos:** Gravação da execução do teste
- **Traces:** Trace interativo para debug (acessível via `pnpm test:e2e:report`)

### Modo Debug

Para debugar um teste específico:

```bash
# Debug com Playwright Inspector
pnpm test:e2e:debug

# Ou executar com navegador visível
pnpm test:e2e:headed
```

## Troubleshooting

### Timeout durante login

- Aumentar timeout no `playwright.config.cjs`
- Verificar se o Directus está rodando corretamente
- Verificar logs do container Docker

### Collection não aparece

- Verificar se o hook `db-configuration` executou corretamente
- Verificar logs do Directus para erros de migração
- Executar `pnpm test:integration` primeiro para validar o hook

### Endpoints não encontrados (404)

- Verificar se a extensão foi compilada: `pnpm build`
- Verificar se os arquivos estão em `dist/`
- Verificar se o endpoint `push-notification` está registrado

### Screenshots não são geradas

- Verificar se o diretório `tests/e2e/screenshots/` existe
- Verificar permissões de escrita
- Screenshots são ignoradas pelo git (`.gitignore`)

## Referências

- [Playwright Documentation](https://playwright.dev/)
- [Directus API Documentation](https://docs.directus.io/reference/introduction.html)
- Implementação similar: `directus-extension-inframe/tests/e2e/`
