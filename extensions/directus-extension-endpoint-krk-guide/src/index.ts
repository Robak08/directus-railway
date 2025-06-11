import { defineEndpoint } from '@directus/extensions-sdk';
import nodemailer from "nodemailer";
import Stripe from 'stripe';
import MailerLite from '@mailerlite/mailerlite-nodejs';
import dayjs from 'dayjs'

export default defineEndpoint((router) => {
	router.post('/guide-webhook', async (_req, res) => {
		try {
			const data = _req.body;
			const { status } = data?.data.object;
			// TODO create stripe headers signature verification
			if (data?.type === 'checkout.session.completed' && status === 'complete') {
				// get name and email and add subscriber to mailerlite
				if (!process.env.MAILERLITE_API_KEY) {
					throw "Config err: MAILERLITE_API_KEY missing";
				}
				const { email, name } = data?.data.object?.customer_details;
				const buyersGroupId = "156806631449953435";
				const krakowTipsGroupId = "145957335472276790";
				const mailerlite = new MailerLite({
					api_key: process.env.MAILERLITE_API_KEY
				});

				const splitName = name.split(' ');
				const mailerParams = {
					email: email,
					fields: {
						name: splitName[0] || null,
						last_name: splitName[1] || null,
					},
					groups: [buyersGroupId, krakowTipsGroupId],
					status: "active",
					subscribed_at: dayjs().subtract(3, "hour").format("YYYY-MM-DD HH:mm:ss"),
				};
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
			} else if (data?.type === 'payment_intent.succeeded' && status === 'succeeded') {
				const { id, amount, amount_received, receipt_email } = data?.data.object;
				// payment successful -> send guide via email endpoint
				const payloadObject = {
					payment_id: id,
					customer_email: receipt_email,
					amount,
					amount_received,
				};
				const emailRes = await fetch(process.env.EMAIL_WEBHOOK_URL || 'http://localhost:8055/krk-guide/guide-email', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(payloadObject),
				});
				res.send({ received: true });
			} else {
				throw "Wrong payload - 403";
			}
		} catch (err: any) {
			console.log('/guide-webhook err')
			res.send({ received: true, mes: err });
		}
	});
	router.post('/guide-email', async (_req, res) => {
		try {
			const { payment_id, customer_email, amount, amount_received, } = _req.body;
			if (!payment_id || !amount || !amount_received) {
				console.log('/guide-email wrong data payload')
				throw "Wrong payload - 403";
			}
			if (!process.env.STRIPE_SECRET_KEY) {
				throw "Config err: STRIPE_SECRET_KEY missing";
			}
			const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
			const paymentObj = await stripe.paymentIntents.retrieve(payment_id);
			if (!paymentObj.id) throw 'Cannot find transaction in stripe';
			if (paymentObj.amount !== amount || paymentObj.amount_received !== amount_received) {
				console.log('/guide-email invalid payload dont match with STRIPE')
				throw "Wrong payload - 403";
			}
			const transporter = nodemailer.createTransport({
				service: "gmail",
				auth: {
					user: process.env.EMAIL_SMTP_USER,
					pass: process.env.EMAIL_SMTP_PASSWORD,
				},
			});
			const options = {
				from: process.env.EMAIL_FROM,
				to: process.env.EMAIL_DEVMODE == "true" ? process.env.EMAIL_DEV_USER : customer_email,
				envelope: {
					from: process.env.EMAIL_FROM,
					to: process.env.EMAIL_DEVMODE == "true" ? process.env.EMAIL_DEV_USER : customer_email,
				},
				subject: `Hei, kiitos ostoksestasi – Krakovan taskuopas on täällä! 🌟`,
				attachments: [
					{
						filename: "Krakovan_upeimmat_elämykset–suomalainen_taskuopas_unelmalomaan-05-06-25.pdf",
						path: "./extensions/directus-extension-endpoint-krk-guide/assets/Krakovan_upeimmat_elämykset–suomalainen_taskuopas_unelmalomaan-05-06-25.pdf",
					},

				],
				html: `
				<p>
				<strong>Hei ja kiitos tilauksestasi!</strong 🥳<br />
				Teit erinomaisen valinnan, kun nappasit Krakovan taskuoppaan mukaasi tulevalle reissulle.
				</p>
				<p>📥 Löydät sen tämän meilin liitteestä.</p>
				<p>💳 Kuitti ostoksestasi tulee automaattisesti Stripe-palvelusta erillisessä viestissä.<br />
					💡 <strong>Vinkki</strong>: Tallenna taskuopas puhelimeesi, niin se on helposti käytettävissä matkasi aikana – olitpa sitten vanhankaupungin kujilla, matkalla suolakaivoksille tai vaikka etsimässä hyvää pysähdyspaikkaa lounaalle.
				</p>
				<p>(Huomaathan, että taskuopas on tarkoitettu henkilökohtaiseen käyttöösi. Kunnioitathan työtäni,  älä jaa opasta eteenpäin).</p>
				<p>
				Mukavaa matkaa ja nautinnollisia hetkiä Krakovassa!<br />
				– Helena, Krakovan opas<br />
				Krakovan opas HT (y-tunnus: 3258298-1)
				</p>
				`,
			};
			const sendRes = await transporter.sendMail(options);
			res.send({ sent: true });
		} catch (err: any) {
			console.log('/guide-webhook err:', err)
			res.send({ received: true, mes: err });
		}
	})
}
);