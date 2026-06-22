import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeV11AccountIdentity,
  validateV11RankedAccountIdentity,
  V11AccountIdentityError,
} from "../v11-account-identity.ts";
import {
  v11AccountsTable,
  v11UsernamesTable,
  type V11AccountRow,
  type V11UsernameRow,
} from "@workspace/db/schema/v11-accounts";

class FakeIdentityDb {
  accounts: V11AccountRow[] = [];
  usernames: V11UsernameRow[] = [];

  private getEqValue(condition: unknown): string | null {
    if (!condition || typeof condition !== "object") return null;
    const chunks = (condition as { queryChunks?: Array<{ value?: unknown }> })
      .queryChunks;
    const value = chunks?.find((chunk) => typeof chunk.value === "string")?.value;
    return typeof value === "string" ? value : null;
  }

  select() {
    return {
      from: (table: unknown) => ({
        where: async (condition: unknown) => {
          const value = this.getEqValue(condition);
          if (table === v11AccountsTable) {
            return value
              ? this.accounts.filter((account) => account.id === value)
              : this.accounts;
          }
          if (table === v11UsernamesTable) {
            return value
              ? this.usernames.filter((username) => username.accountId === value)
              : this.usernames;
          }
          return [];
        },
      }),
    };
  }
}

function accountRow(patch: Partial<V11AccountRow> & { id: string }): V11AccountRow {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    emailHash: null,
    emailVerifiedAt: null,
    recoveryEmailAttachedAt: null,
    displayName: "Player",
    status: "active",
    deletionRequestedAt: null,
    deletedAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...patch,
    id: patch.id,
  };
}

function usernameRow(
  patch: Partial<V11UsernameRow> & {
    accountId: string;
    normalizedUsername: string;
    displayUsername: string;
  },
): V11UsernameRow {
  return {
    status: "active",
    claimedAt: new Date("2026-01-01T00:00:00.000Z"),
    releasedAt: null,
    ...patch,
  };
}

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

test("v1.1 ranked account identity validates against active account username", async () => {
  const db = new FakeIdentityDb();
  db.accounts.push(accountRow({ id: "acct-1" }));
  db.usernames.push(usernameRow({
    accountId: "acct-1",
    normalizedUsername: "alpha_player",
    displayUsername: "Alpha_Player",
  }));

  const identity = await validateV11RankedAccountIdentity(
    db,
    { accountId: "acct-1", accountUsername: "Alpha Player" },
    true,
  );

  assert.deepEqual(identity, {
    accountId: "acct-1",
    accountUsername: "Alpha_Player",
    validatedRanked: true,
  });
});

test("v1.1 ranked account identity rejects spoofed username for account", async () => {
  const db = new FakeIdentityDb();
  db.accounts.push(accountRow({ id: "acct-1" }));
  db.usernames.push(usernameRow({
    accountId: "acct-1",
    normalizedUsername: "alpha",
    displayUsername: "Alpha",
  }));

  await assert.rejects(
    validateV11RankedAccountIdentity(
      db,
      { accountId: "acct-1", accountUsername: "Bravo" },
      true,
    ),
    (err) =>
      err instanceof V11AccountIdentityError &&
      err.code === "username_mismatch",
  );
});

test("v1.1 ranked account identity rejects missing username row", async () => {
  const db = new FakeIdentityDb();
  db.accounts.push(accountRow({ id: "acct-1" }));

  await assert.rejects(
    validateV11RankedAccountIdentity(
      db,
      { accountId: "acct-1", accountUsername: "Alpha" },
      true,
    ),
    (err) =>
      err instanceof V11AccountIdentityError &&
      err.code === "username_not_found",
  );
});

test("v1.1 ranked account identity rejects released username row", async () => {
  const db = new FakeIdentityDb();
  db.accounts.push(accountRow({ id: "acct-1" }));
  db.usernames.push(usernameRow({
    accountId: "acct-1",
    normalizedUsername: "alpha",
    displayUsername: "Alpha",
    status: "released",
    releasedAt: new Date("2026-01-02T00:00:00.000Z"),
  }));

  await assert.rejects(
    validateV11RankedAccountIdentity(
      db,
      { accountId: "acct-1", accountUsername: "Alpha" },
      true,
    ),
    (err) =>
      err instanceof V11AccountIdentityError &&
      err.code === "username_not_found",
  );
});

test("v1.1 ranked account identity rejects missing or deleted account", async () => {
  const db = new FakeIdentityDb();
  db.accounts.push(accountRow({
    id: "acct-deleted",
    status: "deleted",
    deletedAt: new Date("2026-01-02T00:00:00.000Z"),
  }));

  await assert.rejects(
    validateV11RankedAccountIdentity(
      db,
      { accountId: "acct-missing", accountUsername: "Alpha" },
      true,
    ),
    (err) =>
      err instanceof V11AccountIdentityError &&
      err.code === "account_not_found",
  );
  await assert.rejects(
    validateV11RankedAccountIdentity(
      db,
      { accountId: "acct-deleted", accountUsername: "Alpha" },
      true,
    ),
    (err) =>
      err instanceof V11AccountIdentityError &&
      err.code === "account_deleted",
  );
});
