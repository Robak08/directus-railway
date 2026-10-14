import type { DirectusRequest as CoreDirectusRequest } from '@krk/guidebooks-core';

/** Express request plus Directus accountability (structural; no express type dependency). */
export type DirectusRequest = CoreDirectusRequest;
