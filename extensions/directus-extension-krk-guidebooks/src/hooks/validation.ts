import { defineHook } from '@directus/extensions-sdk';

export default defineHook(({ filter }) => {
	filter('items.create', async (payload, meta) => {
		if (meta.collection !== 'tips') return payload;
		if (payload.audience_scope === 'selected_guidebooks') {
			return payload;
		}
		if (payload.audience_scope === 'all_guidebooks') {
			return payload;
		}
		throw new Error('tips.audience_scope must be all_guidebooks or selected_guidebooks');
	});

	filter('items.update', async (payload, meta) => {
		if (meta.collection !== 'tips') return payload;
		if (
			payload.audience_scope &&
			payload.audience_scope !== 'all_guidebooks' &&
			payload.audience_scope !== 'selected_guidebooks'
		) {
			throw new Error('Invalid tips.audience_scope');
		}
		return payload;
	});

	filter('items.create', async (payload, meta) => {
		if (meta.collection !== 'customer_guidebook_grants') return payload;
		if (!payload.user_id || !payload.guidebook_id) {
			throw new Error('customer_guidebook_grants requires user_id and guidebook_id');
		}
		return payload;
	});
});
