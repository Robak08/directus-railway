#!/usr/bin/env node

import { exec, spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { promisify } from "util";

const execAsync = promisify(exec);

const VERBOSE =
  process.env.VERBOSE === "true" || process.argv.includes("--verbose");
const TEST_SUITE_ID = process.env.TEST_SUITE_ID || "main";
const DIRECTUS_VERSION = process.env.DIRECTUS_VERSION || "11.14.1";
const CONTAINER_NAME = `directus-push-notification-${TEST_SUITE_ID}-${DIRECTUS_VERSION}`;
const MOCK_CONTAINER_NAME = `directus-push-notification-mock-${TEST_SUITE_ID}-${DIRECTUS_VERSION}`;

function log(message) {
  if (VERBOSE) {
    console.log(`[E2E] ${message}`);
  }
}

function logError(message) {
  console.error(`[E2E ERROR] ${message}`);
}

function loadEnvTest() {
  const envPath = join(process.cwd(), ".env.test");

  if (!existsSync(envPath)) {
    return {};
  }

  const content = readFileSync(envPath, "utf-8");
  const vars = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");

    if (eqIdx < 0) continue;

    const key = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim();

    vars[key] = value;
  }

  return vars;
}

async function getDockerComposeCommand() {
  try {
    await execAsync("docker compose version");
    return "docker compose";
  } catch {
    try {
      await execAsync("docker-compose version");
      return "docker-compose";
    } catch {
      throw new Error(
        'Neither "docker compose" nor "docker-compose" found. Please install Docker Compose.',
      );
    }
  }
}

async function isContainerRunning() {
  try {
    const { stdout } = await execAsync(
      `docker ps --filter "name=${CONTAINER_NAME}" --format "{{.Names}}"`,
    );
    return stdout.trim() === CONTAINER_NAME;
  } catch {
    return false;
  }
}

async function getContainerPort() {
  try {
    const { stdout } = await execAsync(`docker port ${CONTAINER_NAME} 8055`);
    const match = stdout.trim().match(/:([0-9]+)$/);
    return match ? match[1] : "8055";
  } catch {
    return "8055";
  }
}

async function getMockServerPort() {
  try {
    const { stdout } = await execAsync(
      `docker port ${MOCK_CONTAINER_NAME} 8080`,
    );
    const match = stdout.trim().match(/:([0-9]+)$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function waitForHealthy(maxWaitSeconds = 180) {
  log(
    `Aguardando container ${CONTAINER_NAME} ficar healthy (timeout: ${maxWaitSeconds}s)...`,
  );
  const startTime = Date.now();
  const maxWaitMs = maxWaitSeconds * 1000;
  let lastStatus = "";

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const { stdout: status } = await execAsync(
        `docker inspect --format='{{.State.Health.Status}}' ${CONTAINER_NAME}`,
      );

      const currentStatus = status.trim();

      if (currentStatus !== lastStatus) {
        log(`Status do container: ${currentStatus}`);
        lastStatus = currentStatus;
      }

      if (currentStatus === "healthy") {
        log(`Container está healthy! ✓`);
        return true;
      }
    } catch {
      // Container pode não ter healthcheck ainda
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));

    if (VERBOSE) {
      process.stdout.write(".");
    }
  }

  if (VERBOSE) process.stdout.write("\n");
  logError(
    `Timeout: container não ficou healthy após ${maxWaitSeconds} segundos`,
  );
  return false;
}

