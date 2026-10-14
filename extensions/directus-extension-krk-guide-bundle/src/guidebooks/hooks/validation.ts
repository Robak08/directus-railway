import { defineHook } from '@directus/extensions-sdk';

export default defineHook(({ filter }) => {
	filter('items.create', async (payload, meta) => {
		const record = payload as Record<string, unknown>;
		if (meta.collection !== 'tips') return payload;
		if (record.audience_scope === 'selected_guidebooks') {
			return payload;
		}
		if (record.audience_scope === 'all_guidebooks') {
			return payload;
		}
		throw new Error('tips.audience_scope must be all_guidebooks or selected_guidebooks');
	});

	filter('items.update', async (payload, meta) => {
		const record = payload as Record<string, unknown>;
		if (meta.collection !== 'tips') return payload;
		if (
			record.audience_scope &&
			record.audience_scope !== 'all_guidebooks' &&
			record.audience_scope !== 'selected_guidebooks'
		) {
			throw new Error('Invalid tips.audience_scope');
		}
		return payload;
	});

	filter('items.create', async (payload, meta) => {
		const record = payload as Record<string, unknown>;
		if (meta.collection !== 'customer_guidebook_grants') return payload;
		if (!record.user_id || !record.guidebook_id) {
			throw new Error('customer_guidebook_grants requires user_id and guidebook_id');
		}
		return payload;
	});
});
