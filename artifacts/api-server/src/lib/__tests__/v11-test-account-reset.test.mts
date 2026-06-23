import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resetV11TestAccounts,
  V11TestAccountResetError,
} from "../v11-test-account-reset.ts";
import {
  hashRecoveryEmail,
} from "../v11-account-recovery.ts";
import {
  v11AccountRecoveryCodesTable,
  v11AccountsTable,
  v11UsernamesTable,
  type V11AccountRecoveryCodeRow,
  type V11AccountRow,
  type V11UsernameRow,
} from "@workspace/db/schema/v11-accounts";

const NOW = new Date("2026-06-22T12:00:00.000Z");
const SECRET = "test-reset-secret";

class FakeResetDb {
  accounts: V11AccountRow[] = [];
  usernames: V11UsernameRow[] = [];
  recoveryCodes: V11AccountRecoveryCodeRow[] = [];

  select() {
    return {
      from: async (table: unknown) => {
        if (table === v11AccountsTable) return this.accounts;
        if (table === v11UsernamesTable) return this.usernames;
        if (table === v11AccountRecoveryCodesTable) return this.recoveryCodes;
        return [];
      },
    };
  }

  delete(table: unknown) {
    return {
      where: (condition: unknown) => ({
        returning: async () => {
          const values = new Set(extractStrings(condition));

          if (table === v11AccountsTable) {
            const deleted = this.accounts.filter((row) => values.has(row.id));
            this.accounts = this.accounts.filter((row) => !values.has(row.id));
            return deleted;
          }

          if (table === v11UsernamesTable) {
            const deleted = this.usernames.filter((row) => values.has(row.accountId));
            this.usernames = this.usernames.filter((row) => !values.has(row.accountId));
            return deleted;
          }

          if (table === v11AccountRecoveryCodesTable) {
            const deleted = this.recoveryCodes.filter(
              (row) =>
                (row.accountId && values.has(row.accountId)) ||
                values.has(row.emailHash),
            );
            this.recoveryCodes = this.recoveryCodes.filter(
              (row) =>
                !(
                  (row.accountId && values.has(row.accountId)) ||
                  values.has(row.emailHash)
                ),
            );
            return deleted;
          }

          return [];
        },
      }),
    };
  }
}

function extractStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    for (const item of value) extractStrings(item, out);
    return out;
  }
  const record = value as { value?: unknown; queryChunks?: unknown };
  extractStrings(record.value, out);
  extractStrings(record.queryChunks, out);
  return out;
}

function accountRow(patch: Partial<V11AccountRow> & { id: string }): V11AccountRow {
  return {
    emailHash: null,
    emailVerifiedAt: null,
    recoveryEmailAttachedAt: null,
    displayName: "Player",
    status: "active",
    deletionRequestedAt: null,
    deletedAt: null,
    metadata: {},
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  };
}

function usernameRow(
  patch: Partial<V11UsernameRow> & {
    normalizedUsername: string;
    accountId: string;
    displayUsername: string;
  },
): V11UsernameRow {
  return {
    status: "active",
    claimedAt: NOW,
    releasedAt: null,
    ...patch,
  };
}

function recoveryCodeRow(
  patch: Partial<V11AccountRecoveryCodeRow> & { id: string; emailHash: string },
): V11AccountRecoveryCodeRow {
  return {
    accountId: null,
    codeHash: "hash",
    purpose: "recover_profile",
    expiresAt: new Date(NOW.getTime() + 600_000),
    consumedAt: null,
    attemptCount: 0,
    createdAt: NOW,
    ...patch,
  };
}

test("v1.1 staging reset preserves keeper and deletes duplicate bundles", async () => {
  const db = new FakeResetDb();
  const emailHash = hashRecoveryEmail("player@example.com", SECRET);
  db.accounts.push(
    accountRow({
      id: "acct-keep",
      displayName: "OgSoloSpader",
      emailHash,
    }),
    accountRow({
      id: "acct-duplicate",
      displayName: "OgSoloSpader",
      emailHash,
    }),
    accountRow({
      id: "acct-other",
      displayName: "Shank",
    }),
  );
  db.usernames.push(
    usernameRow({
      normalizedUsername: "ogsolo",
      accountId: "acct-keep",
      displayUsername: "OgSolo",
    }),
    usernameRow({
      normalizedUsername: "ogsolo_old",
      accountId: "acct-duplicate",
      displayUsername: "OgSoloOld",
    }),
  );
  db.recoveryCodes.push(
    recoveryCodeRow({ id: "code-keep", emailHash, accountId: "acct-keep" }),
    recoveryCodeRow({ id: "code-duplicate", emailHash, accountId: "acct-duplicate" }),
  );

  const result = await resetV11TestAccounts(
    db,
    {
      displayName: " ogsolospader ",
      keepAccountId: "acct-keep",
    },
    {
      recoverySecret: SECRET,
      env: { NODE_ENV: "production", RENDER_SERVICE_NAME: "onev1-spades-staging" },
    },
  );

  assert.deepEqual(result.deletedAccountIds, ["acct-duplicate"]);
  assert.equal(result.deletedAccounts, 1);
  assert.equal(result.deletedUsernames, 1);
  assert.equal(result.deletedRecoveryCodes, 1);
  assert.deepEqual(db.accounts.map((row) => row.id).sort(), ["acct-keep", "acct-other"]);
  assert.deepEqual(db.usernames.map((row) => row.accountId), ["acct-keep"]);
  assert.deepEqual(db.recoveryCodes.map((row) => row.id), ["code-keep"]);
});

test("v1.1 staging reset can target account by recovery email", async () => {
  const db = new FakeResetDb();
  const emailHash = hashRecoveryEmail("player@example.com", SECRET);
  db.accounts.push(accountRow({
    id: "acct-email-target",
    displayName: "Test Player",
    emailHash,
  }));
  db.recoveryCodes.push(recoveryCodeRow({
    id: "code-email-target",
    emailHash,
    accountId: null,
  }));

  const result = await resetV11TestAccounts(
    db,
    { email: " Player@Example.com " },
    {
      recoverySecret: SECRET,
      env: { NODE_ENV: "production", RENDER_SERVICE_NAME: "onev1-spades-staging" },
    },
  );

  assert.deepEqual(result.deletedAccountIds, ["acct-email-target"]);
  assert.equal(result.deletedRecoveryCodes, 1);
  assert.equal(db.accounts.length, 0);
  assert.equal(db.recoveryCodes.length, 0);
});

test("v1.1 test account reset fails closed in production runtime", async () => {
  const db = new FakeResetDb();

  await assert.rejects(
    resetV11TestAccounts(
      db,
      { accountId: "acct-prod" },
      {
        recoverySecret: SECRET,
        env: {
          NODE_ENV: "production",
          RENDER_SERVICE_NAME: "onev1-spades-production",
        },
      },
    ),
    (error) =>
      error instanceof V11TestAccountResetError &&
      error.code === "not_allowed",
  );
});
