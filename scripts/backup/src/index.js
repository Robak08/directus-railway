import { loadConfig } from "./config.js";
import { runDatabaseBackup } from "./db-backup.js";
import { pruneOldBackups } from "./retention.js";
import { runFilesBackup } from "./s3-backup.js";
import {
	createBackupId,
	createInitialManifest,
	createS3Client,
	createWorkDir,
	log,
	putJson,
	removeWorkDir,
} from "./utils.js";

async function writeManifest(client, bucket, backupId, manifest) {
	await putJson(client, bucket, `${backupId}/manifest.json`, manifest);
}

async function main() {
	const started = Date.now();
	let config;
	let backupId;
	let client;
	let workDir;

	log("info", "Backup container starting");

	try {
		config = loadConfig();
		backupId = createBackupId();
		client = createS3Client(config.s3);
		workDir = await createWorkDir(backupId);

		const manifest = createInitialManifest(backupId);
		manifest.productionBucket = config.productionBucket;
		manifest.backupBucket = config.backupBucket;
		manifest.files.enabled = config.filesEnabled;

		log("info", "Backup run started", { backupId });

		const dbResult = await runDatabaseBackup({
			client,
			backupBucket: config.backupBucket,
			backupId,
			dbConnectionString: config.dbConnectionString,
			workDir,
		});
		manifest.database = {
			success: dbResult.success,
			sizeBytes: dbResult.sizeBytes,
			key: dbResult.key,
		};

		if (config.filesEnabled) {
			const filesResult = await runFilesBackup({
				client,
				productionBucket: config.productionBucket,
				backupBucket: config.backupBucket,
				backupId,
			});
			manifest.files = {
				success: filesResult.success,
				count: filesResult.count,
				totalBytes: filesResult.totalBytes,
				enabled: true,
			};
		} else {
			manifest.files = {
				success: true,
				count: 0,
				totalBytes: 0,
				enabled: false,
			};
			log("info", "Files backup skipped (BACKUP_FILES_ENABLED=false)", {
				backupId,
			});
		}

		await pruneOldBackups({
			client,
			backupBucket: config.backupBucket,
			retentionDays: config.retentionDays,
			keepBackupId: backupId,
		});

		manifest.status = "completed";
		manifest.completedAt = new Date().toISOString();
		manifest.durationMs = Date.now() - started;
		await writeManifest(client, config.backupBucket, backupId, manifest);

		log("info", "Backup run completed", {
			backupId,
			durationMs: manifest.durationMs,
		});

		client.destroy();
		await removeWorkDir(workDir);
		process.exit(0);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log("error", "Backup run failed", { backupId, error: message });

		if (client && config && backupId) {
			try {
				const manifest = createInitialManifest(backupId);
				manifest.productionBucket = config.productionBucket;
				manifest.backupBucket = config.backupBucket;
				manifest.status = "failed";
				manifest.error = message;
				manifest.completedAt = new Date().toISOString();
				manifest.durationMs = Date.now() - started;
				await writeManifest(client, config.backupBucket, backupId, manifest);
			} catch (manifestError) {
				log("error", "Failed to write failure manifest", {
					error:
						manifestError instanceof Error
							? manifestError.message
							: String(manifestError),
				});
			}
			client.destroy();
		}

		if (workDir) {
			await removeWorkDir(workDir).catch(() => {});
		}

		process.exit(1);
	}
}

main();
