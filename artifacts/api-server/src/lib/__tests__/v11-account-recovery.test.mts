import { test } from "node:test";
import assert from "node:assert/strict";
import {
  confirmV11RecoveryEmailAttach,
  hashRecoveryEmail,
  startV11AccountRecovery,
  verifyV11AccountRecovery,
  V11RecoveryError,
  type RecoveryEmailSender,
} from "../v11-account-recovery.ts";
import {
  v11AccountsTable,
  v11UsernamesTable,
  v11AccountRecoveryCodesTable,
  type V11AccountRow,
  type V11UsernameRow,
  type V11AccountRecoveryCodeRow,
} from "@workspace/db/schema/v11-accounts";

const SECRET = "test-v11-account-recovery-secret";
const NOW = new Date("2026-06-21T12:00:00.000Z");

class FakeUniqueError extends Error {
  code = "23505";
  constraint: string;

  constructor(constraint: string) {
    super("duplicate key value violates unique constraint");
    this.constraint = constraint;
  }
}

class FakeWrappedUniqueError extends Error {
  cause: FakeUniqueError;

  constructor(constraint: string) {
    super("Failed query");
    this.cause = new FakeUniqueError(constraint);
  }
}

class FakeRecoveryDb {
  accounts: V11AccountRow[] = [];
  usernames: V11UsernameRow[] = [];
  recoveryCodes: V11AccountRecoveryCodeRow[] = [];

  constructor() {
    this.accounts.push({
      id: "acct-1",
      emailHash: null,
      emailVerifiedAt: null,
      recoveryEmailAttachedAt: null,
      displayName: "Player One",
      status: "active",
      deletionRequestedAt: null,
      deletedAt: null,
      metadata: {},
      createdAt: NOW,
      updatedAt: NOW,
    });
    this.usernames.push({
      normalizedUsername: "ogsolo",
      accountId: "acct-1",
      displayUsername: "OgSolo",
      status: "active",
      claimedAt: NOW,
      releasedAt: null,
    });
  }

  private values(condition: unknown): string[] {
    if (!condition || typeof condition !== "object") return [];
    const chunks = (condition as { queryChunks?: unknown[] }).queryChunks ?? [];
    return chunks.flatMap((chunk) => {
      if (!chunk || typeof chunk !== "object") return [];
      const value = (chunk as { value?: unknown }).value;
      if (typeof value === "string") return [value];
      return this.values(chunk);
    });
  }

  select() {
    return {
      from: (table: unknown) => ({
        where: async (condition: unknown) => {
          const values = this.values(condition);
          if (table === v11AccountsTable) {
            if (!values.length) return this.accounts;
            return this.accounts.filter((account) =>
              values.includes(account.id) ||
              (account.emailHash ? values.includes(account.emailHash) : false),
            );
          }
          if (table === v11UsernamesTable) {
            if (!values.length) return this.usernames;
            return this.usernames.filter((username) =>
              values.includes(username.accountId) ||
              values.includes(username.normalizedUsername),
            );
          }
          if (table === v11AccountRecoveryCodesTable) {
            if (!values.length) return this.recoveryCodes;
            return this.recoveryCodes.filter((code) =>
              values.includes(code.id) ||
              values.includes(code.emailHash) ||
              values.includes(code.purpose),
            );
          }
          return [];
        },
      }),
    };
  }

  insert(table: unknown) {
    return {
      values: (row: any) => ({
        returning: async () => {
          if (table === v11AccountRecoveryCodesTable) {
            const recoveryCode = {
              consumedAt: null,
              ...row,
            } as V11AccountRecoveryCodeRow;
            this.recoveryCodes.push(recoveryCode);
            return [recoveryCode];
          }
          throw new Error("Unknown table");
        },
      }),
    };
  }

  update(table: unknown) {
    return {
      set: (patch: any) => ({
        where: (condition: unknown) => {
          const values = this.values(condition);
          let updated: unknown[] = [];
          if (table === v11AccountsTable) {
            if (
              patch.emailHash &&
              this.accounts.some(
                (account) => account.emailHash === patch.emailHash && !values.includes(account.id),
              )
            ) {
              throw new FakeWrappedUniqueError("v11_accounts_email_hash_unique");
            }
            this.accounts = this.accounts.map((account) =>
              values.includes(account.id) ? { ...account, ...patch } : account,
            );
            updated = this.accounts.filter((account) => values.includes(account.id));
          } else if (table === v11AccountRecoveryCodesTable) {
            this.recoveryCodes = this.recoveryCodes.map((code) =>
              values.includes(code.id) ? { ...code, ...patch } : code,
            );
            updated = this.recoveryCodes.filter((code) => values.includes(code.id));
          } else {
            throw new Error("Unknown table");
          }
          return { returning: async () => updated };
        },
      }),
    };
  }
}

async function assertRecoveryError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  await assert.rejects(
    promise,
    (error) => error instanceof V11RecoveryError && error.code === code,
  );
}

