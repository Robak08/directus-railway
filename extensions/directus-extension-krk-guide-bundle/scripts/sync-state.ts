import { writeFileSync } from 'node:fs';
import { directusState } from '../src/tours/scaffold/directus-state-data.js';

writeFileSync('directus-state.json', `${JSON.stringify(directusState, null, '\t')}\n`);
