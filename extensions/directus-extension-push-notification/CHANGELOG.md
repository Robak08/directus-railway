# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.2] - 2026-07-23

### Fixed

- 🐛 Reordered schema collection creation so FK targets exist before dependents (fixes broken M2O/O2M/translations interfaces on first install)
- 🐛 `db-configuration` hook now repairs missing relations on startup and validates all expected relations after apply

## [0.4.0] - 2026-02-27

### Added

- ✨ **Icon field** (`icon`) for notifications — supports Directus file references for rich notification icons
- ✨ **Internationalization (i18n)** for notification `title` and `body`
  - `notification_translation` junction collection with `languages_code` support
  - Automatic language resolution based on user's configured language
  - Fallback chain: user language → default language → original notification fields
- ✨ **TypeScript SDK** (`@anthropic/push-notification-sdk`)
  - Typed API client for subscriptions, notifications, and deliveries
  - Browser subscription helpers with VAPID key support
  - Translation utilities for notification content
  - Full TypeScript type definitions for all collections
- ✨ `action_url` field for deep-linking from notification clicks
- ✨ `resolve-translation` module for server-side i18n resolution
- ✨ `resolve-icon` module for icon URL resolution

### Fixed

- 🐛 Mock push server route ordering — specific error routes (`/error/410`, `/error/404`) now correctly matched before wildcard
- 🐛 Integration test isolation with `deactivateAllSubscriptions` helper
- 🐛 Test assertions updated for async delivery state handling
- 🐛 Auth password and `push_enabled` configuration in test setup
- 🐛 Fixed `directus-state.json` typo (`is_generated` field)

### Changed

- 🔄 Updated all dependencies to latest versions
- 🔄 Improved Docker Compose test infrastructure with per-suite containers
- 🔄 Enhanced E2E test suite (32 tests passing)
- 🔄 Added comprehensive integration test suite (30 tests)
- 🔄 Added unit tests for `resolve-translation` and `resolve-icon` (29 tests)

---

## [0.2.0] - 2025-01-20

### ⚠️ BREAKING CHANGES

This release standardizes field naming conventions to follow Directus best practices. **Manual database migration is required for existing installations.**

#### Field Renames

**push_subscription:**

- `user_id` → `user`
- `created_at` → `date_created`
- `last_used_at` → `date_last_used`
- `expires_at` → `date_expires`

**user_notification:**

- `user_id` → `user`
- `created_by` → `user_created`
- `created_at` → `date_created`
- `expires_at` → `date_expires`

**push_delivery:**

- `user_notification_id` → `notification`
- `push_subscription_id` → `subscription`
- `queued_at` → `date_queued`
- `sent_at` → `date_sent`
- `delivered_at` → `date_delivered`
- `read_at` → `date_read`
- `failed_at` → `date_failed`
- `retry_after` → `date_retry`

### Added

- ✨ Internationalization (i18n) support for collections and fields
  - English (en-US) translations
  - Portuguese (pt-BR) translations
- ✨ O2M virtual fields for easier navigation
  - `user_notification.deliveries` - View all deliveries for a notification
  - `push_subscription.deliveries` - View all deliveries for a subscription
- ✨ Proper display configuration for user reference fields
  - Shows avatar + first name + last name
- ✨ Proper display configuration for datetime fields
  - Relative time display for most timestamps
  - Full format with seconds for `date_created`
- 📝 Enhanced ERD documentation in CONTRIBUTING.md
- 🔧 Relations array in schema for proper FK constraints

### Changed

- 🔄 All TypeScript interfaces updated with new field names
- 🔄 Backend logic (hooks and endpoints) updated
- 🔄 Service Worker payload structure updated
- 🔄 All test files updated with new assertions
- 🔄 API documentation examples updated
- 🔄 Collection display templates updated to use new field names

### Migration Guide

#### For New Installations

No action required. The extension will automatically create collections with the new field names.

#### For Existing Installations (Upgrading from v0.1.x)

**⚠️ BACKUP YOUR DATABASE BEFORE PROCEEDING**

You need to manually rename the database columns. Here's a SQL migration script:

