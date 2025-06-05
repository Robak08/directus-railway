import { defineEndpoint } from '@directus/extensions-sdk';
import nodemailer from "nodemailer";
import Stripe from 'stripe';

export default defineEndpoint((router) => {
	router.post('/guide-webhook', async (_req, res) => {
		try {
			const data = _req.body;
			const { id, status, amount, amount_received, customer } = data?.data.object;
			// if (data?.type === 'payment_intent.succeeded')
			// 	console.log('DATA', data?.type, data?.data.object)
			if (data?.type !== 'payment_intent.succeeded' || status !== 'succeeded') {
				// console.log('/guide-webhook err:', data?.type, data?.data.object.status);
				throw new Error("Wrong payload - 403");
			}
			// console.log(`PAYMENT ID___: ${id}, customer ID___: ${customer}`);
			if (!process.env.STRIPE_SECRET_KEY) {
				// console.log('no stripe secret in env found');
				throw new Error("Config err: STRIPE_SECRET_KEY missing");
			}
			const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
			const customerObj = await stripe.customers.retrieve(customer);

			const payloadObject = {
				payment_id: id,
				customer_id: customer,
				customer_email: customerObj.email,
				amount,
				amount_received,
			}
			// console.log("GUIDE-WEBHOOK before fetch to other endpoint", payloadObject)
			// TODO -> change for production make it ENV? 
			const emailRes = await fetch(process.env.EMAIL_WEBHOOK_URL || 'http://localhost:8055/directus-extension-endpoint-guide/guide-email', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(payloadObject),
			});
			res.send({ received: true });
		} catch (err: any) {
			// console.log('/guide-webhook err:', err)
			console.log('/guide-webhook err')
			res.send({ received: true, mes: err });
		}
	});
	router.post('/guide-email', async (_req, res) => {
		try {
			const { payment_id, customer_id, customer_email, amount, amount_received, } = _req.body;
			if (!payment_id || !customer_id || !amount || !amount_received) {
				console.log('/guide-email wrong data payload')
				throw new Error("Wrong payload - 403");
			}
			//INFO STRIPE DATA VERIFICATION
			const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
			const paymentObj = await stripe.paymentIntents.retrieve(payment_id);
			const customerObj = await stripe.customers.retrieve(customer_id);

			if (paymentObj.amount !== amount || paymentObj.amount_received !== amount_received || customerObj.email !== customer_email) {
				console.log('/guide-email invalid payload')
				throw new Error("Wrong payload - 403");
			}
			//INFO EMAIL PART

			const transporter = nodemailer.createTransport({
				service: "gmail",
				auth: {
					user: process.env.EMAIL_SMTP_USER,
					pass: process.env.EMAIL_SMTP_PASSWORD,
				},
			});
			const firstName = customerObj.name.split(' ')[0] || customerObj.name;
			const options = {
				from: `${customerObj.name} <${customerObj.email}>`,
				envelope: {
					from: 'helena@krakovanopas.fi',
					// to: customerObj.email
					to: 'robert.hamiga@gmail.com',
				},
				// to: "helena@iloaconsulting.fi",
				to: 'robert.hamiga@gmail.com',
				// to: customerObj.email,
				subject: `Hei ${firstName}, kiitos ostoksestasi – Krakovan taskuopas on täällä! 🌟`,
				attachments: [
					{
						filename: "Krakovan_upeimmat_elämykset–suomalainen_taskuopas_unelmalomaan-05-06-25.pdf",
						path: "./extensions/directus-extension-endpoint-guide/assets/Krakovan_upeimmat_elämykset–suomalainen_taskuopas_unelmalomaan-05-06-25.pdf",
					},

				],
				html: `
				<p>
				<strong>Hei ja kiitos tilauksestasi!</strong 🥳<br />
				Teit erinomaisen valinnan, kun nappasit Krakovan taskuoppaan mukaasi tulevalle reissulle.
				</p>
				<p>📥 Lataa opas tästä: (LINK TO GOOGLE DRIVE)</p>
				
				<p>💳 Kuitti ostoksestasi tulee automaattisesti Stripe-palvelusta erillisessä viestissä.<br />
					💡 <strong>Vinkki</strong>: Tallenna taskuopas puhelimeesi, niin se on helposti käytettävissä matkasi aikana – olitpa sitten vanhankaupungin kujilla, matkalla suolakaivoksille tai vaikka etsimässä hyvää pysähdyspaikkaa lounaalle.
				</p>
				<p>(Huomaathan, että taskuopas on tarkoitettu henkilökohtaiseen käyttöösi eikä opasta ole lupa jakaa eteenpäin).</p>
				<p>
				Mukavaa matkaa ja nautinnollisia hetkiä Krakovassa!<br />
				– Helena, Krakovan opas<br />
				Krakovan opas HT (y-tunnus: 3258298-1)
				</p>
				`,
			};
			const sendRes = await transporter.sendMail(options);
			// console.log('TEST EMAIL', sendRes?.response);
			res.send({ sent: true });
		} catch (err: any) {
			console.log('/guide-webhook err:', err)
			res.send({ received: true, mes: err });
		}
	})
});
