import { defineEndpoint } from '@directus/extensions-sdk';
import MailerLite from '@mailerlite/mailerlite-nodejs';
import dayjs from 'dayjs'

interface MailerLiteCustomField {
	key: string;
	label: { custom: string, type: string },
	optional: true,
	text: {
		default_value: string | null,
		maximum_length: number | null,
		minimum_length: number | null,
		value: string | null
	},
	type: string
}
export default defineEndpoint((router) => {
	router.post('/guide-webhook', async (_req, res) => {
		try {
			const data = _req.body;
			const { status } = data?.data.object;
			// TODO create stripe headers signature verification
			if (data?.type === 'checkout.session.completed' && status === 'complete') {
				// get name and email and add subscriber to mailerlite
				// console.log("checkout.session.completed___", data?.data.object?.customer_details?.email)
				if (!process.env.MAILERLITE_API_KEY) {
					throw "Config err: MAILERLITE_API_KEY missing";
				}
				const customerDetails = data?.data?.object?.customer_details;
				const email = customerDetails?.email;
				const name = customerDetails?.name;
				const buyersGroupId = "156806631449953435"; // guidebook sending group
				const krakowTipsGroupId = "145957335472276790";
				const muralsGroupId = '167510330590627092';
				const mailerlite = new MailerLite({
					api_key: process.env.MAILERLITE_API_KEY
				});

				if (!email) {
					throw "Missing customer email";
				}

				const splitName = typeof name === 'string' && name.trim().length > 0
					? name.trim().split(/\s+/)
					: [];
				const mailerParams = {
					email: email,
					fields: {
						name: splitName?.[0] || null,
						last_name: splitName.length > 1 ? splitName.slice(1).join(' ') : null,
					},
					groups: [buyersGroupId, krakowTipsGroupId],
					status: "active",
					subscribed_at: dayjs().subtract(3, "hour").format("YYYY-MM-DD HH:mm:ss"),
				};

				const customFields: MailerLiteCustomField[] = data?.data.object?.custom_fields;
				const bonusCodeField = customFields?.length > 0 ? customFields.find(c => c.key === 'bonus') : null;
				if (bonusCodeField) {
					const muralValues = ['muurali', 'muraali'];
					if (bonusCodeField?.text?.value && muralValues.includes(bonusCodeField?.text?.value?.toLowerCase())) {
						console.log("bonuscode", bonusCodeField?.text?.value?.toLowerCase())
						mailerParams.groups.push(muralsGroupId);
					}
				}
				mailerlite.subscribers
					.createOrUpdate(mailerParams)
					.then((response) => {
						// console.log(response.data);
						if (response) {
							res.send({ received: true });
						}
					})
					.catch((error) => {
						if (error.response) console.log(error.response.data);
						throw `Mailerlite subscriber error, ${email}`;
					});
				res.send({ received: true });
			} else {
				throw "Wrong payload - 403";
			}
		} catch (err: any) {
			console.log('/guide-webhook err', err)
			res.send({ received: true, mes: err });
		}
	});
}
);