```sql
-- Rename push_subscription fields
ALTER TABLE push_subscription RENAME COLUMN user_id TO "user";
ALTER TABLE push_subscription RENAME COLUMN created_at TO date_created;
ALTER TABLE push_subscription RENAME COLUMN last_used_at TO date_last_used;
ALTER TABLE push_subscription RENAME COLUMN expires_at TO date_expires;

-- Rename user_notification fields
ALTER TABLE user_notification RENAME COLUMN user_id TO "user";
ALTER TABLE user_notification RENAME COLUMN created_by TO user_created;
ALTER TABLE user_notification RENAME COLUMN created_at TO date_created;
ALTER TABLE user_notification RENAME COLUMN expires_at TO date_expires;

-- Rename push_delivery fields
ALTER TABLE push_delivery RENAME COLUMN user_notification_id TO notification;
ALTER TABLE push_delivery RENAME COLUMN push_subscription_id TO subscription;
ALTER TABLE push_delivery RENAME COLUMN queued_at TO date_queued;
ALTER TABLE push_delivery RENAME COLUMN sent_at TO date_sent;
ALTER TABLE push_delivery RENAME COLUMN delivered_at TO date_delivered;
ALTER TABLE push_delivery RENAME COLUMN read_at TO date_read;
ALTER TABLE push_delivery RENAME COLUMN failed_at TO date_failed;
ALTER TABLE push_delivery RENAME COLUMN retry_after TO date_retry;

-- Update foreign key constraints (adjust constraint names based on your DB)
-- PostgreSQL example:
ALTER TABLE push_subscription
  DROP CONSTRAINT IF EXISTS push_subscription_user_id_foreign,
  ADD CONSTRAINT push_subscription_user_foreign
  FOREIGN KEY ("user") REFERENCES directus_users(id);

ALTER TABLE user_notification
  DROP CONSTRAINT IF EXISTS user_notification_user_id_foreign,
  ADD CONSTRAINT user_notification_user_foreign
  FOREIGN KEY ("user") REFERENCES directus_users(id);

ALTER TABLE user_notification
  DROP CONSTRAINT IF EXISTS user_notification_created_by_foreign,
  ADD CONSTRAINT user_notification_user_created_foreign
  FOREIGN KEY (user_created) REFERENCES directus_users(id);

ALTER TABLE push_delivery
  DROP CONSTRAINT IF EXISTS push_delivery_user_notification_id_foreign,
  ADD CONSTRAINT push_delivery_notification_foreign
  FOREIGN KEY (notification) REFERENCES user_notification(id) ON DELETE CASCADE;

ALTER TABLE push_delivery
  DROP CONSTRAINT IF EXISTS push_delivery_push_subscription_id_foreign,
  ADD CONSTRAINT push_delivery_subscription_foreign
  FOREIGN KEY (subscription) REFERENCES push_subscription(id) ON DELETE CASCADE;
```

After running the migration:

1. Restart your Directus instance
2. The `db-configuration` hook will create any **missing** relations on startup, but it does not rename existing fields or update metadata on fields that already exist. If relation interfaces are still broken, recreate the missing relations in the Admin UI or delete the extension collections and restart for a clean apply.
3. Test push notifications to ensure everything works

### Technical Details

- **Field Naming Conventions:**
  - Timestamps use `date_*` prefix (e.g., `date_created`, `date_sent`)
  - System audit fields use `user_created`, `user_updated`
  - Business logic user references use `user` (no suffix)
  - Relations have no `_id` suffix (e.g., `notification`, `subscription`)

- **Interface/Display Configuration:**
  - User fields: `interface: "select-dropdown-m2o"`, `display: "user"`
  - Datetime fields: `display: "datetime"` with appropriate display_options
  - O2M fields: `interface: "list-o2m"`, `display: "related-values"`

---

## [0.1.3] - 2025-01-19

### Fixed

- 🐛 Fixed authentication issue in notification trigger hook
- 🔒 Improved security by using accountability context properly

### Changed

- 📝 Updated documentation with better examples

---

## [0.1.2] - 2025-01-18

### Fixed

- 🐛 Fixed service worker registration path

---

## [0.1.1] - 2025-01-17

### Added

- 📦 Initial public release
- ✨ Complete push notification system
- ✨ Multi-device support
- ✨ Delivery tracking with status
- ✨ Service Worker integration
- ✨ VAPID authentication
- ✨ Automatic retry logic
- ✨ E2E tests with Playwright

---

## [0.1.0] - 2025-01-15

### Added

- 🎉 Initial development release

[0.4.0]: https://github.com/devix-tecnologia/directus-extension-push-notification/compare/v0.3.0...v0.4.0
[0.2.0]: https://github.com/devix-tecnologia/directus-extension-push-notification/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/devix-tecnologia/directus-extension-push-notification/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/devix-tecnologia/directus-extension-push-notification/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/devix-tecnologia/directus-extension-push-notification/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/devix-tecnologia/directus-extension-push-notification/releases/tag/v0.1.0
