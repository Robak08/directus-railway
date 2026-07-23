# Contributing to Directus Extension Push Notification

Thank you for your interest in contributing! This guide will help you set up your development environment and understand our workflow.

## 🛠️ Development Setup

### Prerequisites

- **Node.js 20+** (managed via asdf)
- **pnpm 10+** (managed via asdf)
- **Docker and Docker Compose** (for testing)
- **Git**

### Installation with asdf

This project uses [asdf](https://asdf-vm.com/) to manage Node.js and pnpm versions. If you don't have asdf installed, follow the [official installation guide](https://asdf-vm.com/guide/getting-started.html).

1. **Install required asdf plugins:**

```bash
asdf plugin add nodejs
asdf plugin add pnpm
```

2. **Clone the repository and install versions:**

```bash
git clone https://github.com/devix-tecnologia/directus-extension-push-notification.git
cd directus-extension-push-notification

# asdf will read .tool-versions and install the correct versions
asdf install
```

3. **Install dependencies:**

```bash
pnpm install
```

4. **Build the extension:**

```bash
pnpm build
```

## 🧪 Testing

The extension includes two types of tests: integration and E2E (end-to-end).

### Test Structure

```
tests/
├── setup-hook.test.ts           # Integration tests for the hook
├── setup.ts                     # Test environment configuration
├── test-logger.ts               # Logging system
└── e2e/
    ├── push-notification-collection.test.ts  # E2E tests with Playwright
    ├── screenshots/                          # Test screenshots
    └── README.md                             # Detailed E2E testing documentation
```

### Integration Tests

Integration tests validate the database configuration hook and automatic collection creation.

```bash
# Run integration tests
pnpm test:integration

# Watch mode (re-runs on save)
pnpm test:watch
```

**Integration test architecture:**

- ✅ **Docker Compose** for isolated environment
- ✅ **Vitest** for test execution
- ✅ **SQLite** in-memory database
- ✅ **Docker exec** for HTTP communication (no port mapping)
- ✅ **Generous timeouts** (300s) for slow containers

### E2E Tests (End-to-End)

E2E tests validate the complete extension through the Directus interface using Playwright.

#### Isolated Mode (CI/CD)

Spins up temporary environment, runs tests, and tears down:

```bash
# Run all E2E tests
pnpm test:e2e

# View HTML report of last test run
pnpm test:e2e:report
```

#### Development Mode

Runs tests against persistent environment (ideal for fast iteration):

```bash
# 1. Start development environment
pnpm docker:start

# 2. Make code changes and rebuild
pnpm build

# 3. Run tests against localhost:8055
pnpm test:e2e:dev

# 4. If needed, inspect manually
# Access http://localhost:8055
# Login: admin@example.com / test-password-not-a-leak

# 5. Stop environment when finished
pnpm docker:stop
```

#### Other E2E Test Options

```bash
# Run with interactive visual interface
pnpm test:e2e:ui

# Run in debug mode (step-by-step)
pnpm test:e2e:debug

# Run with visible browser
pnpm test:e2e:headed
```

**E2E test architecture:**

- ✅ **Playwright** v1.57.0 in Docker container
- ✅ **Chromium** as test browser
- ✅ **Automatic screenshots** saved in `tests/e2e/screenshots/`
- ✅ **Traces** for debugging when failures occur
- ✅ **Directus 11.13.4** in container with extension loaded

### Cleaning Up Containers

```bash
# Remove test containers
docker-compose -f docker-compose.test.yml down -v

# Remove development environment
pnpm docker:stop
# or
docker-compose down -v

# Remove all project containers (forced)
docker rm -f $(docker ps -aq --filter "name=directus-push-notification") 2>/dev/null
docker network prune -f
```

### Tested Directus Versions

Tests run with:

- **Directus 12.1.1** (v12 compatibility)
- **Directus 11.15.1** (previous baseline)
- Compatible with Directus 10.1.7+

For integration tests against a specific version:

```bash
DIRECTUS_TEST_VERSION=12.1.1 DIRECTUS_VERSION=12.1.1 pnpm vitest run tests/integration
```

### Directus v12 considerations

- **No Studio/CSS changes required**: This extension has no theme, layout, or interface extensions. Native collection UIs inherit the v12 shell refresh from Directus core.
- **License enforcement**: Push delivery depends on the Items API. Ensure your instance stays within Core tier limits or has a valid license. See [v12 breaking changes](https://directus.com/docs/releases/breaking-changes/version-12#license-enforcement).
- **Hardened Docker** (v12.1.0+): Extensions must be pre-installed in the image or volume-mounted; `npm`/`npx` are not available in the runtime container.

## 🏗️ Project Structure

```
src/
├── push-notification/
│   └── index.ts          # REST endpoint for the extension
├── db-configuration/
│   └── index.ts          # Auto-setup hook for collections
└── utils/
    └── files.ts          # File reading utilities

dist/                     # Build artifacts
├── app.js               # Frontend bundle
├── api.js               # Backend bundle
└── directus-state.json  # Configuration state

tests/                    # Automated tests
docker-compose.yaml       # Development environment
docker-compose.test.yml   # Isolated test environment
```

## 📝 Code Standards

### TypeScript

- Always use strict typing
- Define interfaces for complex objects
- Use Directus types when available (`@directus/types`, `@directus/extensions-sdk`)

### Naming Conventions

- Files: kebab-case (e.g., `push-notification.ts`)
- Variables and functions: camelCase
- Constants: UPPER_SNAKE_CASE
- Interfaces/Types: PascalCase

### Code Structure

```typescript
// Imports
import { defineEndpoint } from "@directus/extensions-sdk";

// Constants
const DEFAULT_TIMEOUT = 5000;

// Interfaces/Types
interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

// Implementation
export default defineEndpoint((router, context) => {
  // ...
});
```

## 🔄 Development Workflow

### 1. Fast Development (without tests)

```bash
# Watch mode - automatic rebuild on save
pnpm dev

# In another terminal, start Directus
pnpm docker:start

# Access http://localhost:8055 and test manually
# Changes are reloaded automatically (EXTENSIONS_AUTO_RELOAD=true)
```

### 2. Development with Tests

```bash
# Start environment once
pnpm docker:start

# Development loop
while true; do
  # 1. Make code changes

  # 2. Rebuild
  pnpm build

  # 3. Run tests
  pnpm test:e2e:dev

  # 4. If it fails, inspect at http://localhost:8055
done

# When finished
pnpm docker:stop
```

### 3. Complete Validation

Before committing or pushing:

```bash
# Lint and formatting
pnpm lint
pnpm format:check

# Type checking
pnpm typecheck

# Build
pnpm build

# Integration tests
pnpm test:integration

# E2E tests
pnpm test:e2e
```

## 🚀 Release and Publishing

This project uses [semantic-release](https://semantic-release.gitbook.io/) to automate versioning and publishing.

### Commit Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```bash
# Features (minor version bump)
feat: add support for scheduled notifications

# Bug fixes (patch version bump)
fix: resolve memory leak in register endpoint

# Breaking changes (major version bump)
feat!: change send endpoint response format

BREAKING CHANGE: 'status' field now returns enum instead of string

# Other types (no version bump)
docs: update README with examples
chore: update dependencies
test: add tests for unregister endpoint
```

### Release Process

Release is automatic via GitHub Actions when pushing/merging to `main`:

1. Analyzes commits since last release
2. Determines next version (major/minor/patch)
3. Updates CHANGELOG.md
4. Creates git tag
5. Publishes to npm
6. Creates GitHub release

## 🐛 Debugging

### Directus Logs

```bash
# View development environment logs
docker logs directus-push-notification-dev

# Follow logs in real-time
docker logs -f directus-push-notification-dev

# Filter by errors
docker logs directus-push-notification-dev 2>&1 | grep -i error
```

### E2E Test Debugging

```bash
# Debug mode (pauses at each action)
pnpm test:e2e:debug

# Visible browser
pnpm test:e2e:headed

# View failure screenshots
open tests/e2e/screenshots/

# View detailed trace
pnpm test:e2e:report
```

### Integration Test Debugging

```bash
# View complete test logs
DIRECTUS_TEST_VERSION=11.13.4 pnpm test:integration

# Keep container after failure (comment out docker.stop() in test)
# Then inspect:
docker logs directus-push-notification-hook-11-13-4-11.13.4
```

## 🤝 Contribution Process

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/YOUR_USERNAME/directus-extension-push-notification.git`
3. **Create a branch** for your feature: `git checkout -b feat/my-feature`
4. **Make your changes** following the standards above
5. **Run tests**: `pnpm lint && pnpm test`
6. **Commit** with conventional message: `git commit -m "feat: add X"`
7. **Push** to your fork: `git push origin feat/my-feature`
8. **Open a Pull Request** in the original repository

### PR Checklist

- [ ] Code follows style standards (pnpm lint)
- [ ] Code is formatted (pnpm format:check)
- [ ] Type checking passes (pnpm typecheck)
- [ ] Build works (pnpm build)
- [ ] Integration tests pass (pnpm test:integration)
- [ ] E2E tests pass (pnpm test:e2e)
- [ ] Documentation updated (README.md, code comments)
- [ ] Commits follow Conventional Commits
- [ ] PR has clear description of what was changed and why

## 📚 Resources

- [Directus Extensions SDK](https://docs.directus.io/extensions/introduction.html)
- [Playwright Documentation](https://playwright.dev/)
- [Vitest Documentation](https://vitest.dev/)
- [Web Push Protocol](https://datatracker.ietf.org/doc/html/rfc8030)
- [VAPID Protocol](https://datatracker.ietf.org/doc/html/rfc8292)

## 🏛️ Architecture Reference

### Entity Relationship Diagram

```mermaid
erDiagram
    directus_users ||--o{ push_subscription : "owns"
    directus_users ||--o{ user_notification : "receives"
    directus_users ||--o{ user_notification : "creates"
    user_notification ||--o{ push_delivery : "has"
    push_subscription ||--o{ push_delivery : "delivers_to"

    directus_users {
        uuid id PK
        boolean push_enabled "default: true"
        string email
        string first_name
        string last_name
    }

    push_subscription {
        uuid id PK
        uuid user FK "→ directus_users"
        text endpoint "unique, push endpoint URL"
        json keys "p256dh and auth keys"
        string user_agent "browser identification"
        string device_name "optional friendly name"
        boolean is_active "default: true"
        timestamp date_created
        timestamp date_last_used
        timestamp date_expires
    }

    user_notification {
        uuid id PK
        string title "required"
        text body "required"
        uuid user FK "→ directus_users (recipient)"
        enum channel "push/email/sms/in_app"
        enum priority "low/normal/high/urgent"
        string action_url "URL to open on click"
        uuid icon FK "→ directus_files"
        json data "additional app data"
        uuid user_created FK "→ directus_users (creator)"
        timestamp date_created
        timestamp date_expires
    }

    user_notification ||--o{ notification_translation : "has"

    notification_translation {
        integer id PK
        uuid user_notification_id FK "→ user_notification"
        string languages_code "e.g. en-US, pt-BR"
        string title
        text body
    }

    push_delivery {
        uuid id PK
        uuid notification FK "→ user_notification"
        uuid subscription FK "→ push_subscription"
        enum status "queued/sending/sent/delivered/read/failed/expired"
        integer attempt_count "default: 0"
        integer max_attempts "default: 3"
        timestamp date_queued
        timestamp date_sent
        timestamp date_delivered "Service Worker callback"
        timestamp date_read "User interaction"
        timestamp date_failed
        string error_code "e.g., 410, INVALID_SUBSCRIPTION"
        text error_message
        timestamp date_retry "for transient failures"
        json metadata "additional delivery info"
    }
```

### Collections Schema

This section provides detailed technical specifications for developers.

#### 1. `push_subscription` (Devices)

Stores user device subscriptions for push notifications.

**Fields:**

- `id` (uuid) - Primary key
- `user` (m2o → directus_users) - Owner of the subscription
- `endpoint` (text, unique) - Push subscription endpoint
- `keys` (json) - Push subscription keys (p256dh, auth)
- `user_agent` (string) - Browser user agent for device identification
- `device_name` (string, nullable) - Optional friendly device name
- `is_active` (boolean, default: true) - Whether the subscription is active
- `date_created` (timestamp) - When the subscription was created
- `date_last_used` (timestamp) - Last time the subscription was used
- `date_expires` (timestamp) - When the subscription expires
- `deliveries` (o2m → push_delivery) - Virtual field showing all deliveries for this subscription

#### 2. `user_notification` (Messages)

Stores notification messages for users across all channels.

**Fields:**

- `id` (uuid) - Primary key
- `title` (string, required) - Notification title
- `body` (text, required) - Notification content
- `user` (m2o → directus_users) - Recipient
- `channel` (enum: push/email/sms/in_app) - Delivery channel
- `priority` (enum: low/normal/high/urgent, default: normal) - Priority level
- `action_url` (string) - URL to open when clicked
- `icon` (m2o → directus_files) - Notification icon (Directus file reference, resolved to `/assets/{id}`)
- `data` (json) - Additional data for the app
- `user_created` (m2o → directus_users) - Creator
- `date_created` (timestamp) - Creation timestamp
- `date_expires` (timestamp) - Expiration timestamp
- `translations` (o2m → notification_translation) - i18n translations for title/body
- `deliveries` (o2m → push_delivery) - Virtual field showing all deliveries for this notification

#### 2.1 `notification_translation` (i18n)

Stores translated title/body for notifications per language.

**Fields:**

- `id` (integer) - Primary key
- `user_notification_id` (m2o → user_notification) - Parent notification
- `languages_code` (string) - Language code (e.g., `en-US`, `pt-BR`)
- `title` (string) - Translated title
- `body` (text) - Translated body

#### 3. `push_delivery` (Join Table)

Tracks delivery status for each notification-device pair.

**Fields:**

- `id` (uuid) - Primary key
- `notification` (m2o → user_notification) - Which notification
- `subscription` (m2o → push_subscription) - Which device
- `status` (enum) - queued/sending/sent/delivered/read/failed/expired
- `attempt_count` (integer, default: 0) - Number of send attempts
- `max_attempts` (integer, default: 3) - Maximum retry attempts
- `date_queued` (timestamp) - When queued
- `date_sent` (timestamp) - When sent to push service
- `date_delivered` (timestamp) - When delivered to device (Service Worker callback)
- `date_read` (timestamp) - When user clicked/read
- `date_failed` (timestamp) - When failed permanently
- `error_code` (string) - Error code (e.g., "410", "INVALID_SUBSCRIPTION")
- `error_message` (text) - Detailed error message
- `retry_after` (timestamp) - When to retry (for transient failures)
- `metadata` (json) - Additional metadata

#### User Field Extension

The extension adds a field to `directus_users`:

- `push_enabled` (boolean, default: true) - Global toggle for push notifications

### Flow Sequence

**Auto-Subscribe Flow:**

1. User logs in with `push_enabled: true`
2. App hook registers Service Worker
3. Browser requests notification permission
4. On grant, creates subscription in `push_subscription`

**Notification Delivery Flow:**

1. `user_notification` record created with `channel: "push"`
2. Backend hook (`notification-trigger`) detects event
3. Finds all active subscriptions for target user
4. Creates `push_delivery` records (status: queued)
5. Sends push to all devices via web-push
6. Updates delivery status (sent/failed)
7. Service Worker callbacks update status (delivered/read)

**Broadcast Flow:**

1. Admin creates `notification_broadcast` with targeting and translations
2. Set `status: "processing"` (or create with that status)
3. `broadcast-processor` hook resolves target users and creates `user_notification` per user
4. `notification-trigger` sends push for each notification with `channel: "push"`
5. Track campaign via `total_created`, `notifications` O2M, and per-user delivery status

```bash
curl -X POST https://your-directus.com/items/notification_broadcast \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "System Maintenance",
    "body": "Maintenance on Sunday",
    "target_type": "roles",
    "target_roles": [{ "directus_roles_id": "ROLE_UUID" }],
    "channel": "push",
    "priority": "high",
    "status": "processing"
  }'
```

## 💬 Support

- **Issues**: [GitHub Issues](https://github.com/devix-tecnologia/directus-extension-push-notification/issues)
- **Discussions**: [GitHub Discussions](https://github.com/devix-tecnologia/directus-extension-push-notification/discussions)

## 📄 License

MIT - see [LICENSE](LICENSE) for details.
