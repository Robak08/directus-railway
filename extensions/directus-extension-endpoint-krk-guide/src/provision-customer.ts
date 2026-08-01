import type { Accountability } from '@directus/types';

export const DEFAULT_INVITE_URL = 'https://app.krakovanopas.fi/luo-salasana';

export type CustomerType = 'subscriber' | 'one_time_buyer' | 'free_tier' | 'all_access';
export type SubscriptionStatus = 'active' | 'past_due' | 'unpaid' | 'cancelled';

export interface CustomerProfileRecord {
	id: string;
	user_id: string | null;
	customer_type: CustomerType | null;
	subscription_status: SubscriptionStatus | null;
	stripe_customer_id: string | null;
}

export interface DirectusUserRecord {
	id: string;
	email: string | null;
	first_name: string | null;
	last_name: string | null;
	status: string;
}

export interface CheckoutProvisioningSession {
	customer_details?: {
		email?: string | null;
		name?: string | null;
	};
	customer_email?: string | null;
	customer?: string | null;
}

export interface DirectusServices {
	UsersService: new (options: {
		schema: unknown;
		accountability?: Accountability | null;
	}) => {
		readByQuery: (query: {
			filter: Record<string, unknown>;
			limit?: number;
		}) => Promise<DirectusUserRecord[]>;
		inviteUser: (
			email: string,
			role: string,
			url?: string | null,
			subject?: string | null
		) => Promise<void>;
		updateOne: (key: string, data: Record<string, unknown>) => Promise<void>;
	};
	ItemsService: new (collection: string, options: {
		schema: unknown;
		accountability?: Accountability | null;
	}) => {
		readByQuery: (query: {
			filter: Record<string, unknown>;
			limit?: number;
		}) => Promise<CustomerProfileRecord[]>;
		createOne: (data: Record<string, unknown>) => Promise<CustomerProfileRecord>;
		updateOne: (key: string, data: Record<string, unknown>) => Promise<void>;
	};
}

export const createAdminAccountability = (): Accountability => ({
	user: null,
	role: null,
	admin: true,
	app: false,
	ip: null,
	origin: null
});

export const isProvisionUsersEnabled = (): boolean => {
	const raw = process.env.KRK_GUIDE_PROVISION_USERS;
	return raw === 'true' || raw === '1';
};

export const resolveInviteUrl = (): string => {
	const configured = process.env.APP_INVITE_URL?.trim();
	return configured && configured.length > 0 ? configured : DEFAULT_INVITE_URL;
};

export const resolveCustomerRoleId = (): string | null => {
	const configured = process.env.CUSTOMER_ROLE_ID?.trim();
	return configured && configured.length > 0 ? configured : null;
};

export const isEntitledCustomerType = (customerType: CustomerType | null): boolean => {
	return customerType === 'one_time_buyer' || customerType === 'all_access' || customerType === 'subscriber';
};

export const shouldUpgradeProfile = (profile: CustomerProfileRecord | null): boolean => {
	if (!profile) {
		return true;
	}

	if (profile.customer_type === 'free_tier') {
		return true;
	}

	if (profile.subscription_status === 'cancelled') {
		return true;
	}

	return !isEntitledCustomerType(profile.customer_type);
};

export const provisionCustomerFromCheckout = async (options: {
	session: CheckoutProvisioningSession;
	services: DirectusServices;
	getSchema: () => Promise<unknown>;
	logger: { info: (message: string) => void; error: (message: string, error?: unknown) => void };
}): Promise<void> => {
	if (!isProvisionUsersEnabled()) {
		return;
	}

	const roleId = resolveCustomerRoleId();
	if (!roleId) {
		options.logger.error('[krk-guide] CUSTOMER_ROLE_ID missing; skipping user provisioning');
		return;
	}

	const email =
		(typeof options.session.customer_details?.email === 'string' &&
			options.session.customer_details.email.trim()) ||
		(typeof options.session.customer_email === 'string' && options.session.customer_email.trim()) ||
		null;

	if (!email) {
		options.logger.info('[krk-guide] No checkout email; skipping user provisioning');
		return;
	}

	const name = options.session.customer_details?.name;
	const splitName =
		typeof name === 'string' && name.trim().length > 0 ? name.trim().split(/\s+/) : [];
	const firstName = splitName[0] ?? null;
	const lastName = splitName.length > 1 ? splitName.slice(1).join(' ') : null;
	const stripeCustomerId =
		typeof options.session.customer === 'string' && options.session.customer.trim().length > 0
			? options.session.customer.trim()
			: null;

	const schema = await options.getSchema();
	const accountability = createAdminAccountability();
	const usersService = new options.services.UsersService({ schema, accountability });
	const profilesService = new options.services.ItemsService('customer_profiles', {
		schema,
		accountability
	});

	const existingUsers = await usersService.readByQuery({
		filter: { email: { _eq: email } },
		limit: 1
	});
	const existingUser = existingUsers[0] ?? null;

	let userId = existingUser?.id ?? null;

	if (!existingUser) {
		await usersService.inviteUser(email, roleId, resolveInviteUrl());
		const invitedUsers = await usersService.readByQuery({
			filter: { email: { _eq: email } },
			limit: 1
		});
		userId = invitedUsers[0]?.id ?? null;
		options.logger.info(`[krk-guide] Invited new customer user for ${email}`);
	} else if (existingUser.status === 'invited') {
		options.logger.info(`[krk-guide] User ${email} already invited; skipping duplicate invite`);
	} else if (firstName || lastName) {
		await usersService.updateOne(existingUser.id, {
			first_name: firstName ?? existingUser.first_name,
			last_name: lastName ?? existingUser.last_name
		});
	}

	if (!userId) {
		options.logger.error(`[krk-guide] Could not resolve user id for ${email}`);
		return;
	}

	const existingProfiles = await profilesService.readByQuery({
		filter: { user_id: { _eq: userId } },
		limit: 1
	});
	const existingProfile = existingProfiles[0] ?? null;

	const profilePayload: Record<string, unknown> = {
		user_id: userId,
		customer_type: 'one_time_buyer',
		subscription_status: 'active'
	};

	if (stripeCustomerId) {
		profilePayload.stripe_customer_id = stripeCustomerId;
	}

	if (!existingProfile) {
		await profilesService.createOne(profilePayload);
		options.logger.info(`[krk-guide] Created customer profile for ${email}`);
		return;
	}

	if (shouldUpgradeProfile(existingProfile)) {
		await profilesService.updateOne(existingProfile.id, profilePayload);
		options.logger.info(`[krk-guide] Upgraded customer profile for ${email}`);
		return;
	}

	if (stripeCustomerId && existingProfile.stripe_customer_id !== stripeCustomerId) {
		await profilesService.updateOne(existingProfile.id, {
			stripe_customer_id: stripeCustomerId
		});
		options.logger.info(`[krk-guide] Updated stripe_customer_id for ${email}`);
	}
};
