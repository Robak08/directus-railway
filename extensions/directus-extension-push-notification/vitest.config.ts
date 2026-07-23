import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 180000,
    hookTimeout: 480000, // 8 minutos para setup Docker
    // Executar testes de integração sequencialmente para evitar conflitos Docker
    fileParallelism: false,
    maxConcurrency: 1,
    // Excluir testes E2E do Playwright
    exclude: ["**/node_modules/**", "**/.git/**", "**/tests/e2e/**"],
  },
});
