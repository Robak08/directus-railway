import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import {
	S3Client,
	GetObjectCommand,
	PutObjectCommand,
	ListObjectsV2Command,
	CopyObjectCommand,
	ListObjectVersionsCommand,
	DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

const BACKUP_ID_PATTERN =
	/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/;

export function createBackupId(date = new Date()) {
	return date
		.toISOString()
		.replace(/\.\d{3}Z$/, "Z")
		.replace(/:/g, "-");
}

export function isValidBackupId(backupId) {
	return BACKUP_ID_PATTERN.test(backupId);
}

export function backupPrefix(backupId) {
	return `${backupId}/`;
}

export function log(level, message, extra = {}) {
	const entry = {
		time: new Date().toISOString(),
		level,
		message,
		...extra,
	};
	console.log(JSON.stringify(entry));
}

export function createS3Client(s3Config) {
	const endpoint = s3Config.endpoint.replace(/^https?:\/\//, "");
	const useCustomEndpoint = endpoint && !endpoint.startsWith("s3.");

	return new S3Client({
		region: s3Config.region,
		credentials: {
			accessKeyId: s3Config.accessKeyId,
			secretAccessKey: s3Config.secretAccessKey,
		},
		...(useCustomEndpoint
			? {
					endpoint: endpoint.startsWith("http")
						? endpoint
						: `https://${endpoint}`,
					forcePathStyle: true,
				}
			: {}),
	});
}

export async function createWorkDir(backupId) {
	const dir = join(tmpdir(), `krakovanopas-backup-${backupId}`);
	await mkdir(dir, { recursive: true });
	return dir;
}

export async function removeWorkDir(dir) {
	await rm(dir, { recursive: true, force: true });
}

export async function uploadFile(client, bucket, key, filePath, contentType) {
	const body = createReadStream(filePath);
	await client.send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: key,
			Body: body,
			ContentType: contentType,
		}),
	);
}

export async function putJson(client, bucket, key, data) {
	await client.send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: key,
			Body: JSON.stringify(data, null, 2),
			ContentType: "application/json",
		}),
	);
}

export async function downloadObjectToFile(client, bucket, key, filePath) {
	const response = await client.send(
		new GetObjectCommand({ Bucket: bucket, Key: key }),
	);
	if (!response.Body) {
		throw new Error(`Empty response body for s3://${bucket}/${key}`);
	}
	await pipeline(Readable.from(response.Body), createWriteStream(filePath));
}

export async function listAllObjects(client, bucket, prefix = "") {
	const objects = [];
	let continuationToken;

	do {
		const response = await client.send(
			new ListObjectsV2Command({
				Bucket: bucket,
				Prefix: prefix,
				ContinuationToken: continuationToken,
			}),
		);
		for (const item of response.Contents || []) {
			if (item.Key) objects.push(item);
		}
		continuationToken = response.IsTruncated
			? response.NextContinuationToken
			: undefined;
	} while (continuationToken);

	return objects;
}

export async function copyObjectCrossBucket(
	client,
	sourceBucket,
	sourceKey,
	destBucket,
	destKey,
) {
	const copySource = encodeURIComponent(`${sourceBucket}/${sourceKey}`);
	await client.send(
		new CopyObjectCommand({
			Bucket: destBucket,
			Key: destKey,
			CopySource: copySource,
		}),
	);
}

export async function listBackupSetPrefixes(client, backupBucket) {
	const prefixes = new Set();
	let continuationToken;

	do {
		const response = await client.send(
			new ListObjectsV2Command({
				Bucket: backupBucket,
				Delimiter: "/",
				ContinuationToken: continuationToken,
			}),
		);
		for (const cp of response.CommonPrefixes || []) {
			if (!cp.Prefix) continue;
			const id = cp.Prefix.replace(/\/$/, "");
			if (isValidBackupId(id)) prefixes.add(id);
		}
		continuationToken = response.IsTruncated
			? response.NextContinuationToken
			: undefined;
	} while (continuationToken);

	return [...prefixes].sort();
}

export async function deleteBackupSet(client, backupBucket, backupId) {
	const prefix = backupPrefix(backupId);
	const objects = await listAllObjects(client, backupBucket, prefix);

	if (objects.length === 0) {
		return 0;
	}

	let deleted = 0;
	for (let i = 0; i < objects.length; i += 1000) {
		const chunk = objects.slice(i, i + 1000);
		await client.send(
			new DeleteObjectsCommand({
				Bucket: backupBucket,
				Delete: {
					Objects: chunk.map((o) => ({ Key: o.Key })),
					Quiet: true,
				},
			}),
		);
		deleted += chunk.length;
	}

	try {
		let keyMarker;
		let versionIdMarker;
		do {
			const versions = await client.send(
				new ListObjectVersionsCommand({
					Bucket: backupBucket,
					Prefix: prefix,
					KeyMarker: keyMarker,
					VersionIdMarker: versionIdMarker,
				}),
			);
			const toDelete = [
				...(versions.Versions || []),
				...(versions.DeleteMarkers || []),
			].map((v) => ({ Key: v.Key, VersionId: v.VersionId }));

			if (toDelete.length > 0) {
				await client.send(
					new DeleteObjectsCommand({
						Bucket: backupBucket,
						Delete: { Objects: toDelete, Quiet: true },
					}),
				);
			}

			if (!versions.IsTruncated) break;
			keyMarker = versions.NextKeyMarker;
			versionIdMarker = versions.NextVersionIdMarker;
		} while (true);
	} catch {
		// Version cleanup is best-effort when versioning is disabled.
	}

	return deleted;
}

export function parseBackupIdToDate(backupId) {
	if (!isValidBackupId(backupId)) return null;
	const iso = backupId.replace(
		/^(\d{4}-\d{2}-\d{2}T)(\d{2})-(\d{2})-(\d{2})Z$/,
		"$1$2:$3:$4Z",
	);
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? null : date;
}

export function createInitialManifest(backupId) {
	return {
		backupId,
		status: "running",
		startedAt: new Date().toISOString(),
		completedAt: null,
		durationMs: null,
		productionBucket: null,
		backupBucket: null,
		database: { success: false, sizeBytes: null, key: null },
		files: { success: false, count: 0, totalBytes: 0, enabled: true },
		error: null,
	};
}
