import { exec } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "./test-logger.js";

const execAsync = promisify(exec);

function getTestEnv(testSuiteId: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    TEST_SUITE_ID: testSuiteId,
    DIRECTUS_VERSION: process.env.DIRECTUS_VERSION || "11.15.1",
  };
}

// Detectar qual comando do Docker Compose está disponível
let dockerComposeCommand: string | null = null;

async function getDockerComposeCommand(): Promise<string> {
  if (dockerComposeCommand) {
    return dockerComposeCommand;
  }

  try {
    await execAsync("docker compose version");
    dockerComposeCommand = "docker compose";
    logger.info("Using 'docker compose' command");
  } catch {
    try {
      await execAsync("docker-compose version");
      dockerComposeCommand = "docker-compose";
      logger.info("Using 'docker-compose' command");
    } catch {
      throw new Error(
        "Neither 'docker compose' nor 'docker-compose' command is available",
      );
    }
  }

  return dockerComposeCommand;
}

export async function setupTestEnvironment(testSuiteId: string): Promise<void> {
  logger.info(`Setting up test environment for suite: ${testSuiteId}`);

  try {
    // Build a extensão
    logger.info("Building extension...");
    await execAsync("pnpm build");

    // Iniciar o ambiente Docker
    logger.info("Starting Docker Compose...");
    const composeCmd = await getDockerComposeCommand();
    const { stdout, stderr } = await execAsync(
      `${composeCmd} --env-file .env.test -f docker-compose.test.yml up -d directus`,
      { env: getTestEnv(testSuiteId) },
    );

    if (stderr) logger.warn(`Docker Compose stderr: ${stderr}`);
    logger.info(`Docker Compose stdout: ${stdout}`);

    // Wait for container to be healthy (using docker healthcheck)
    logger.info("Waiting for container to be healthy...");
    const containerName = `directus-push-notification-${testSuiteId}-${process.env.DIRECTUS_VERSION || "latest"}`;
    await waitForContainerHealth(containerName);

    // Aguardar o Directus estar pronto
    logger.info("Waiting for Directus to be ready...");
    await waitForDirectus(testSuiteId);

    // Obter token de acesso
    const token = await getAccessToken(testSuiteId);
    process.env.DIRECTUS_ACCESS_TOKEN = token;

    logger.info("✓ Test environment setup complete");
  } catch (error) {
    logger.error("Failed to setup test environment:", error);
    throw error;
  }
}

export async function teardownTestEnvironment(
  testSuiteId: string,
): Promise<void> {
  logger.info(`Tearing down test environment for suite: ${testSuiteId}`);

  try {
    const composeCmd = await getDockerComposeCommand();
    await execAsync(
      `${composeCmd} --env-file .env.test -f docker-compose.test.yml down -v`,
      { env: getTestEnv(testSuiteId) },
    );
    logger.info("✓ Test environment teardown complete");
  } catch (error) {
    logger.error("Failed to teardown test environment:", error);
    throw error;
  }
}

async function waitForContainerHealth(
  containerName: string,
  retries = 100,
  delay = 2000,
): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const { stdout } = await execAsync(
        `docker inspect --format='{{.State.Health.Status}}' ${containerName}`,
      );
      const healthStatus = stdout.trim();

      if (healthStatus === "healthy") {
        logger.info(`✓ Container ${containerName} is healthy`);
        return;
      }

      logger.info(
        `Container health: ${healthStatus} (attempt ${i + 1}/${retries})`,
      );
    } catch {
      logger.info(
        `Waiting for container to be created (attempt ${i + 1}/${retries})`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw new Error(`Container ${containerName} did not become healthy`);
}

async function waitForDirectus(
  testSuiteId: string,
  retries = 90,
  delay = 2000,
): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      logger.info(`Connection attempt ${i + 1}/${retries}`);

      // Check if server is responding via docker exec
      const healthCheck = await dockerHttpRequest(
        "GET",
        "/server/health",
        undefined,
        undefined,
        testSuiteId,
      );

      if (healthCheck.status !== "ok") {
        throw new Error("Health check failed");
      }

      // Try to login to verify if the system is fully ready
      try {
        await dockerHttpRequest(
          "POST",
          "/auth/login",
          {
            email: "admin@example.com",
            password: "test-password-not-a-leak",
          },
          undefined,
          testSuiteId,
        );

        logger.info("✓ Directus is ready and accepting authentication");
        return;
      } catch {
        throw new Error("System not ready for authentication");
      }
    } catch (error) {
      if (i === retries - 1) {
        logger.error("Failed to connect to Directus", error);
        throw new Error("Directus failed to start", { cause: error });
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function getAccessToken(testSuiteId: string): Promise<string> {
  const containerName = `directus-push-notification-${testSuiteId}-${process.env.DIRECTUS_VERSION || "latest"}`;

  const { stdout } = await execAsync(
    `docker exec ${containerName} wget -qO- --post-data='{"email":"admin@example.com","password":"test-password-not-a-leak"}' --header='Content-Type:application/json' http://127.0.0.1:8055/auth/login`,
  );

  const response = JSON.parse(stdout);

  if (!response.data?.access_token) {
    throw new Error("Failed to get access token");
  }

  logger.info("✓ Access token obtained");
  return response.data.access_token;
}

export async function dockerHttpRequest(
  method: string,
  path: string,
  data?: Record<string, unknown>,
  headers?: Record<string, string>,
  testSuiteId?: string,
): Promise<Record<string, unknown>> {
  const suiteId = testSuiteId || "main";
  const containerName = `directus-push-notification-${suiteId}-${process.env.DIRECTUS_VERSION || "latest"}`;

  // Cria um script Node.js para fazer a requisição HTTP
  const headersJson = JSON.stringify(headers || {}).replace(/"/g, '\\"');
  const dataJson = data ? JSON.stringify(data).replace(/"/g, '\\"') : "";

  const nodeScript = `
const http = require('http');
const options = {
  hostname: '127.0.0.1',
  port: 8055,
  path: '${path}',
  method: '${method}',
  headers: JSON.parse("${headersJson}")
};
${data ? `const postData = "${dataJson}"; options.headers['Content-Type'] = 'application/json'; options.headers['Content-Length'] = Buffer.byteLength(postData);` : ""}
const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { console.log(data); });
});
req.on('error', (error) => { console.error(JSON.stringify({error: error.message})); process.exit(1); });
${data ? "req.write(postData);" : ""}
req.end();
`;

  const escapedScript = nodeScript.replace(/\n/g, " ").replace(/'/g, "'\\''");
  const fullCommand = `docker exec ${containerName} node -e '${escapedScript}'`;

  try {
    const { stdout } = await execAsync(fullCommand);

    // Se stdout estiver vazio, retornar objeto vazio ao invés de tentar fazer parse
    if (!stdout || stdout.trim() === "") {
      return {};
    }

    return JSON.parse(stdout);
  } catch (error) {
    logger.error("Docker HTTP request failed:", error);
    throw error;
  }
}
