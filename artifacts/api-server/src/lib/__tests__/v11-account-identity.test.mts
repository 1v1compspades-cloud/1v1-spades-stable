import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeV11AccountIdentity } from "../v11-account-identity.ts";

test("v1.1 account identity is ignored when accounts flag is off", () => {
  assert.equal(
    normalizeV11AccountIdentity(
      { accountId: "acct-1", accountUsername: "Alpha" },
      false,
    ),
    null,
  );
});

test("v1.1 account identity normalizes when accounts flag is on", () => {
  assert.deepEqual(
    normalizeV11AccountIdentity(
      { accountId: " acct-1 ", accountUsername: "Alpha Player" },
      true,
    ),
    { accountId: "acct-1", accountUsername: "Alpha_Player" },
  );
});

test("v1.1 account identity rejects incomplete identity", () => {
  assert.equal(normalizeV11AccountIdentity({ accountId: "acct-1" }, true), null);
  assert.equal(
    normalizeV11AccountIdentity({ accountUsername: "Alpha" }, true),
    null,
  );
});
