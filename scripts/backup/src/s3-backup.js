import { log, copyObjectCrossBucket, listAllObjects } from "./utils.js";

export async function runFilesBackup({
	client,
	productionBucket,
	backupBucket,
	backupId,
}) {
	const filesPrefix = `${backupId}/files/`;
	log("info", "Starting files backup", {
		backupId,
		sourceBucket: productionBucket,
		destPrefix: filesPrefix,
	});

	const objects = await listAllObjects(client, productionBucket);
	let count = 0;
	let totalBytes = 0;

	for (const object of objects) {
		const sourceKey = object.Key;
		if (!sourceKey || sourceKey.endsWith("/")) continue;

		const destKey = `${filesPrefix}${sourceKey}`;
		await copyObjectCrossBucket(
			client,
			productionBucket,
			sourceKey,
			backupBucket,
			destKey,
		);
		count += 1;
		totalBytes += object.Size || 0;

		if (count % 100 === 0) {
			log("info", "Files backup progress", { backupId, count });
		}
	}

	log("info", "Files backup completed", {
		backupId,
		count,
		totalBytes,
	});

	return {
		success: true,
		count,
		totalBytes,
		prefix: filesPrefix,
	};
}
