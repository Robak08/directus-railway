import type { Accountability } from '@directus/types';
import type { Request } from 'express';

export type DirectusRequest = Request & {
	accountability?: Accountability | null;
};
