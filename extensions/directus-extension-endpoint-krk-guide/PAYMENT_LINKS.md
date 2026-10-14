# Marketing Payment Links and account provisioning

Stripe Payment Links on the marketing site and app checkout (`/osto`) post to `POST /krk-guide/guide-webhook` on checkout completion.

## Webhook security and retries

- Requires `STRIPE_VERIFICATION_SECRET` (Stripe Dashboard webhook signing secret, `whsec_…`).
- The bundled `stripe-raw-body` hook captures the raw body for signature verification.
- Unsigned or invalid signatures return **400**.
- Non-`checkout.session.completed` events return **200** and are ignored.
- Unpaid sessions return **200** with `ignored: true`.
- Events are recorded in `stripe_webhook_events`:
  - **new** — first delivery, status `processing`
  - **retry** — prior non-terminal status, side effects run again
  - **duplicate** — already `processed` or `ignored`, no side effects
- MailerLite subscribe, provisioning, or grant failures return **500** and set ledger status **failed** so Stripe retries.
- Missing customer email returns **500** (retry).
- Missing **active** `guidebook_offers` row or Directus user binding for grants returns **500** (retry) — checkout status may stay `pending` until resolved.

## Grant fulfillment

- Resolves offer from session metadata `offer_id` or active slug `krakow-lifetime`.
- Writes `customer_guidebook_grants` (source `stripe_checkout`, source id = session id) and rebuilds `customer_guidebook_access` for that user + guidebook.
- Idempotent on Stripe retries (same session id).

## PDF delivery (production-critical)

MailerLite receives the buyer email and adds them to the guidebook buyer groups. MailerLite automation sends the PDF. This path must keep working without regression.

Required for MailerLite:

- Checkout must collect **email** (`customer_details.email` or `customer_email` on the session).
- Name is optional; first/last are split when present.

## Optional app account provisioning

When `KRK_GUIDE_PROVISION_USERS=true` on Directus:

- The same webhook also creates or upgrades a Directus customer and sends an invite to `APP_INVITE_URL` (default `https://app.krakovanopas.fi/luo-salasana`).
- Requires `CUSTOMER_ROLE_ID` and `USER_INVITE_URL_ALLOW_LIST` to include the invite URL.

Provisioning is skipped when email is missing (anonymous checkout). To provision accounts from marketing purchases, configure Payment Links to **require email** (and preferably name).

Until the flag is enabled, marketing Payment Links behave as today: MailerLite only.

## App checkout (Stripe extension)

- `POST /krk-stripe/checkout/session` — requires `x-checkout-service-key` matching `CHECKOUT_SERVICE_SECRET` (SvelteKit BFF).
- `GET /krk-stripe/checkout/status?session_id=` — fulfillment state for success page polling.
- `POST /krk-stripe/billing/portal` — Stripe customer portal for logged-in users.

## Recovering a buyer when invite email failed

If provisioning created an `invited` user but SES/email failed (for example `Region is missing`):

1. Fix email config (`EMAIL_SES_REGION` and credentials must reach the Directus container).
2. In Directus admin, open the user and **resend the invitation**, or delete the invited user and run a new test purchase.
3. A second checkout alone may not re-send mail when the user is already `invited`.

## Rollout

1. Deploy guidebooks extension and run scaffold/migration as needed.
2. Set Stripe keys and webhook URL to `/krk-guide/guide-webhook`.
3. Align `CHECKOUT_SERVICE_SECRET` on Directus and Vercel.
4. Run `node scripts/verify-guidebook-permissions.mjs` on staging.
5. Enable `KRK_GUIDE_PROVISION_USERS` when invite flow is verified.
