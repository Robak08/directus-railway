function parseBoolean(value, defaultValue) {
	if (value === undefined || value === null || value === "") {
		return defaultValue;
	}
	const normalized = String(value).toLowerCase();
	if (["1", "true", "yes", "on"].includes(normalized)) return true;
	if (["0", "false", "no", "off"].includes(normalized)) return false;
	return defaultValue;
}

function parsePositiveInt(value, defaultValue) {
	if (value === undefined || value === null || value === "") {
		return defaultValue;
	}
	const parsed = Number.parseInt(String(value), 10);
	if (!Number.isFinite(parsed) || parsed < 1) {
		return defaultValue;
	}
	return parsed;
}

function requireEnv(name) {
	const value = process.env[name];
	if (!value || String(value).trim() === "") {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return String(value).trim();
}

function loadDbConnectionString() {
	const direct = process.env.DB_CONNECTION_STRING?.trim();
	if (direct) return direct;
	const databaseUrl = process.env.DATABASE_URL?.trim();
	if (databaseUrl) return databaseUrl;
	throw new Error(
		"Missing required environment variable: DB_CONNECTION_STRING (or DATABASE_URL)",
	);
}

export function loadConfig() {
	const dbConnectionString = loadDbConnectionString();
	const productionBucket = requireEnv("STORAGE_S3_BUCKET");
	const backupBucket = requireEnv("BACKUP_S3_BUCKET");
	const accessKeyId = requireEnv("STORAGE_S3_KEY");
	const secretAccessKey = requireEnv("STORAGE_S3_SECRET");
	const region = requireEnv("STORAGE_S3_REGION");
	const endpoint = (process.env.STORAGE_S3_ENDPOINT || "s3.amazonaws.com").trim();

	return {
		dbConnectionString,
		productionBucket,
		backupBucket,
		s3: {
			accessKeyId,
			secretAccessKey,
			region,
			endpoint,
		},
		retentionDays: parsePositiveInt(process.env.BACKUP_RETENTION_DAYS, 30),
		filesEnabled: parseBoolean(process.env.BACKUP_FILES_ENABLED, true),
	};
}
