import { test } from "node:test";
import assert from "node:assert/strict";
import { createV11RecoveryEmailSender } from "../v11-recovery-email.ts";

const EXPIRES_AT = new Date("2026-06-22T12:10:00.000Z");

function recoveryMessage() {
  return {
    email: "player@example.com",
    code: "123456",
    purpose: "recover_profile" as const,
    accountId: "acct-1",
    expiresAt: EXPIRES_AT,
  };
}

test("v1.1 recovery email uses Resend when an API key is configured", async () => {
  let request:
    | {
        input: string | URL | Request;
        init: RequestInit | undefined;
      }
    | undefined;

  const sender = createV11RecoveryEmailSender({
    env: {
      NODE_ENV: "production",
      RESEND_API_KEY: "re_test_key",
      V11_ACCOUNT_RECOVERY_FROM_EMAIL: "1v1 Spades <support@example.com>",
      V11_ACCOUNT_RECOVERY_APP_URL: "https://example.com",
    },
    fetchImpl: async (input, init) => {
      request = { input, init };
      return new Response(JSON.stringify({ id: "email_123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    logger: {
      info: () => undefined,
      warn: () => undefined,
    },
  });

  await sender(recoveryMessage());

  assert.ok(request);
  assert.equal(request.input, "https://api.resend.com/emails");
  assert.equal(request.init?.method, "POST");
  assert.deepEqual(request.init?.headers, {
    authorization: "Bearer re_test_key",
    "content-type": "application/json",
  });
  const requestBody = request.init?.body;
  if (typeof requestBody !== "string") {
    throw new Error("Expected Resend request body to be a JSON string.");
  }

  const body = JSON.parse(requestBody);
  assert.equal(body.from, "1v1 Spades <support@example.com>");
  assert.equal(body.to, "player@example.com");
  assert.equal(body.subject, "Recover your 1v1 Spades ranked profile");
  assert.match(body.text, /123456/);
  assert.match(body.html, /123456/);
  assert.match(body.text, /https:\/\/example\.com/);
});

test("v1.1 recovery email requires a from address when Resend is configured", async () => {
  const sender = createV11RecoveryEmailSender({
    env: {
      NODE_ENV: "production",
      RESEND_API_KEY: "re_test_key",
    },
    fetchImpl: async () =>
      new Response(JSON.stringify({ id: "should-not-send" }), { status: 200 }),
    logger: {
      info: () => undefined,
      warn: () => undefined,
    },
  });

  await assert.rejects(
    async () => {
      await sender(recoveryMessage());
    },
    /V11_ACCOUNT_RECOVERY_FROM_EMAIL or RESEND_FROM_EMAIL/,
  );
});

test("v1.1 recovery email keeps log-only fallback without Resend", async () => {
  const logs: unknown[] = [];
  const sender = createV11RecoveryEmailSender({
    env: {
      NODE_ENV: "production",
      RENDER_SERVICE_NAME: "onev1-spades-staging",
    },
    fetchImpl: async () =>
      new Response(JSON.stringify({ id: "should-not-send" }), { status: 200 }),
    logger: {
      info: (details: unknown) => {
        logs.push(details);
      },
      warn: () => undefined,
    },
  });

  await sender(recoveryMessage());

  assert.equal(logs.length, 1);
  assert.deepEqual(logs[0], {
    purpose: "recover_profile",
    code: "123456",
    accountAttached: true,
    expiresAt: EXPIRES_AT.toISOString(),
  });
});

test("v1.1 recovery email rejects production sends without Resend", async () => {
  const infos: unknown[] = [];
  const warnings: unknown[] = [];
  const sender = createV11RecoveryEmailSender({
    env: {
      NODE_ENV: "production",
      RENDER_SERVICE_NAME: "onev1-spades-production",
    },
    fetchImpl: async () =>
      new Response(JSON.stringify({ id: "should-not-send" }), { status: 200 }),
    logger: {
      info: (details: unknown) => {
        infos.push(details);
      },
      warn: (details: unknown) => {
        warnings.push(details);
      },
    },
  });

  await assert.rejects(
    async () => {
      await sender(recoveryMessage());
    },
    /Recovery email sender is not configured/,
  );

  assert.equal(infos.length, 0);
  assert.equal(warnings.length, 1);
  assert.deepEqual(warnings[0], {
    purpose: "recover_profile",
    accountAttached: true,
  });
  assert.doesNotMatch(JSON.stringify(warnings), /123456/);
});
