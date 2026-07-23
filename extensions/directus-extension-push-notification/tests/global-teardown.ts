/**
 * Playwright Global Teardown
 * Para o ambiente Docker após todos os testes E2E
 */

import { teardownTestEnvironment } from "./setup.js";

export default async function globalTeardown() {
  const testSuiteId = process.env.TEST_SUITE_ID || "e2e-main";

  console.log("\n🧹 Cleaning up Directus container...\n");

  await teardownTestEnvironment(testSuiteId);

  console.log("\n✅ Cleanup complete!\n");
}
