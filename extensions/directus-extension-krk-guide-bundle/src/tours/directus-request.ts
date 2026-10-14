import type { DirectusRequest as CoreDirectusRequest } from '../core/index.js';

/** Express request plus Directus accountability (structural; no express type dependency). */
export type DirectusRequest = CoreDirectusRequest;
