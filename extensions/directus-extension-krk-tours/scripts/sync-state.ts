import { writeFileSync } from 'node:fs';
import { directusState } from '../src/scaffold/directus-state-data.ts';

writeFileSync('directus-state.json', `${JSON.stringify(directusState, null, '\t')}\n`);