function captureSender(codes: string[]): RecoveryEmailSender {
  return ({ code }) => {
    codes.push(code);
  };
}

function expectedOgSoloUsername() {
  return {
    normalizedUsername: "ogsolo",
    displayUsername: "OgSolo",
    accountId: "acct-1",
    status: "active",
    claimedAt: NOW,
    releasedAt: null,
  };
}

test("v1.1 account recovery attaches private email and restores ranked profile", async () => {
  const db = new FakeRecoveryDb();
  const sentCodes: string[] = [];

  await startV11AccountRecovery(
    db,
    {
      email: " Player@Example.com ",
      accountId: "acct-1",
      purpose: "attach_email",
    },
    { secret: SECRET, sender: captureSender(sentCodes), now: NOW },
  );

  assert.equal(sentCodes.length, 1);
  assert.notEqual(db.recoveryCodes[0].codeHash, sentCodes[0]);

  const attached = await confirmV11RecoveryEmailAttach(
    db,
    {
      email: "player@example.com",
      accountId: "acct-1",
      code: sentCodes[0],
    },
    { secret: SECRET, now: new Date(NOW.getTime() + 1_000) },
  );

  assert.deepEqual(attached, {
    accountId: "acct-1",
    accountUsername: "OgSolo",
    displayUsername: "OgSolo",
    username: expectedOgSoloUsername(),
  });
  assert.equal(db.accounts[0].emailHash, hashRecoveryEmail("player@example.com", SECRET));
  assert.ok(db.accounts[0].emailVerifiedAt);
  assert.ok(db.recoveryCodes[0].consumedAt);

  const recoveryCodes: string[] = [];
  await startV11AccountRecovery(
    db,
    {
      email: "player@example.com",
      purpose: "recover_profile",
    },
    { secret: SECRET, sender: captureSender(recoveryCodes), now: NOW },
  );

  const recovered = await verifyV11AccountRecovery(
    db,
    {
      email: "player@example.com",
      code: recoveryCodes[0],
    },
    { secret: SECRET, now: new Date(NOW.getTime() + 2_000) },
  );

  assert.deepEqual(recovered, {
    accountId: "acct-1",
    accountUsername: "OgSolo",
    displayUsername: "OgSolo",
    username: expectedOgSoloUsername(),
  });
});

test("v1.1 account recovery rejects recovered accounts without claimed username", async () => {
  const db = new FakeRecoveryDb();
  db.usernames = [];
  db.accounts[0].emailHash = hashRecoveryEmail("player@example.com", SECRET);
  db.accounts[0].emailVerifiedAt = NOW;
  db.accounts[0].recoveryEmailAttachedAt = NOW;
  const codes: string[] = [];

  await startV11AccountRecovery(
    db,
    {
      email: "player@example.com",
      purpose: "recover_profile",
    },
    { secret: SECRET, sender: captureSender(codes), now: NOW },
  );

  await assertRecoveryError(
    verifyV11AccountRecovery(
      db,
      { email: "player@example.com", code: codes[0] },
      { secret: SECRET, now: new Date(NOW.getTime() + 1_000) },
    ),
    "username_not_found",
  );
});

test("v1.1 account recovery start reports missing recovery profile", async () => {
  const db = new FakeRecoveryDb();
  const sentCodes: string[] = [];

  await assertRecoveryError(
    startV11AccountRecovery(
      db,
      {
        email: "missing@example.com",
        purpose: "recover_profile",
      },
      { secret: SECRET, sender: captureSender(sentCodes), now: NOW },
    ),
    "account_not_found",
  );
  assert.equal(sentCodes.length, 0);
  assert.equal(db.recoveryCodes.length, 0);
});

test("v1.1 account recovery start reports recovery not enabled", async () => {
  const db = new FakeRecoveryDb();
  db.accounts[0].emailHash = hashRecoveryEmail("player@example.com", SECRET);
  db.accounts[0].emailVerifiedAt = null;
  db.accounts[0].recoveryEmailAttachedAt = null;
  const sentCodes: string[] = [];

  await assertRecoveryError(
    startV11AccountRecovery(
      db,
      {
        email: "player@example.com",
        purpose: "recover_profile",
      },
      { secret: SECRET, sender: captureSender(sentCodes), now: NOW },
    ),
    "recovery_not_enabled",
  );
  assert.equal(sentCodes.length, 0);
  assert.equal(db.recoveryCodes.length, 0);
});

test("v1.1 account recovery attach rejects email attached to another account", async () => {
  const db = new FakeRecoveryDb();
  const otherEmailHash = hashRecoveryEmail("taken@example.com", SECRET);
  db.accounts.push({
    id: "acct-2",
    emailHash: otherEmailHash,
    emailVerifiedAt: NOW,
    recoveryEmailAttachedAt: NOW,
    displayName: "Player Two",
    status: "active",
    deletionRequestedAt: null,
    deletedAt: null,
    metadata: {},
    createdAt: NOW,
    updatedAt: NOW,
  });
  const sentCodes: string[] = [];

  await assertRecoveryError(
    startV11AccountRecovery(
      db,
      {
        email: "taken@example.com",
        accountId: "acct-1",
        purpose: "attach_email",
      },
      { secret: SECRET, sender: captureSender(sentCodes), now: NOW },
    ),
    "account_exists",
  );
  assert.equal(sentCodes.length, 0);
  assert.equal(db.recoveryCodes.length, 0);
});

