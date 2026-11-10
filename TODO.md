# TODO

## Commerce / Stripe webhook

- [ ] **Guest checkout: failed webhook `Missing Directus user binding for grant fulfillment`**
  - Failed `stripe_webhook_events` with this error come from guest `/osto` checkouts and marketing Payment Link purchases (`krk-guide` Stripe buy link) that have no `metadata.directus_user_id` / `client_reference_id`.
  - On failure, **MailerLite subscribe already ran**; **Directus user invite, `customer_profiles`, and guidebook grant/access did not**.
  - **Ops:** Confirm production `KRK_GUIDE_PROVISION_USERS=true` (and `CUSTOMER_ROLE_ID`, `APP_INVITE_URL`, `USER_INVITE_URL_ALLOW_LIST`), then replay failed Stripe events so grants are written.
  - **Optional code:** Return user id from `provisionCustomerFromCheckout` into grant fulfillment (`extensions/directus-extension-krk-guide-bundle/src/guide/`) so a skipped or silent provision step does not fail with this opaque message.
