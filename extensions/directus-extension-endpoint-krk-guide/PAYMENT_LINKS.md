# Marketing Payment Links and account provisioning

Stripe Payment Links on the marketing site and app checkout (`/osto`) post to `POST /krk-guide/guide-webhook` on checkout completion.

## Webhook security and retries

- Requires `STRIPE_VERIFICATION_SECRET` (Stripe Dashboard webhook signing secret, `whsec_…`).
- The `directus-extension-hook-stripe-raw-body` hook captures the raw body for signature verification.
- Unsigned or invalid signatures return **400**.
- Non-`checkout.session.completed` events return **200** and are ignored.
- MailerLite subscribe and user provisioning must succeed; failures return **500** so Stripe retries.

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

## Recovering a buyer when invite email failed

If provisioning created an `invited` user but SES/email failed (for example `Region is missing`):

1. Fix email config (`EMAIL_SES_REGION` and credentials must reach the Directus container).
2. In Directus admin, open the user and **resend the invitation**, or delete the invited user and run a new test purchase.
3. A second checkout alone may not re-send mail when the user is already `invited`.
