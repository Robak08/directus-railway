const cspQuotedKeywords = new Set([
	"none",
	"self",
	"strict-dynamic",
	"report-sample",
	"inline-speculation-rules",
	"unsafe-inline",
	"unsafe-eval",
	"unsafe-hashes",
	"wasm-unsafe-eval",
]);

function normalizeCspDirectiveValue(rawValue) {
	if (typeof rawValue !== "string") return rawValue;

	const trimmed = rawValue.trim();
	if (!trimmed) return undefined;

	let tokens = [];

	if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
		try {
			const parsed = JSON.parse(trimmed);
			if (Array.isArray(parsed)) {
				tokens = parsed.filter((entry) => typeof entry === "string");
			}
		} catch {
			// Fall back to plain token parsing below.
		}
	}

	if (tokens.length === 0) {
		tokens = trimmed
			.replace(/[;,]+/g, " ")
			.replace(/[\r\n\t]+/g, " ")
			.split(/\s+/)
			.filter(Boolean);
	}

	const normalizedTokens = tokens
		.map((token) => token.trim().replace(/^"+|"+$/g, ""))
		.filter(Boolean)
		.map((token) => {
			const lower = token.toLowerCase();

			if (cspQuotedKeywords.has(lower)) {
				return `'${lower}'`;
			}

			if (/^https?:\/\//i.test(token)) {
				try {
					return new URL(token).origin;
				} catch {
					return token;
				}
			}

			return token;
		});

	return normalizedTokens.length > 0 ? normalizedTokens.join(" ") : undefined;
}

module.exports = function (env) {
	return {
		// Railway inputs
		ADMIN_EMAIL: env.ADMIN_EMAIL,
		ADMIN_PASSWORD: env.ADMIN_PASSWORD,
		KEY: env.KEY,
		SECRET: env.SECRET,

		// https://docs.railway.app/guides/public-networking#railway-provided-port
		PORT: env.PORT,

		PUBLIC_URL: `http://0.0.0.0:${env.PORT}`,

		// Database & storage variables for connecting to PostGIS and S3/local storage
		DB_CLIENT: "pg",
		DB_CONNECTION_STRING: env.DB_CONNECTION_STRING,
		STORAGE_LOCATIONS: env.STORAGE_LOCATIONS,
		STORAGE_S3_DRIVER: env.STORAGE_S3_DRIVER,
		STORAGE_S3_KEY: env.STORAGE_S3_KEY,
		STORAGE_S3_SECRET: env.STORAGE_S3_SECRET,
		STORAGE_S3_REGION: env.STORAGE_S3_REGION,
		STORAGE_S3_BUCKET: env.STORAGE_S3_BUCKET,
		STORAGE_S3_ENDPOINT: env.STORAGE_S3_ENDPOINT,
		WEBSOCKETS_ENABLED: env.WEBSOCKETS_ENABLED,
		CORS_ENABLED: env.CORS_ENABLED || true,
		CORS_ORIGIN: env.CORS_ORIGIN || "*",
		CORS_ALLOWED_HEADERS: env.CORS_ALLOWED_HEADERS || "*",
		CORS_EXPOSED_HEADERS: env.CORS_EXPOSED_HEADERS || "*",
		CORS_METHODS: env.CORS_METHODS || "*",
		CORS_CREDENTIALS: env.CORS_CREDENTIALS,
		CONTENT_SECURITY_POLICY_DIRECTIVES__FRAME_SRC: normalizeCspDirectiveValue(
			env.CONTENT_SECURITY_POLICY_DIRECTIVES__FRAME_SRC,
		),
		EXTENSIONS_PATH: env.EXTENSIONS_PATH || "./extensions",
		EMAIL_TEMPLATES_PATH: env.EMAIL_TEMPLATES_PATH || "./templates",
		MIGRATIONS_PATH: env.MIGRATIONS_PATH || "./migrations",
		CACHE_ENABLED: env.CACHE_ENABLED || false,
		CACHE_TTL: env.CACHE_TTL || "5m",
		CACHE_CONTROL_S_MAXAGE: env.CACHE_CONTROL_S_MAXAGE || 0,
		ASSETS_TRANSFORM_MAX_CONCURRENT: env.ASSETS_TRANSFORM_MAX_CONCURRENT || 25,
		ASSETS_TRANSFORM_MAX_OPERATIONS: env.ASSETS_TRANSFORM_MAX_OPERATIONS || 5,
		RATE_LIMITER_ENABLED: env.RATE_LIMITER_ENABLED || false,
		RATE_LIMITER_POINTS: env.RATE_LIMITER_POINTS || 50,
		RATE_LIMITER_DURATION: env.RATE_LIMITER_DURATION || 1,
		RATE_LIMITER_STORE: env.RATE_LIMITER_STORE || "memory",
		ACCESS_TOKEN_TTL: env.ACCESS_TOKEN_TTL || "30m",
		REFRESH_TOKEN_TTL: env.REFRESH_TOKEN_TTL || "7d",
		REFRESH_TOKEN_COOKIE_SECURE: env.REFRESH_TOKEN_COOKIE_SECURE || true,
		REFRESH_TOKEN_COOKIE_SAME_SITE: env.REFRESH_TOKEN_COOKIE_SAME_SITE || "lax",
		SESSION_COOKIE_TTL: env.SESSION_COOKIE_TTL || "1d",
		SESSION_COOKIE_SECURE: env.SESSION_COOKIE_SECURE || true,
		SESSION_COOKIE_SAME_SITE: env.SESSION_COOKIE_SAME_SITE || "lax",
		USER_REGISTER_URL_ALLOW_LIST: env.USER_REGISTER_URL_ALLOW_LIST || "*",
		EMAIL_TRANSPORT: env.EMAIL_TRANSPORT,
		EMAIL_SMTP_HOST: env.EMAIL_SMTP_HOST,
		EMAIL_SMTP_PORT: env.EMAIL_SMTP_PORT,
		EMAIL_SMTP_SECURE: env.EMAIL_SMTP_SECURE,
		EMAIL_SMTP_USER: env.EMAIL_SMTP_USER,
		EMAIL_SMTP_PASSWORD: env.EMAIL_SMTP_PASSWORD,
		EMAIL_FROM: env.EMAIL_FROM,
		EMAIL_VERIFY_SETUP: env.EMAIL_VERIFY_SETUP,
		EMAIL_SES_CREDENTIALS__ACCESS_KEY_ID:
			env.EMAIL_SES_CREDENTIALS__ACCESS_KEY_ID,
		EMAIL_SES_CREDENTIALS__SECRET_ACCESS_KEY:
			env.EMAIL_SES_CREDENTIALS__SECRET_ACCESS_KEY,
		EMAIL_SES_REGION: env.EMAIL_SES_REGION,
		STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
		STRIPE_VERIFICATION_SECRET: env.STRIPE_VERIFICATION_SECRET,
		EMAIL_WEBHOOK_URL: env.EMAIL_WEBHOOK_URL,
		EMAIL_DEVMODE: env.EMAIL_DEVMODE,
		EMAIL_DEV_USER: env.EMAIL_DEV_USER,
		MAILERLITE_API_KEY: env.MAILERLITE_API_KEY,
		USER_INVITE_URL_ALLOW_LIST: env.USER_INVITE_URL_ALLOW_LIST,
		VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY,
		VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY,
	};
};
