<!-- Banner: docs/banner.png -->

![Directus Push Notification Extension](https://raw.githubusercontent.com/devix-tecnologia/directus-extension-push-notification/main/docs/banner.png)

<br>

[![npm version](https://img.shields.io/npm/v/directus-extension-push-notification)](https://www.npmjs.com/package/directus-extension-push-notification)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Directus](https://img.shields.io/badge/Directus-10.x%20%7C%2011.x%20%7C%2012.x-6644FF)](https://directus.io)

> ⚠️ **BETA VERSION WARNING**  
> This extension is currently in **BETA**. While stable for testing and development, it's highly recommended to **backup your database** before installing or updating to any beta version. Breaking changes may occur between beta releases.

> **Krakovan Opas fork (v0.6.1+):** `directus-state.json` declares push M2O/M2M foreign keys as PostgreSQL `uuid` (not `char(36)`), so Directus 12 on Postgres can create FK constraints on first install. After upgrading, restart Directus; if an older DB still has `varchar` FK columns, migrate them to `uuid` once (see project CHANGELOG 0.6.1).

[Installation](#-installation) • [Quick Start](#-quick-start) • [FAQ](#-frequently-asked-questions) • [API Docs](#-api-endpoints) • [Troubleshooting](#-troubleshooting)

</div>

---

![Subscription](https://raw.githubusercontent.com/devix-tecnologia/directus-extension-push-notification/main/docs/push-subscription.png)

## ✨ Features

- 🔔 **Multi-device support** - One user can have multiple active subscriptions (Desktop, Mobile, Tablet)
- 📊 **Granular delivery tracking** - Track status per device (queued → sending → sent → delivered → read)
- 🔌 **Native Directus architecture** - Uses native collections and fields (no custom UI needed)
- 🌐 **Multi-channel ready** - Schema supports push, email, SMS, and in-app (currently push implemented)
- 🔄 **Automatic subscription management** - Auto-subscribe on login, soft delete on unregister
- ⚡ **Service Worker integration** - Browser notifications with delivery confirmation
- 🔐 **VAPID support** - Full Voluntary Application Server Identification
- 📝 **TypeScript support** - Fully typed codebase with strict checks
- 🧪 **Tested** - E2E tests with Playwright

## 📦 Installation

> 💡 **No external services needed!** This extension works out-of-the-box. You don't need Firebase, FCM, Google Cloud, or any third-party accounts. Just install, generate VAPID keys, and go.

### 🔒 Security Notice

**⚠️ IMPORTANT:** This project uses VAPID keys for push notifications.

Always generate your own unique keys:

```bash
npx web-push generate-vapid-keys
```

**Keep your `PUSH_PRIVATE_VAPID_KEY` secret!** Never commit it to Git or share it publicly.

See [SECURITY.md](SECURITY.md) for complete security guidelines.

### Via NPM/PNPM/Yarn

```bash
pnpm add directus-extension-push-notification
```

### Via Directus Marketplace

Install directly from your Directus instance Extensions panel.

> ⚠️ **Important:** This extension runs outside the sandbox (requires full system access for push notifications, service workers, and auto-setup). To see it in the Marketplace, you must set `MARKETPLACE_TRUST=all` in your Directus environment variables. [Learn more about extension trust levels](https://docs.directus.io/self-hosted/config-options.html#marketplace).

## ⚙️ Configuration

### Required: VAPID Keys (2 minutes)

**What they are:** Security keys that authenticate your push notifications. Think of them like a password between your server and browsers.

**How to generate:**

```bash
npx web-push generate-vapid-keys
```

**Add to your `.env`:**

```bash
# Required: VAPID keys for push notifications
PUSH_PUBLIC_VAPID_KEY=your_public_key_here
PUSH_PRIVATE_VAPID_KEY=your_private_key_here
```

⚠️ **Keep `PUSH_PRIVATE_VAPID_KEY` secret!** Never commit it to Git or expose it in client code.

### Optional: VAPID Subject (Production only)

**What it is:** Identifies your server to push services (like showing caller ID).

**When to set:** Optional! If not set, the extension uses `PUBLIC_URL` automatically.

**Automatic fallback behavior:**

1. Uses `PUSH_VAPID_SUBJECT` if you set it (highest priority)
2. Falls back to `PUBLIC_URL` if `PUSH_VAPID_SUBJECT` is not set
3. Converts `http://` URLs to `mailto:admin@example.com` (development safe mode)

**How to set:**

```bash
# Option 1: Explicit subject (production)
PUSH_VAPID_SUBJECT=https://yourdomain.com
# or
PUSH_VAPID_SUBJECT=mailto:contact@yourdomain.com

# Option 2: Let it use PUBLIC_URL (recommended)
PUBLIC_URL=https://yourdomain.com  # Extension uses this automatically
```

**For development?** Nothing to do! With `PUBLIC_URL=http://localhost:8055`, the extension auto-converts to `mailto:admin@example.com`.

## 🚀 Quick Start

### Step 1: Install the Extension

```bash
pnpm add directus-extension-push-notification
```

Restart Directus. The extension automatically creates all needed collections and fields.

### Step 2: Configure VAPID Keys

Generate your keys (takes 2 seconds):

```bash
npx web-push generate-vapid-keys
```

You'll see something like:

```
=======================================
Public Key:  BPT864f6ph9v...
Private Key: xJQ5l1xcpN79...
=======================================
```

Add both to your Directus `.env` file:

```bash
PUSH_PUBLIC_VAPID_KEY=BPT864f6ph9v...
PUSH_PRIVATE_VAPID_KEY=xJQ5l1xcpN79...
```

Restart Directus again.

### Step 3: Enable Push for a User

1. Log into Directus admin panel
2. Go to **User Directory** → select a user
3. Scroll down and toggle **`push_enabled`** to ON
4. Save

### Step 4: Test It!

**Option A: From Directus Admin (easiest)**

1. Go to **Content** → **User Notification**
2. Click **Create Item** (+)
3. Fill in:
   - **User**: Select the user from Step 3
   - **Channel**: `push`
   - **Title**: `Hello!`
   - **Body**: `Your first notification`
4. Click **Save**

**Option B: Via API**

```bash
curl -X POST https://your-directus.com/items/user_notification \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user": "user-uuid-here",
    "channel": "push",
    "title": "Hello!",
    "body": "Your first notification"
  }'
```

### Step 5: See the Results

The notification should appear instantly on all devices where the user is logged in.

**Check delivery status:**

1. Go to **Content** → **Push Delivery**
2. You'll see a record for each device
3. Status shows: `queued` → `sent` → `delivered`

**That's it!** 🎉 Your push notifications are working.

---

### What Just Happened?

The extension automatically:

1. ✅ Found all active subscriptions for that user
2. ✅ Created delivery records for each device
3. ✅ Sent push notifications to browsers
4. ✅ Tracked delivery status per device

No Firebase setup, no complex configuration, no external services needed!

## 🌐 Browser Support

- ✅ Chrome/Edge 42+
- ✅ Firefox 44+
- ✅ Safari 16+ (macOS 13+, iOS 16.4+)
- ✅ Opera 37+

**Note:** Push notifications require HTTPS in production (except localhost for development).

## 📡 API Endpoints

All endpoints are available under `/push-notification/` prefix.

### Register Subscription

**POST** `/push-notification/register`

Register or update a device subscription for push notifications.

**Headers:**

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "keys": {
      "p256dh": "...",
      "auth": "..."
    }
  }
}
```

**Response:** `201 Created`

### Unregister Subscription

**POST** `/push-notification/unregister`

Performs a soft delete (sets `is_active: false`) to preserve delivery history.

**Request Body:** Same as register

**Response:** `200 OK`

## 📨 Creating Notifications (Examples)

### Basic Notification

```bash
curl -X POST https://your-directus.com/items/user_notification \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user": "USER_UUID",
    "channel": "push",
    "title": "New message",
    "body": "You have a new message from John"
  }'
```

### With Action URL (Deep Linking)

When the user clicks the notification, they are redirected to the specified URL:

```bash
curl -X POST https://your-directus.com/items/user_notification \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user": "USER_UUID",
    "channel": "push",
    "title": "Order shipped!",
    "body": "Your order #1234 has been shipped",
    "action_url": "https://myapp.com/orders/1234",
    "priority": "high"
  }'
```

### With Custom Icon (Directus File)

Upload an image to Directus Files first, then reference its UUID:

```bash
curl -X POST https://your-directus.com/items/user_notification \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user": "USER_UUID",
    "channel": "push",
    "title": "Welcome!",
    "body": "Thanks for joining our platform",
    "icon": "FILE_UUID_FROM_DIRECTUS_FILES"
  }'
```

The extension automatically resolves the file ID to `/assets/{FILE_UUID}` for the push notification icon.

### With i18n Translations

Send a notification that adapts to the user's language. The system resolves the language automatically based on the user's `language` field in Directus:

```bash
curl -X POST https://your-directus.com/items/user_notification \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user": "USER_UUID",
    "channel": "push",
    "title": "New update",
    "body": "A new version is available",
    "translations": [
      {
        "languages_code": "pt-BR",
        "title": "Nova atualização",
        "body": "Uma nova versão está disponível"
      },
      {
        "languages_code": "es-ES",
        "title": "Nueva actualización",
        "body": "Una nueva versión está disponible"
      }
    ]
  }'
