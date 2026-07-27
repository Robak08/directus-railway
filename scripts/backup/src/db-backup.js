import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { log, uploadFile } from "./utils.js";

export async function runDatabaseBackup({
	client,
	backupBucket,
	backupId,
	dbConnectionString,
	workDir,
}) {
	const dumpPath = join(workDir, "database.dump");
	const s3Key = `${backupId}/database.dump`;

	log("info", "Starting database backup", { backupId });

	const pgEnv = { ...process.env };
	if (
		!dbConnectionString.includes("sslmode=") &&
		!pgEnv.PGSSLMODE &&
		!pgEnv.PGSSLCERT
	) {
		pgEnv.PGSSLMODE = "require";
	}

	await new Promise((resolve, reject) => {
		const child = spawn(
			"pg_dump",
			["--format=custom", "--no-owner", "--no-acl", `--file=${dumpPath}`, dbConnectionString],
			{ stdio: ["ignore", "pipe", "pipe"], env: pgEnv },
		);

		let stderr = "";
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});

		child.on("error", (err) => {
			reject(new Error(`Failed to start pg_dump: ${err.message}`));
		});

		child.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(
					new Error(
						`pg_dump exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`,
					),
				);
			}
		});
	});

	const fileStat = await stat(dumpPath);
	log("info", "Uploading database dump to S3", {
		backupId,
		sizeBytes: fileStat.size,
		key: s3Key,
	});

	await uploadFile(
		client,
		backupBucket,
		s3Key,
		dumpPath,
		"application/octet-stream",
	);

	log("info", "Database backup completed", {
		backupId,
		sizeBytes: fileStat.size,
	});

	return {
		success: true,
		sizeBytes: fileStat.size,
		key: s3Key,
		localPath: dumpPath,
	};
}
