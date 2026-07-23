import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const HOST_RANGE = '>=10.0.0 <13.0.0';
const ROOT = process.argv[2] ?? process.cwd();
const SKIP_DIRS = new Set(['.bin']);

async function walk(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const packageJsonPaths = [];

	for (const entry of entries) {
		const fullPath = join(dir, entry.name);

		if (entry.isDirectory()) {
			if (SKIP_DIRS.has(entry.name)) {
				continue;
			}

			packageJsonPaths.push(...(await walk(fullPath)));
			continue;
		}

		if (entry.name === 'package.json') {
			packageJsonPaths.push(fullPath);
		}
	}

	return packageJsonPaths;
}

async function patchPackageJson(packageJsonPath) {
	const raw = await readFile(packageJsonPath, 'utf8');
	const pkg = JSON.parse(raw);
	const extension = pkg['directus:extension'];

	if (!extension?.host) {
		return false;
	}

	const previousHost = extension.host;
	extension.host = HOST_RANGE;
	await writeFile(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
	console.log(`Patched ${packageJsonPath}: ${JSON.stringify(previousHost)} -> ${HOST_RANGE}`);
	return true;
}

const packageJsonPaths = await walk(ROOT);
let patched = 0;

for (const packageJsonPath of packageJsonPaths) {
	if (await patchPackageJson(packageJsonPath)) {
		patched += 1;
	}
}

console.log(`Patched ${patched} extension package(s) under ${ROOT}`);