```

**How it works:**

- If user's language is `pt-BR` → receives "Nova atualização"
- If user's language is `es-ES` → receives "Nueva actualización"
- Any other language → falls back to the base `title`/`body` ("New update")

### Full Example (All Fields)

```bash
curl -X POST https://your-directus.com/items/user_notification \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user": "USER_UUID",
    "channel": "push",
    "title": "Flash Sale!",
    "body": "50% off all items for the next 2 hours",
    "priority": "urgent",
    "action_url": "https://myapp.com/sales/flash",
    "icon": "FILE_UUID",
    "data": {
      "sale_id": "SALE_123",
      "discount": 50,
      "category": "all"
    },
    "date_expires": "2026-03-01T00:00:00Z",
    "translations": [
      {
        "languages_code": "pt-BR",
        "title": "Promoção Relâmpago!",
        "body": "50% de desconto em todos os itens pelas próximas 2 horas"
      }
    ]
  }'
```

### JavaScript/TypeScript Example

```typescript
// Using fetch
const response = await fetch(
  "https://your-directus.com/items/user_notification",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      user: userId,
      channel: "push",
      title: "Task assigned",
      body: "You've been assigned to task #42",
      action_url: "/tasks/42",
      priority: "high",
    }),
  },
);
```

```typescript
// Using Directus SDK
import { createDirectus, rest, createItem } from "@directus/sdk";

