import { test } from "node:test";
import assert from "node:assert/strict";
import {
  claimV11Username,
  createV11Account,
  deleteV11Account,
  normalizeUsername,
  V11AccountError,
} from "../v11-accounts.ts";
import {
  v11AccountsTable,
  v11UsernamesTable,
  type V11AccountRow,
  type V11UsernameRow,
} from "@workspace/db/schema/v11-accounts";

class FakeUniqueError extends Error {
  code = "23505";
  constraint: string;

  constructor(constraint: string) {
    super("duplicate key value violates unique constraint");
    this.constraint = constraint;
  }
}

class FakeAccountDb {
  accounts: V11AccountRow[] = [];
  usernames: V11UsernameRow[] = [];

  select() {
    return {
      from: (table: unknown) => ({
        where: async () => {
          if (table === v11AccountsTable) return this.accounts;
          if (table === v11UsernamesTable) return this.usernames;
          return [];
        },
      }),
    };
  }

  insert(table: unknown) {
    return {
      values: (row: any) => ({
        returning: async () => {
          if (table === v11AccountsTable) {
            if (
              row.emailHash &&
              this.accounts.some((account) => account.emailHash === row.emailHash)
            ) {
              throw new FakeUniqueError("v11_accounts_email_hash_unique");
            }
            const now = new Date();
            const account = {
              status: "active",
              metadata: {},
              createdAt: now,
              updatedAt: now,
              deletionRequestedAt: null,
              deletedAt: null,
              ...row,
            } as V11AccountRow;
            this.accounts.push(account);
            return [account];
          }

          if (table === v11UsernamesTable) {
            if (
              this.usernames.some(
                (username) =>
                  username.normalizedUsername === row.normalizedUsername &&
                  username.status === "active",
              )
            ) {
              throw new FakeUniqueError("v11_usernames_pkey");
            }
            if (
              this.usernames.some(
                (username) =>
                  username.accountId === row.accountId && username.status === "active",
              )
            ) {
              throw new FakeUniqueError("v11_usernames_account_unique");
            }
            const username = {
              releasedAt: null,
              ...row,
            } as V11UsernameRow;
            this.usernames.push(username);
            return [username];
          }

          throw new Error("Unknown table");
        },
      }),
    };
  }

  update(table: unknown) {
    return {
      set: (patch: Partial<V11AccountRow & V11UsernameRow>) => ({
        where: () => {
          let updated: Array<V11AccountRow | V11UsernameRow>;

          if (table === v11AccountsTable) {
            this.accounts = this.accounts.map((account, index) =>
              index === 0 ? ({ ...account, ...patch } as V11AccountRow) : account,
            );
            updated = [this.accounts[0]];
          } else if (table === v11UsernamesTable) {
            this.usernames = this.usernames.map(
              (username) => ({ ...username, ...patch }) as V11UsernameRow,
            );
            updated = this.usernames;
          } else {
            throw new Error("Unknown table");
          }

          return {
            returning: async () => updated,
          };
        },
      }),
    };
  }
}

async function assertAccountError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  await assert.rejects(
    promise,
    (error) => error instanceof V11AccountError && error.code === code,
  );
}

test("v1.1 account create validates and stores active accounts", async () => {
  const db = new FakeAccountDb();
  const emailHash = "a".repeat(64);

  const account = await createV11Account(db, {
    displayName: "  Shaw   Spades  ",
    emailHash,
  });

  assert.equal(account.displayName, "Shaw Spades");
  assert.equal(account.status, "active");
  assert.equal(db.accounts[0].emailHash, emailHash);
});

test("v1.1 account create rejects invalid display names", async () => {
  const db = new FakeAccountDb();

  await assertAccountError(
    createV11Account(db, { displayName: "x" }),
    "invalid_display_name",
  );
});

test("v1.1 account create rejects duplicate email hashes", async () => {
  const db = new FakeAccountDb();
  const emailHash = "b".repeat(64);

  await createV11Account(db, { displayName: "Player One", emailHash });
  await assertAccountError(
    createV11Account(db, { displayName: "Player Two", emailHash }),
    "account_exists",
  );
});

test("v1.1 username normalization is stable", () => {
  assert.deepEqual(normalizeUsername(" Og Solo Spader "), {
    normalizedUsername: "og_solo_spader",
    displayUsername: "Og_Solo_Spader",
  });
});

test("v1.1 username claim enforces uniqueness and one username per account", async () => {
  const db = new FakeAccountDb();
  const account = await createV11Account(db, { displayName: "Player One" });
  const other = await createV11Account(db, { displayName: "Player Two" });

  const username = await claimV11Username(db, {
    accountId: account.id,
    username: "OgSolo",
  });
  assert.equal(username.normalizedUsername, "ogsolo");

  await assertAccountError(
    claimV11Username(db, { accountId: other.id, username: "ogsolo" }),
    "username_taken",
  );
  await assertAccountError(
    claimV11Username(db, { accountId: account.id, username: "SecondName" }),
    "account_already_has_username",
  );
});

test("v1.1 username claim rejects unknown and deleted accounts", async () => {
  const db = new FakeAccountDb();

  await assertAccountError(
    claimV11Username(db, { accountId: "missing", username: "PlayerOne" }),
    "account_not_found",
  );

  const account = await createV11Account(db, { displayName: "Player One" });
  await deleteV11Account(db, { accountId: account.id });
  await assertAccountError(
    claimV11Username(db, { accountId: account.id, username: "PlayerOne" }),
    "account_deleted",
  );
});

test("v1.1 account deletion anonymizes identity and releases usernames safely", async () => {
  const db = new FakeAccountDb();
  const account = await createV11Account(db, {
    displayName: "Player One",
    emailHash: "c".repeat(64),
  });
  await claimV11Username(db, { accountId: account.id, username: "PlayerOne" });

  const deleted = await deleteV11Account(db, { accountId: account.id });
  assert.equal(deleted.deleted, true);
  assert.equal(deleted.account.displayName, "Deleted account");
  assert.equal(deleted.account.status, "deleted");
  assert.equal(db.accounts[0].emailHash, null);
  assert.ok(db.accounts[0].deletedAt);
  assert.equal(db.usernames[0].status, "released");
  assert.ok(db.usernames[0].releasedAt);

  const repeated = await deleteV11Account(db, { accountId: account.id });
  assert.equal(repeated.deleted, true);
  assert.equal(repeated.account.status, "deleted");
});
