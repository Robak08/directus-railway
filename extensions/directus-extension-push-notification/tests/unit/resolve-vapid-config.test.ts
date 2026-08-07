import { describe, expect, it } from "vitest";

import {
  resolveVapidConfig,
  resolveVapidSubjectWithFallback,
} from "../../src/shared/resolve-vapid-config.js";

describe("resolveVapidConfig", () => {
  it("resolves Railway-style VAPID_* keys from Directus env", () => {
    const config = resolveVapidConfig({
      VAPID_PUBLIC_KEY: "public-key",
      VAPID_PRIVATE_KEY: "private-key",
      PUBLIC_URL: "https://cms.example.com",
    });

    expect(config).toEqual({
      publicKey: "public-key",
      privateKey: "private-key",
      subject: "https://cms.example.com",
    });
  });

  it("prefers PUSH_* over VAPID_* when both are set", () => {
    const config = resolveVapidConfig({
      PUSH_PUBLIC_VAPID_KEY: "push-public",
      PUSH_PRIVATE_VAPID_KEY: "push-private",
      VAPID_PUBLIC_KEY: "vapid-public",
      VAPID_PRIVATE_KEY: "vapid-private",
      PUSH_VAPID_SUBJECT: "mailto:ops@example.com",
    });

    expect(config).toEqual({
      publicKey: "push-public",
      privateKey: "push-private",
      subject: "mailto:ops@example.com",
    });
  });

  it("falls back to process.env when Directus env is missing keys", () => {
    const config = resolveVapidConfig(
      { PUBLIC_URL: "https://cms.example.com" },
      {
        VAPID_PUBLIC_KEY: "public-key",
        VAPID_PRIVATE_KEY: "private-key",
      },
    );

    expect(config).toEqual({
      publicKey: "public-key",
      privateKey: "private-key",
      subject: "https://cms.example.com",
    });
  });

  it("returns null when keys are missing", () => {
    expect(resolveVapidConfig({ VAPID_PUBLIC_KEY: "public-only" })).toBeNull();
  });
});

describe("resolveVapidSubjectWithFallback", () => {
  it("uses mailto fallback for http PUBLIC_URL", () => {
    const result = resolveVapidSubjectWithFallback({
      PUBLIC_URL: "http://0.0.0.0:8055",
    });

    expect(result).toEqual({
      subject: "mailto:admin@example.com",
      usedHttpFallback: true,
    });
  });
});