const client = createDirectus("https://your-directus.com").with(rest());

await client.request(
  createItem("user_notification", {
    user: userId,
    channel: "push",
    title: "Task assigned",
    body: "You've been assigned to task #42",
    action_url: "/tasks/42",
    priority: "high",
  }),
);
```

## 📢 Broadcast Notifications

Send notifications to multiple users using `notification_broadcast`. The `broadcast-processor` hook creates one `user_notification` per target user (title/body resolved per user language) and reuses the existing push pipeline.

### Target types

| `target_type` | Description |
|---------------|-------------|
| `all` | All active users |
| `roles` | Users with selected roles (`target_roles`) |
| `users` | Specific users (`target_users`) |
| `filter` | Custom Directus filter (`target_filter`) |

### Example

```bash
curl -X POST https://your-directus.com/items/notification_broadcast \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "System Maintenance",
    "body": "Maintenance on Sunday",
    "target_type": "users",
    "target_users": [{ "directus_users_id": "USER_UUID" }],
    "channel": "push",
    "priority": "high",
    "status": "processing",
    "translations": [
      {
        "languages_code": "pt-BR",
        "title": "Manutenção do Sistema",
        "body": "Manutenção no domingo"
      }
    ]
  }'
```

Use `status: "draft"` while editing; set `status: "processing"` to send. Users with `push_enabled: false` are skipped for `channel: "push"`.

### Available Fields

| Field          | Type      | Required | Default  | Description                                               |
| -------------- | --------- | -------- | -------- | --------------------------------------------------------- |
| `user`         | UUID      | ✅       |          | Recipient user ID                                         |
| `channel`      | enum      | ✅       |          | `push`, `email`, `sms`, or `in_app`                       |
| `title`        | string    | ✅       |          | Notification title (supports i18n via `translations`)     |
| `body`         | string    | ✅       |          | Notification body text (supports i18n via `translations`) |
| `priority`     | enum      |          | `normal` | `low`, `normal`, `high`, `urgent`                         |
| `action_url`   | string    |          | `null`   | URL to open on notification click                         |
| `icon`         | UUID      |          | `null`   | Directus file ID for notification icon                    |
| `icon_url`     | string    |          | `null`   | External icon URL (alternative to `icon`)                 |
| `data`         | JSON      |          | `null`   | Additional payload data for the app                       |
| `date_expires` | timestamp |          | `null`   | When the notification expires                             |
| `translations` | array     |          | `[]`     | i18n translations (`languages_code`, `title`, `body`)     |

## ❓ Frequently Asked Questions

### Do I need a Firebase/FCM account or Google Cloud project?

**No!** You don't need to create any Firebase or Google Cloud account.

The extension works directly with the browser's built-in Push API. When you see endpoints like `fcm.googleapis.com` in subscriptions, that's the browser automatically using Google's push service (Chrome/Edge use FCM, Firefox uses Mozilla Push, Safari uses APNs). This happens behind the scenes - you don't configure it.

**You only need:**

- ✅ VAPID keys (generated locally with one command)
- ✅ A Directus instance with HTTPS in production

### What are VAPID keys and why do I need them?

VAPID (Voluntary Application Server Identification) keys are like a password between your Directus server and the browser's push service. They prove that push notifications are really coming from your server.

**Think of it like this:**

- Your server needs to "sign" push notifications with a private key
- Browsers verify this signature using your public key
- This prevents anyone else from sending fake notifications to your users

**How to get them:**

```bash
npx web-push generate-vapid-keys
```

This creates a key pair in 2 seconds. Copy both keys to your `.env` file and you're done.

### How do users subscribe to notifications?

**Automatic!** When a logged-in user:

1. Has `push_enabled: true` in their profile
2. Opens your Directus admin panel

The extension automatically:

- Asks for browser notification permission (one-time popup)
- Registers their device
- They start receiving notifications immediately

Users can toggle `push_enabled` on/off anytime in their User Settings.

### Can I test this locally without HTTPS?

**Yes!** `localhost` is exempt from the HTTPS requirement. Development works fine with `http://localhost:8055`.

