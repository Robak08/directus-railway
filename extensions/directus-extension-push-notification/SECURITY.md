# Security Policy

## Supported Versions

We actively support the following versions of this extension with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a Vulnerability

We take the security of `directus-extension-push-notification` seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to:

- **Email:** security@devix.com.br (ou outro email apropriado)
- **Subject:** [SECURITY] Directus Push Notification Extension

Please include the following information:

- Type of vulnerability
- Full paths of affected source file(s)
- Location of the affected source code (tag/branch/commit)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact assessment (who is affected, what can be exploited)

### What to Expect

- **Acknowledgment:** Within 48 hours
- **Initial Assessment:** Within 5 business days
- **Status Updates:** Every 7 days until resolved
- **Fix Timeline:** Critical issues within 7-14 days, others within 30-90 days

### Disclosure Policy

- We follow [Coordinated Vulnerability Disclosure](https://vuls.cert.org/confluence/display/CVD)
- We will work with you to understand and validate the issue
- We will not take legal action against researchers who follow this policy
- We will publicly acknowledge your responsible disclosure (unless you prefer to remain anonymous)

### Security Best Practices for Users

#### 1. VAPID Keys

**⚠️ CRITICAL:** Never reuse the example VAPID keys from documentation or docker-compose files in production!

```bash
# Always generate your own keys:
npx web-push generate-vapid-keys
```

**What NOT to do:**

- ❌ Copy VAPID keys from examples
- ❌ Commit VAPID private keys to version control
- ❌ Share VAPID private keys publicly
- ❌ Use the same VAPID keys across multiple projects

**What to do:**

- ✅ Generate unique keys for each environment
- ✅ Store private keys in environment variables
- ✅ Keep VAPID_PRIVATE_KEY secret and secure
- ✅ Rotate keys periodically (every 6-12 months)

#### 2. Environment Configuration

**Secure your Directus instance:**

```bash
# Bad (Development only)
KEY="dev-key"
SECRET="dev-secret-abcdef1234567890"
ADMIN_PASSWORD="test-password-not-a-leak"

# Good (Production)
KEY="$(openssl rand -hex 16)"
SECRET="$(openssl rand -base64 32)"
ADMIN_PASSWORD="$(openssl rand -base64 24)"
```

#### 3. HTTPS in Production

**⚠️ REQUIRED:** Push notifications require HTTPS in production (localhost exempt for development)

```bash
# Development (OK)
PUBLIC_URL="http://localhost:8055"

# Production (Required)
PUBLIC_URL="https://yourdomain.com"
```

#### 4. Regular Updates

- Keep Directus updated to latest stable version
- Keep this extension updated
- Run `npm audit` or `pnpm audit` regularly
- Enable Dependabot alerts

#### 5. Access Control

- Use least privilege principle for push notification permissions
- Limit who can send notifications
- Validate user input before sending notifications
- Rate limit notification endpoints

## Known Security Considerations

### Push Notification Content

- Push notifications are stored in plaintext in the database
- Notification content is sent through browser push services (Google FCM, Apple, Mozilla)
- Do not send sensitive information (passwords, tokens, PII) in notification messages
- Consider client-side encryption for sensitive notification payloads

### Service Worker

- Service workers have elevated privileges in browsers
- Only serve service workers over HTTPS (except localhost)
- Validate notification actions before executing
- Implement proper CSP (Content Security Policy)

### Subscription Management

- Push subscriptions contain unique endpoints per device
- Endpoints should be treated as sensitive data
- Implement proper cleanup of inactive subscriptions
- Validate subscription data before storage

## Security Updates

Security updates will be released as soon as possible after a vulnerability is confirmed. Updates will be announced via:

- GitHub Security Advisories
- Release notes
- npm package updates
- Email to registered security contacts (if applicable)

## Vulnerability History

No vulnerabilities have been reported yet.

---

## Additional Resources

- [Web Push Protocol (RFC 8030)](https://datatracker.ietf.org/doc/html/rfc8030)
- [VAPID for Web Push (RFC 8292)](https://datatracker.ietf.org/doc/html/rfc8292)
- [OWASP Web Security](https://owasp.org/)
- [Directus Security](https://docs.directus.io/self-hosted/security/)

---

**Last Updated:** February 11, 2026  
**Next Review:** Every 6 months or after security incidents
