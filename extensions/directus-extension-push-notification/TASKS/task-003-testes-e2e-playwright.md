# Task 003 — Testes E2E com Playwright

Status: done  
Type: feat  
Assignee: Sidarta Veloso

## Description

Implementar testes end-to-end com Playwright para validar a interface e funcionalidade completa da extensão de push notification no Directus.

## Objectives

1. **Teste de UI da Collection**
   - Verificar que a coleção PushNotification aparece no menu lateral do Directus
   - Validar que os campos estão sendo exibidos corretamente na interface
   - Confirmar que é possível navegar e visualizar items da coleção

2. **Teste de Envio de Notificação**
   - Criar um item de push notification via UI
   - Enviar notificação para o próprio usuário usando o endpoint da API
   - Validar que o registro de PushNotification foi criado no banco
   - Confirmar que a notificação aparece na lista de items

3. **Teste de Subscription**
   - Verificar endpoint de registro de subscription
   - Validar que subscription é salva com dados corretos (endpoint, keys, user)
   - Confirmar que campos obrigatórios estão funcionando

## Technical Requirements

- Usar Playwright (já configurado no projeto)
- Seguir padrão do directus-extension-inframe (tests/e2e/)
- Testes devem:
  - Fazer login no Directus
  - Navegar pela interface
  - Interagir com collections e endpoints
  - Validar dados criados

## References

- Ver implementação similar em: `directus-extension-inframe/tests/e2e/directus-login-collections.spec.ts`
- Playwright config: `playwright.config.cjs`
- Docker test environment já configurado

## Acceptance Criteria

- [x] Testes E2E criados em `tests/e2e/`
- [x] Collection PushNotification validada na UI
- [x] Fluxo de envio de notificação testado
- [x] Todos os testes configurados com `pnpm test:e2e`
- [x] Documentação atualizada com instruções de testes E2E (tests/e2e/README.md)
- [x] Docker Compose configurado para executar testes via container Playwright
- [x] Seguindo padrão do directus-extension-inframe

## Implementation Summary

Implementados 8 testes E2E com Playwright:

1. Login e acesso ao dashboard
2. Verificação da collection no menu
3. Acesso à collection PushNotification
4. Exibição dos campos corretos
5. Verificação dos endpoints registrados
6. Criação de item via API
7. Validação do item na listagem

Configuração:

- Docker Compose com serviço `tests` usando imagem Playwright
- Testes executam dentro do container na mesma rede do Directus
- Sem mapeamento de portas (acesso via nome de serviço `directus:8055`)
- Screenshots automáticos em `tests/e2e/screenshots/`
- Documentação completa em `tests/e2e/README.md`