Production requires HTTPS (security requirement from browsers, not from us).

### Will notifications work on mobile?

**Yes!** The extension supports:

- 📱 iOS 16.4+ (Safari)
- 📱 Android (Chrome, Firefox, Edge)
- 💻 Desktop (all major browsers)

Each device gets tracked separately, so one user on desktop + mobile = 2 subscriptions = 2 deliveries.

### What happens if I delete a notification?

Deleting from `user_notification` doesn't affect already-sent push notifications (they're already on the user's device).

Delivery tracking in `push_delivery` is preserved for history/analytics even if you delete the original notification.

## 🔧 Troubleshooting

### Notifications not being delivered

1. **Check VAPID keys**: Ensure `PUSH_PUBLIC_VAPID_KEY` and `PUSH_PRIVATE_VAPID_KEY` match and are correctly set
2. **Check user permissions**: User must have `push_enabled: true`
3. **Check subscriptions**: User must have at least one active subscription (`is_active: true`)
4. **Check browser console**: Look for service worker errors
5. **Check delivery records**: Look at `push_delivery` collection for error details

### VAPID Subject Error

```
Error: Vapid subject is not an https: or mailto: URL
```

**Solution:** Set `PUSH_VAPID_SUBJECT` or use `PUBLIC_URL` with `https://`. For development with `http://localhost`, the extension auto-converts to `mailto:`.

### Service Worker Not Registering

- Ensure you're accessing via HTTPS (or localhost for dev)
- Check browser console for errors
- Verify service worker file is accessible at `/push-notification-sw/sw.js`

### Subscription Failing