async function stopContainer(composeCmd) {
  log(`Parando container existente ${CONTAINER_NAME}...`);

  const vapidEnv = loadEnvTest();
  const vapidVars = [
    `TEST_SUITE_ID=${TEST_SUITE_ID}`,
    `DIRECTUS_VERSION=${DIRECTUS_VERSION}`,
    vapidEnv.PUSH_PUBLIC_VAPID_KEY
      ? `PUSH_PUBLIC_VAPID_KEY=${vapidEnv.PUSH_PUBLIC_VAPID_KEY}`
      : "",
    vapidEnv.PUSH_PRIVATE_VAPID_KEY
      ? `PUSH_PRIVATE_VAPID_KEY=${vapidEnv.PUSH_PRIVATE_VAPID_KEY}`
      : "",
    vapidEnv.PUSH_VAPID_SUBJECT
      ? `PUSH_VAPID_SUBJECT=${vapidEnv.PUSH_VAPID_SUBJECT}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  try {
    await execAsync(
      `${vapidVars} ${composeCmd} -f docker-compose.test.yml down --remove-orphans --volumes`,
    );
    log("Container parado com sucesso ✓");
  } catch {
    // Ignorar erro se container não existir
    log("Nenhum container para parar");
  }
}

async function startContainer(composeCmd) {
  log(`Iniciando container ${CONTAINER_NAME}...`);

  const vapidEnv = loadEnvTest();
  const vapidVars = [
    `TEST_SUITE_ID=${TEST_SUITE_ID}`,
    `DIRECTUS_VERSION=${DIRECTUS_VERSION}`,
    vapidEnv.PUSH_PUBLIC_VAPID_KEY
      ? `PUSH_PUBLIC_VAPID_KEY=${vapidEnv.PUSH_PUBLIC_VAPID_KEY}`
      : "",
    vapidEnv.PUSH_PRIVATE_VAPID_KEY
      ? `PUSH_PRIVATE_VAPID_KEY=${vapidEnv.PUSH_PRIVATE_VAPID_KEY}`
      : "",
    vapidEnv.PUSH_VAPID_SUBJECT
      ? `PUSH_VAPID_SUBJECT=${vapidEnv.PUSH_VAPID_SUBJECT}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  try {
    await execAsync(
      `${vapidVars} ${composeCmd} -f docker-compose.test.yml up -d directus mock-push-server`,
    );
    log("Containers iniciados com sucesso ✓");
  } catch (error) {
    logError(`Falha ao iniciar containers: ${error.message}`);
    throw error;
  }
}

async function runTests(port) {
  log("Iniciando execução dos testes E2E...");

  const directusUrl = `http://localhost:${port}`;
  log(`Directus URL: ${directusUrl}`);

  const mockPort = await getMockServerPort();
  const mockServerUrl = mockPort ? `https://localhost:${mockPort}` : "";
  const mockEndpointBase = mockPort ? `https://mock-push-server:8080` : "";
  if (mockPort) {
    log(`Mock Push Server URL: ${mockServerUrl}`);
    log(`Mock Push Endpoint Base (interno): ${mockEndpointBase}`);
  }

  const spawnEnv = {
    ...process.env,
    DIRECTUS_URL: directusUrl,
  };

  if (mockPort) {
    spawnEnv.MOCK_PUSH_SERVER_URL = mockServerUrl;
    spawnEnv.MOCK_PUSH_ENDPOINT_BASE = mockEndpointBase;
  }

  const playwrightArgs = ["playwright", "test", ...process.argv.slice(2)];

  return new Promise((resolve, reject) => {
    const child = spawn("npx", playwrightArgs, {
      env: spawnEnv,
      stdio: "inherit",
      shell: false,
    });

    child.on("close", (code) => {
      if (code === 0) {
        log("Testes concluídos com sucesso ✓");
        resolve();
      } else {
        logError(`Testes finalizaram com código de erro: ${code}`);
        reject(new Error(`Tests failed with exit code ${code}`));
      }
    });
  });
}

async function main() {
  try {
    log("=== Iniciando pipeline de testes E2E ===\n");

    // 1. Verificar comando docker compose
    const composeCmd = await getDockerComposeCommand();
    log(`Usando: ${composeCmd}`);

    // 2. Parar container existente (se houver)
    log(`Verificando se container ${CONTAINER_NAME} está rodando...`);
    const isRunning = await isContainerRunning();

    if (isRunning) {
      log(
        "Container antigo encontrado, reiniciando para garantir configuração correta...",
      );
      await stopContainer(composeCmd);
    } else {
      log("Nenhum container rodando ✓");
    }

    // 3. Iniciar container novo
    await startContainer(composeCmd);

    // 4. Aguardar ficar healthy
    if (!(await waitForHealthy())) {
      process.exit(1);
    }

    // 4b. Aguardar mock-push-server (opcional, não bloqueia)
    try {
      const mockPort = await getMockServerPort();
      if (mockPort) {
        log("Mock push server iniciado ✓");
      }
    } catch {
      log(
        "Mock push server não disponível (testes de confirmação serão ignorados)",
      );
    }

    // 5. Obter porta do container
    const port = await getContainerPort();
    log(`Container exposto na porta: ${port}`);

    // 6. Rodar testes
    await runTests(port);

    log("\n=== Pipeline de testes E2E concluído com sucesso ===");
    process.exit(0);
  } catch (error) {
    logError(`\nFalha na execução: ${error.message}`);
    process.exit(1);
  }
}

main();
