import dayjs from 'dayjs';

export const MAILERLITE_GROUP_IDS = {
	buyers: '156806631449953435',
	buyersVersionTwo: '179817636933142402',
	krakowTips: '145957335472276790',
	murals: '167510330590627092'
} as const;

export interface MailerLiteCustomField {
	key: string;
	label: { custom: string; type: string };
	optional?: true;
	text: {
		default_value: string | null;
		maximum_length: number | null;
		minimum_length: number | null;
		value: string | null;
	};
	type: string;
}

export interface StripeCheckoutSessionObject {
	status?: string;
	customer_details?: {
		email?: string | null;
		name?: string | null;
	};
	customer_email?: string | null;
	custom_fields?: MailerLiteCustomField[];
}

export type MailerLiteSubscriberParams = {
	email: string;
	fields: {
		name: string | null;
		last_name: string | null;
	};
	groups: string[];
	status: 'active';
	subscribed_at: string;
};

const MURAL_BONUS_VALUES = ['muurali', 'muraali'];

export const splitCustomerName = (name: string | null | undefined): {
	firstName: string | null;
	lastName: string | null;
} => {
	const splitName =
		typeof name === 'string' && name.trim().length > 0 ? name.trim().split(/\s+/) : [];

	return {
		firstName: splitName[0] ?? null,
		lastName: splitName.length > 1 ? splitName.slice(1).join(' ') : null
	};
};

export const buildMailerLiteSubscriberParams = (
	session: StripeCheckoutSessionObject,
	email: string
): MailerLiteSubscriberParams => {
	const { firstName, lastName } = splitCustomerName(session.customer_details?.name);

	const groups = [
		MAILERLITE_GROUP_IDS.buyersVersionTwo,
		MAILERLITE_GROUP_IDS.buyers,
		MAILERLITE_GROUP_IDS.krakowTips
	];

	const customFields = session.custom_fields;
	const bonusCodeField =
		customFields && customFields.length > 0
			? customFields.find((field) => field.key === 'bonus')
			: null;

	if (bonusCodeField?.text?.value) {
		const bonusValue = bonusCodeField.text.value.toLowerCase();
		if (MURAL_BONUS_VALUES.includes(bonusValue)) {
			groups.push(MAILERLITE_GROUP_IDS.murals);
		}
	}

	return {
		email,
		fields: {
			name: firstName,
			last_name: lastName
		},
		groups,
		status: 'active',
		subscribed_at: dayjs().subtract(3, 'hour').format('YYYY-MM-DD HH:mm:ss')
	};
};

export const resolveCheckoutEmail = (session: StripeCheckoutSessionObject): string | null => {
	const fromDetails = session.customer_details?.email;
	if (typeof fromDetails === 'string' && fromDetails.trim().length > 0) {
		return fromDetails.trim();
	}

	const fromCustomerEmail = session.customer_email;
	if (typeof fromCustomerEmail === 'string' && fromCustomerEmail.trim().length > 0) {
		return fromCustomerEmail.trim();
	}

	return null;
};
