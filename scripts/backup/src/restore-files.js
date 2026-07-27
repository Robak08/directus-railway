import { loadConfig } from "./config.js";
import {
	copyObjectCrossBucket,
	createS3Client,
	isValidBackupId,
	listAllObjects,
	log,
} from "./utils.js";

function parseArgs(argv) {
	const args = { backupId: null, dryRun: true, confirm: false };
	for (let i = 2; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--backup-id" && argv[i + 1]) {
			args.backupId = argv[++i];
		} else if (arg.startsWith("--backup-id=")) {
			args.backupId = arg.slice("--backup-id=".length);
		} else if (arg === "--confirm") {
			args.confirm = true;
			args.dryRun = false;
		} else if (arg === "--dry-run") {
			args.dryRun = true;
			args.confirm = false;
		}
	}
	if (args.confirm) args.dryRun = false;
	return args;
}

async function main() {
	const { backupId, dryRun, confirm } = parseArgs(process.argv);
	if (!backupId || !isValidBackupId(backupId)) {
		console.error(
			"Usage: node src/restore-files.js --backup-id 2026-07-23T03-00-00Z [--dry-run] [--confirm]",
		);
		process.exit(1);
	}

	if (!confirm && dryRun) {
		log("info", "Dry run mode (pass --confirm to execute)", { backupId });
	}

	const config = loadConfig();
	const client = createS3Client(config.s3);
	const backupPrefix = `${backupId}/files/`;

	try {
		const objects = await listAllObjects(
			client,
			config.backupBucket,
			backupPrefix,
		);

		if (objects.length === 0) {
			throw new Error(`No files found under s3://${config.backupBucket}/${backupPrefix}`);
		}

		let restored = 0;
		for (const object of objects) {
			const backupKey = object.Key;
			if (!backupKey || backupKey.endsWith("/")) continue;

			const productionKey = backupKey.slice(backupPrefix.length);
			if (!productionKey) continue;

			if (dryRun) {
				log("info", "Would restore object", {
					from: backupKey,
					to: `s3://${config.productionBucket}/${productionKey}`,
				});
			} else {
				await copyObjectCrossBucket(
					client,
					config.backupBucket,
					backupKey,
					config.productionBucket,
					productionKey,
				);
				restored += 1;
				if (restored % 100 === 0) {
					log("info", "Files restore progress", { backupId, restored });
				}
			}
		}

		log("info", dryRun ? "Dry run completed" : "Files restore completed", {
			backupId,
			objectCount: objects.length,
			restored: dryRun ? 0 : restored,
		});

		client.destroy();
		process.exit(0);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log("error", "Files restore failed", { backupId, error: message });
		client.destroy();
		process.exit(1);
	}
}

main();
