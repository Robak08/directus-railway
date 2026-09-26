#!/usr/bin/env bun
/**
 * Operator CLI for guidebook migration phases (calls Directus admin endpoints).
 *
 * Usage:
 *   bun scripts/guidebook-migration.ts status --env staging
 *   bun scripts/guidebook-migration.ts apply --env staging --through backfill-grants
 */

const args = process.argv.slice(2);
const command = args[0] ?? 'status';

const readFlag = (name: string): string | undefined => {
	const index = args.indexOf(name);
	if (index === -1) return undefined;
	return args[index + 1];
};

const envName = readFlag('--env') ?? 'staging';
const through = readFlag('--through');
const phase = readFlag('--phase');
const yes = args.includes('--yes');

const envKey = envName === 'production' ? 'PRODUCTION' : 'STAGING';
const baseUrl =
	process.env[`DIRECTUS_${envKey}_URL`] ??
	process.env.DIRECTUS_URL ??
	'http://localhost:8055';
const token =
	process.env[`DIRECTUS_${envKey}_TOKEN`] ?? process.env.DIRECTUS_ADMIN_TOKEN ?? '';

if (!token) {
	console.error(`Missing DIRECTUS_${envKey}_TOKEN or DIRECTUS_ADMIN_TOKEN`);
	process.exit(1);
}

if (envName === 'production' && !yes) {
	console.error('Production commands require --yes after reviewing the migration report.');
	process.exit(1);
}

const request = async (path: string, method: 'GET' | 'POST' = 'GET', body?: unknown) => {
	const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/json',
			'Content-Type': 'application/json'
		},
		body: body ? JSON.stringify(body) : undefined
	});
	const data = await response.json().catch(() => null);
	if (!response.ok) {
		throw new Error(
			typeof data === 'object' && data && 'error' in data
				? String((data as { error: unknown }).error)
				: `HTTP ${response.status}`
		);
	}
	return data;
};

try {
	if (command === 'status' || command === 'preflight') {
		console.log(JSON.stringify(await request('/krk-guidebooks/migration/status'), null, 2));
	} else if (command === 'apply') {
		const payload = through ? { through } : { phase: phase ?? 'preflight' };
		console.log(JSON.stringify(await request('/krk-guidebooks/migration/run', 'POST', payload), null, 2));
	} else if (command === 'validate') {
		console.log(
			JSON.stringify(
				await request('/krk-guidebooks/migration/run', 'POST', { phase: 'validate' }),
				null,
				2
			)
		);
	} else if (command === 'cutover-ready') {
		console.log(
			JSON.stringify(
				await request('/krk-guidebooks/migration/run', 'POST', { phase: 'contract' }),
				null,
				2
			)
		);
	} else if (command === 'backup') {
		console.log(
			JSON.stringify(
				{
					ok: true,
					message:
						'Run your environment backup tool before apply; record backup id in artifacts/guidebook-migration/'
				},
				null,
				2
			)
		);
	} else {
		console.error(`Unknown command: ${command}`);
		process.exit(1);
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}
