import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const templatePath = resolve('snapshots/guidebooks/permission-matrix.template.json');
const exportPath = process.argv[2];

if (!exportPath) {
	console.error('Usage: node scripts/verify-guidebook-permissions.mjs <permissions-export.json>');
	process.exit(1);
}

const template = JSON.parse(readFileSync(templatePath, 'utf8'));
const exported = JSON.parse(readFileSync(exportPath, 'utf8'));

const requiredCollections =
	template.requiredCustomerReadCollections ??
	template.collections?.map((entry) => entry.collection) ??
	[];
const exportedCollections = new Set(
	(exported.permissions ?? exported).map((row) => row.collection)
);

const missing = requiredCollections.filter((name) => !exportedCollections.has(name));

if (missing.length > 0) {
	console.error('Missing customer read permissions for:', missing.join(', '));
	process.exit(1);
}

console.log('Permission matrix check passed.');
