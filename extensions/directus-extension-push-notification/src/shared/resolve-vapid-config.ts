export type VapidEnvSource = Record<string, string | undefined>;

export type ResolvedVapidConfig = {
	publicKey: string;
	privateKey: string;
	subject: string;
};

const MAILTO_FALLBACK = "mailto:admin@example.com";

const readEnvValue = (
	sources: VapidEnvSource[],
	keys: string[],
): string | undefined => {
	for (const source of sources) {
		for (const key of keys) {
			const value = source[key]?.trim();

			if (value) {
				return value;
			}
		}
	}

	return undefined;
};

const resolveVapidSubject = (
	sources: VapidEnvSource[],
): { subject: string; usedHttpFallback: boolean } => {
	const subject =
		readEnvValue(sources, ["PUSH_VAPID_SUBJECT"]) ||
		readEnvValue(sources, ["PUBLIC_URL"]) ||
		MAILTO_FALLBACK;

	if (subject.startsWith("http://")) {
		return { subject: MAILTO_FALLBACK, usedHttpFallback: true };
	}

	return { subject, usedHttpFallback: false };
};

/**
 * Resolve VAPID keys from Directus env and/or process.env.
 * Accepts extension-native PUSH_* names and Railway-style VAPID_* names.
 */
export const resolveVapidConfig = (
	...sources: VapidEnvSource[]
): ResolvedVapidConfig | null => {
	const publicKey = readEnvValue(sources, [
		"PUSH_PUBLIC_VAPID_KEY",
		"VAPID_PUBLIC_KEY",
	]);
	const privateKey = readEnvValue(sources, [
		"PUSH_PRIVATE_VAPID_KEY",
		"VAPID_PRIVATE_KEY",
	]);

	if (!publicKey || !privateKey) {
		return null;
	}

	const { subject } = resolveVapidSubject(sources);

	return {
		publicKey,
		privateKey,
		subject,
	};
};

export const resolveVapidSubjectWithFallback = (
	...sources: VapidEnvSource[]
): { subject: string; usedHttpFallback: boolean } => resolveVapidSubject(sources);
