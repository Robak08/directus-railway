#!/usr/bin/env node
import { copyFileSync } from 'node:fs';

copyFileSync('directus-state.json', 'dist/directus-state.json');
