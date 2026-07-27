import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import {
	createS3Client,
	downloadObjectToFile,
	isValidBackupId,
	log,
	removeWorkDir,
} from "./utils.js";

function parseArgs(argv) {
	const args = { backupId: null };
	for (let i = 2; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--backup-id" && argv[i + 1]) {
			args.backupId = argv[++i];
		} else if (arg.startsWith("--backup-id=")) {
			args.backupId = arg.slice("--backup-id=".length);
		}
	}
	return args;
}

async function main() {
	const { backupId } = parseArgs(process.argv);
	if (!backupId || !isValidBackupId(backupId)) {
		console.error(
			"Usage: node src/restore-db.js --backup-id 2026-07-23T03-00-00Z",
		);
		process.exit(1);
	}

	const config = loadConfig();
	const client = createS3Client(config.s3);
	const workDir = join(tmpdir(), `krakovanopas-restore-db-${backupId}`);
	const dumpPath = join(workDir, "database.dump");
	const s3Key = `${backupId}/database.dump`;

	try {
		await mkdir(workDir, { recursive: true });
		log("info", "Downloading database dump", {
			backupId,
			bucket: config.backupBucket,
			key: s3Key,
		});
		await downloadObjectToFile(client, config.backupBucket, s3Key, dumpPath);

		log("info", "Running pg_restore (stop Directus first)", { backupId });

		await new Promise((resolve, reject) => {
			const child = spawn(
				"pg_restore",
				[
					"--clean",
					"--if-exists",
					"--no-owner",
					"--no-acl",
					`--dbname=${config.dbConnectionString}`,
					dumpPath,
				],
				{ stdio: ["ignore", "pipe", "pipe"] },
			);

			let stderr = "";
			child.stderr.on("data", (chunk) => {
				stderr += chunk.toString();
			});

			child.on("error", (err) => {
				reject(new Error(`Failed to start pg_restore: ${err.message}`));
			});

			child.on("close", (code) => {
				if (code === 0) {
					resolve();
				} else {
					reject(
						new Error(
							`pg_restore exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`,
						),
					);
				}
			});
		});

		log("info", "Database restore completed", { backupId });
		client.destroy();
		await removeWorkDir(workDir);
		process.exit(0);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log("error", "Database restore failed", { backupId, error: message });
		client.destroy();
		await rm(workDir, { recursive: true, force: true }).catch(() => {});
		process.exit(1);
	}
}

main();
