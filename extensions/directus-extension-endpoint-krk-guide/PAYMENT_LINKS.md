# Marketing Payment Links and account provisioning

Stripe Payment Links on the marketing site post to `POST /krk-guide/guide-webhook` on checkout completion.

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