test("v1.1 account recovery confirm reports email attached to another account", async () => {
  const db = new FakeRecoveryDb();
  const emailHash = hashRecoveryEmail("taken@example.com", SECRET);
  const sentCodes: string[] = [];

  await startV11AccountRecovery(
    db,
    {
      email: "taken@example.com",
      accountId: "acct-1",
      purpose: "attach_email",
    },
    { secret: SECRET, sender: captureSender(sentCodes), now: NOW },
  );

  db.accounts.push({
    id: "acct-2",
    emailHash,
    emailVerifiedAt: NOW,
    recoveryEmailAttachedAt: NOW,
    displayName: "Player Two",
    status: "active",
    deletionRequestedAt: null,
    deletedAt: null,
    metadata: {},
    createdAt: NOW,
    updatedAt: NOW,
  });

  await assertRecoveryError(
    confirmV11RecoveryEmailAttach(
      db,
      { email: "taken@example.com", accountId: "acct-1", code: sentCodes[0] },
      { secret: SECRET, now: new Date(NOW.getTime() + 1_000) },
    ),
    "account_exists",
  );
});

test("v1.1 account recovery start reports email delivery failure", async () => {
  const db = new FakeRecoveryDb();
  db.accounts[0].emailHash = hashRecoveryEmail("player@example.com", SECRET);
  db.accounts[0].emailVerifiedAt = NOW;
  db.accounts[0].recoveryEmailAttachedAt = NOW;

  await assertRecoveryError(
    startV11AccountRecovery(
      db,
      {
        email: "player@example.com",
        purpose: "recover_profile",
      },
      {
        secret: SECRET,
        sender: () => {
          throw new Error("mailer down");
        },
        now: NOW,
      },
    ),
    "email_send_failed",
  );
  assert.equal(db.recoveryCodes.length, 1);
});

test("v1.1 account recovery is single-use and expires", async () => {
  const db = new FakeRecoveryDb();
  const codes: string[] = [];
  await startV11AccountRecovery(
    db,
    {
      email: "player@example.com",
      accountId: "acct-1",
      purpose: "attach_email",
    },
    { secret: SECRET, sender: captureSender(codes), now: NOW },
  );

  await confirmV11RecoveryEmailAttach(
    db,
    { email: "player@example.com", accountId: "acct-1", code: codes[0] },
    { secret: SECRET, now: new Date(NOW.getTime() + 1_000) },
  );
  await assertRecoveryError(
    confirmV11RecoveryEmailAttach(
      db,
      { email: "player@example.com", accountId: "acct-1", code: codes[0] },
      { secret: SECRET, now: new Date(NOW.getTime() + 2_000) },
    ),
    "code_consumed",
  );

  const expiredCodes: string[] = [];
  db.accounts[0].emailHash = hashRecoveryEmail("other@example.com", SECRET);
  db.accounts[0].emailVerifiedAt = NOW;
  db.accounts[0].recoveryEmailAttachedAt = NOW;
  await startV11AccountRecovery(
    db,
    {
      email: "other@example.com",
      purpose: "recover_profile",
    },
    { secret: SECRET, sender: captureSender(expiredCodes), now: NOW },
  );
  await assertRecoveryError(
    verifyV11AccountRecovery(
      db,
      { email: "other@example.com", code: expiredCodes[0] },
      { secret: SECRET, now: new Date(NOW.getTime() + 11 * 60_000) },
    ),
    "code_expired",
  );
});

test("v1.1 account recovery limits invalid code attempts", async () => {
  const db = new FakeRecoveryDb();
  db.accounts[0].emailHash = hashRecoveryEmail("player@example.com", SECRET);
  db.accounts[0].emailVerifiedAt = NOW;
  db.accounts[0].recoveryEmailAttachedAt = NOW;
  const codes: string[] = [];
  await startV11AccountRecovery(
    db,
    {
      email: "player@example.com",
      purpose: "recover_profile",
    },
    { secret: SECRET, sender: captureSender(codes), now: NOW },
  );

  for (let i = 0; i < 5; i += 1) {
    await assertRecoveryError(
      verifyV11AccountRecovery(
        db,
        { email: "player@example.com", code: "000000" },
        { secret: SECRET, now: new Date(NOW.getTime() + i * 1_000) },
      ),
      "invalid_code",
    );
  }

  await assertRecoveryError(
    verifyV11AccountRecovery(
      db,
      { email: "player@example.com", code: codes[0] },
      { secret: SECRET, now: new Date(NOW.getTime() + 6_000) },
    ),
    "too_many_attempts",
  );
});
