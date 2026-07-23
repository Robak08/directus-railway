# Scripts

## generate-test-vapid-keys.js

Generates temporary VAPID keys for testing and saves them to `.env.test`.

### Usage

```bash
# Via npm script (recommended)
pnpm generate:vapid

# Or directly
node scripts/generate-test-vapid-keys.js
```

### What it does

1. Generates fresh VAPID key pair using `web-push`
2. Saves keys to `.env.test` file (git-ignored)
3. Displays truncated keys for verification
4. In CI/CD: Outputs keys in GitHub Actions format

### When to run

- **Locally**: Run once before testing, or when keys expire
- **CI/CD**: Automatically run before tests via `test:setup` script

### Output

Creates `.env.test` with:

```env
# Auto-generated VAPID keys for testing
# Generated at: 2026-02-11T10:30:00.000Z
# ⚠️ DO NOT use these keys in production!

PUSH_PUBLIC_VAPID_KEY=BEl62i...
PUSH_PRIVATE_VAPID_KEY=bdSW...
```

### Security

- ✅ `.env.test` is git-ignored
- ✅ Keys are never committed to repository
- ✅ Keys are deterministic per test run (for CI reproducibility)
- ⚠️ **Never use test keys in production**