- Verify browser supports push notifications (see [Browser Support](#-browser-support))
- Check if user granted notification permissions
- Ensure VAPID public key matches between client and server

## 💡 How It Works

### Collections Created

The extension automatically creates:

**`push_subscription`** - Stores device subscriptions

- One user can have multiple devices
- Tracks endpoint, keys, user agent, device name
- `is_active` flag for soft deletes

**`user_notification`** - Notification messages

- Supports multiple channels (push, email, SMS, in-app)
- Includes title, body, icon, action URL, priority
- Can target specific users

**`push_delivery`** - Delivery tracking

- One record per notification-device pair
- Tracks status, attempts, errors, timestamps
- Enables retry logic and delivery confirmation

**`notification_broadcast`** - Group/broadcast templates

- Target users by role, list, filter, or all active users
- Supports i18n translations on the template
- Fans out to individual `user_notification` records with per-user language resolution
- Tracks `total_users`, `total_created`, `total_failed`, and `date_processed`

**`directus_users.push_enabled`** - User preference toggle

> 📖 For detailed schemas, see [Architecture Documentation](CONTRIBUTING.md#-architecture-reference)

## 📊 Understanding Delivery Status

When you send a notification, it goes through these states. You can check the **Push Delivery** collection in Directus to see where each notification is:

### Delivery Status Lifecycle

```mermaid
stateDiagram-v2
    [*] --> queued: Notification created

    queued --> sending: Hook processes subscription
    sending --> sent: Successfully sent to Push Service
    sending --> failed: Error during send

    sent --> delivered: Service Worker confirms
    sent --> failed: Delivery timeout/error

    delivered --> read: User clicks notification
    delivered --> [*]: User dismisses

    failed --> sending: Retry (if attempts < max)
    failed --> [*]: Max retries reached

    read --> [*]: Tracking complete

    note right of queued
        Initial state when
        push_delivery created
    end note

    note right of sent
        Push Service (FCM/APNs)
        accepted the notification
    end note

    note right of delivered
        Service Worker on device
        received and showed notification
    end note

    note right of failed
        Check error_code and
        error_message for details
    end note
```

## �🔌 Client Integration Example

Here's a basic example of how to integrate push notifications in your web application:

```javascript
// Request notification permission
const permission = await Notification.requestPermission();

if (permission === "granted") {
  // Register service worker from extension endpoint
  const registration = await navigator.serviceWorker.register(
    "/extensions/push-notification-sw/sw.js",
  );

  // Subscribe to push notifications
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: "YOUR_VAPID_PUBLIC_KEY",
  });

  // Send subscription to Directus
  await fetch("https://your-directus-instance.com/push-notification/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer YOUR_ACCESS_TOKEN",
    },
    body: JSON.stringify({ subscription }),
  });
}
```

## 📋 Requirements

- **Directus**: 10.1.7 or higher recommended (tested on 11.15.1 and 12.1.1)
- **Node.js**: 20+ recommended
- **Valid VAPID key pair**: Generate with `npx web-push generate-vapid-keys`
- **HTTPS**: Required in production (localhost exempt for development)
- **Marketplace Trust**: Set `MARKETPLACE_TRUST=all` to install from Directus Marketplace (extension runs outside sandbox for full push notification support)

### Directus v12 notes

This extension is API-only (hooks and endpoints) with no custom Studio theme or interface code, so [v12 Studio/CSS breaking changes](https://directus.com/docs/releases/breaking-changes/version-12) do not affect it directly. Collections use native Directus field interfaces.

When upgrading to Directus 12, be aware of these operational changes:

- **License enforcement**: Directus 12 enforces tier limits. Instances above Core limits may have `/items` APIs restricted after the grace period, which would block push delivery and subscription management. See [Licensing](https://directus.com/docs/releases/breaking-changes/version-12#license-enforcement).
- **Hardened Docker image** (v12.1.0+): The official image no longer includes `npm`/`npx` at runtime. Pre-install extensions in your image or mount them as volumes — runtime `npm install` inside the container will not work.
- **Extension install**: Use a pre-built bundle (`dist/`) or marketplace install. Volume-mounting `dist/api.js`, `dist/app.js`, and `dist/service-worker.js` works as documented in the Docker test setup.

## 🔒 Security Best Practices

1. **VAPID Keys**: Keep your `PUSH_PRIVATE_VAPID_KEY` secret and never expose it client-side
2. **HTTPS**: Always use HTTPS in production for secure push delivery
3. **Permissions**: Configure Directus roles to control who can send notifications
4. **Rate Limiting**: Consider implementing rate limits on notification creation
5. **User Consent**: Always request user permission before subscribing to push notifications

## 🤝 Development

Interested in contributing? Check out our [Contributing Guide](CONTRIBUTING.md) for:

- Local development setup with Docker
- Testing instructions (E2E with Playwright)
- Code standards and linting
- Release process

### Running Tests

**E2E Tests (Playwright):**

```bash
# Run all E2E tests (auto-generates VAPID keys, builds, and runs tests)
pnpm test:e2e

# Run with UI
pnpm test:e2e:ui

# Debug mode
pnpm test:e2e:debug
```

**Integration Tests (Vitest):**

```bash
# Generate VAPID keys first (one time)
pnpm generate:vapid

# Run integration tests
pnpm test:integration:ci
```

The test commands automatically:

1. Generate fresh VAPID keys (`.env.test` file)
2. Build the extension
3. Start Docker containers with test keys
4. Run tests
5. Clean up containers

**Note:** The `.env.test` file is auto-generated and git-ignored. Never commit VAPID keys!

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 💬 Support & Community

- **Issues**: [GitHub Issues](https://github.com/devix-tecnologia/directus-extension-push-notification/issues)
- **Discussions**: [GitHub Discussions](https://github.com/devix-tecnologia/directus-extension-push-notification/discussions)
- **Marketplace**: [Directus Marketplace](https://marketplace.directus.io/)

## 🙏 Acknowledgments

Built with:

- [Directus Extensions SDK](https://docs.directus.io/extensions/)
- [web-push](https://github.com/web-push-libs/web-push) library
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

---

Made with ❤️ by [Devix Tecnologia](https://github.com/devix-tecnologia)
