import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const statePath = join(root, 'directus-state.json');

const UUID_FK_TABLES = new Set([
	'directus_users',
	'directus_roles',
	'directus_files',
	'user_notification',
	'push_subscription',
	'notification_broadcast'
]);

const state = JSON.parse(readFileSync(statePath, 'utf8'));
let patched = 0;

for (const field of state.fields) {
	const fkTable = field.schema?.foreign_key_table;
	if (!fkTable || fkTable === 'languages') continue;
	if (!UUID_FK_TABLES.has(fkTable)) continue;

	field.type = 'uuid';
	field.schema.data_type = 'uuid';
	delete field.schema.max_length;

	if (field.meta) {
		const special = Array.isArray(field.meta.special) ? [...field.meta.special] : [];
		if (!special.includes('file') && !special.includes('uuid')) {
			special.push('uuid');
			field.meta.special = special;
		}
	}

	patched++;
}

writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
console.log(`Patched ${patched} FK field(s) in directus-state.json`);
