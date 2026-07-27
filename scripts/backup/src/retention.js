import {
	deleteBackupSet,
	listBackupSetPrefixes,
	log,
	parseBackupIdToDate,
} from "./utils.js";

export async function pruneOldBackups({
	client,
	backupBucket,
	retentionDays,
	keepBackupId,
}) {
	const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
	const backupIds = await listBackupSetPrefixes(client, backupBucket);
	const toDelete = [];

	for (const backupId of backupIds) {
		if (backupId === keepBackupId) continue;
		const created = parseBackupIdToDate(backupId);
		if (!created) continue;
		if (created.getTime() < cutoff) {
			toDelete.push(backupId);
		}
	}

	log("info", "Retention prune", {
		retentionDays,
		candidates: toDelete.length,
	});

	for (const backupId of toDelete) {
		const deletedObjects = await deleteBackupSet(
			client,
			backupBucket,
			backupId,
		);
		log("info", "Deleted old backup set", {
			backupId,
			deletedObjects,
		});
	}

	return { deletedSets: toDelete.length };
}
