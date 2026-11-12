/** Fields on `guidebooks` that exist in scaffold state and are safe for Directus ItemsService queries. */

export const PUBLISHED_GUIDEBOOK_LISTING_FIELDS = [
	'id',
	'slug',
	'title',
	'daisy_theme'
] as const;

export const GUIDEBOOK_BRANDING_FIELDS_WITH_PDF = [
	'id',
	'slug',
	'title',
	'destination_id',
	'daisy_theme',
	'pdf_version',
	'pdf_updated'
] as const;

export const GUIDEBOOK_BRANDING_FIELDS_BASE = GUIDEBOOK_BRANDING_FIELDS_WITH_PDF.filter(
	(field) => field !== 'pdf_version' && field !== 'pdf_updated'
);
