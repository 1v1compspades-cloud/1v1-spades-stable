import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  v11AccountsTable,
  v11UsernamesTable,
  type InsertV11Account,
  type V11AccountRow,
  type V11UsernameRow,
} from "@workspace/db/schema/v11-accounts";

export type V11AccountDb = {
  select: (...args: unknown[]) => any;
  insert: (...args: unknown[]) => any;
  update: (...args: unknown[]) => any;
};

export type V11AccountErrorCode =
  | "invalid_display_name"
  | "invalid_email_hash"
  | "invalid_username"
  | "account_exists"
  | "account_not_found"
  | "account_deleted"
  | "username_taken"
  | "account_already_has_username";

export class V11AccountError extends Error {
  readonly code: V11AccountErrorCode;

  constructor(code: V11AccountErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "V11AccountError";
  }
}

export type PublicV11Account = {
  id: string;
  displayName: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletionRequestedAt: Date | null;
  deletedAt: Date | null;
};

export type PublicV11Username = {
  normalizedUsername: string;
  displayUsername: string;
  accountId: string;
  status: string;
  claimedAt: Date;
  releasedAt: Date | null;
};

const DISPLAY_NAME_MIN = 2;
const DISPLAY_NAME_MAX = 32;
const USERNAME_MIN = 3;
const USERNAME_MAX = 20;
const EMAIL_HASH_PATTERN = /^[a-f0-9]{64}$/i;
const USERNAME_PATTERN = /^[a-z0-9_]+$/;

function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (!error || typeof error !== "object") return false;
  const source =
    "cause" in error && error.cause && typeof error.cause === "object"
      ? error.cause
      : error;
  const candidate = source as { code?: string; constraint?: string };
  if (candidate.code !== "23505") return false;
  return !constraint || candidate.constraint === constraint;
}

export function sanitizeDisplayName(value: unknown): string {
  if (typeof value !== "string") {
    throw new V11AccountError("invalid_display_name", "Display name is required.");
  }

  const displayName = value.trim().replace(/\s+/g, " ");
  if (
    displayName.length < DISPLAY_NAME_MIN ||
    displayName.length > DISPLAY_NAME_MAX
  ) {
    throw new V11AccountError(
      "invalid_display_name",
      `Display name must be ${DISPLAY_NAME_MIN}-${DISPLAY_NAME_MAX} characters.`,
    );
  }

  return displayName;
}

export function sanitizeEmailHash(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !EMAIL_HASH_PATTERN.test(value.trim())) {
    throw new V11AccountError(
      "invalid_email_hash",
      "Email hash must be a 64 character SHA-256 hex string.",
    );
  }
  return value.trim().toLowerCase();
}

export function normalizeUsername(value: unknown): {
  normalizedUsername: string;
  displayUsername: string;
} {
  if (typeof value !== "string") {
    throw new V11AccountError("invalid_username", "Username is required.");
  }

  const displayUsername = value.trim().replace(/\s+/g, "_");
  const normalizedUsername = displayUsername.toLowerCase();
  if (
    normalizedUsername.length < USERNAME_MIN ||
    normalizedUsername.length > USERNAME_MAX ||
    !USERNAME_PATTERN.test(normalizedUsername)
  ) {
    throw new V11AccountError(
      "invalid_username",
      `Username must be ${USERNAME_MIN}-${USERNAME_MAX} letters, numbers, or underscores.`,
    );
  }

  return { normalizedUsername, displayUsername };
}

function toPublicAccount(row: V11AccountRow): PublicV11Account {
  return {
    id: row.id,
    displayName: row.displayName,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletionRequestedAt: row.deletionRequestedAt,
    deletedAt: row.deletedAt,
  };
}

function toPublicUsername(row: V11UsernameRow): PublicV11Username {
  return {
    normalizedUsername: row.normalizedUsername,
    displayUsername: row.displayUsername,
    accountId: row.accountId,
    status: row.status,
    claimedAt: row.claimedAt,
    releasedAt: row.releasedAt,
  };
}

export async function createV11Account(
  db: V11AccountDb,
  input: { displayName: unknown; emailHash?: unknown },
): Promise<PublicV11Account> {
  const row: InsertV11Account = {
    id: randomUUID(),
    displayName: sanitizeDisplayName(input.displayName),
    emailHash: sanitizeEmailHash(input.emailHash),
  };

  try {
    const inserted = await db
      .insert(v11AccountsTable)
      .values(row)
      .returning();
    return toPublicAccount(inserted[0]);
  } catch (error) {
    if (isUniqueViolation(error, "v11_accounts_email_hash_unique")) {
      throw new V11AccountError(
        "account_exists",
        "An account already exists for this email hash.",
      );
    }
    throw error;
  }
}

export async function claimV11Username(
  db: V11AccountDb,
  input: { accountId: unknown; username: unknown },
): Promise<PublicV11Username> {
  if (typeof input.accountId !== "string" || input.accountId.trim() === "") {
    throw new V11AccountError("account_not_found", "Account not found.");
  }

  const accountId = input.accountId.trim();
  const { normalizedUsername, displayUsername } = normalizeUsername(input.username);
  const accounts = await db
    .select()
    .from(v11AccountsTable)
    .where(eq(v11AccountsTable.id, accountId));
  const account = accounts[0] as V11AccountRow | undefined;

  if (!account) {
    throw new V11AccountError("account_not_found", "Account not found.");
  }
  if (account.status !== "active" || account.deletedAt) {
    throw new V11AccountError("account_deleted", "Account has been deleted.");
  }

  try {
    const inserted = await db
      .insert(v11UsernamesTable)
      .values({
        normalizedUsername,
        displayUsername,
        accountId,
        status: "active",
        claimedAt: new Date(),
      })
      .returning();
    return toPublicUsername(inserted[0]);
  } catch (error) {
    if (isUniqueViolation(error, "v11_usernames_account_unique")) {
      throw new V11AccountError(
        "account_already_has_username",
        "Account already has a username.",
      );
    }
    if (isUniqueViolation(error) || isUniqueViolation(error, "v11_usernames_pkey")) {
      throw new V11AccountError("username_taken", "Username is already taken.");
    }
    throw error;
  }
}

export async function deleteV11Account(
  db: V11AccountDb,
  input: { accountId: unknown },
): Promise<{ deleted: true; account: PublicV11Account }> {
  if (typeof input.accountId !== "string" || input.accountId.trim() === "") {
    throw new V11AccountError("account_not_found", "Account not found.");
  }

  const accountId = input.accountId.trim();
  const existing = await db
    .select()
    .from(v11AccountsTable)
    .where(eq(v11AccountsTable.id, accountId));
  const account = existing[0] as V11AccountRow | undefined;

  if (!account) {
    throw new V11AccountError("account_not_found", "Account not found.");
  }

  const deletedAt = account.deletedAt ?? new Date();
  await db
    .update(v11UsernamesTable)
    .set({
      status: "released",
      releasedAt: deletedAt,
    })
    .where(eq(v11UsernamesTable.accountId, accountId));

  const updated = await db
    .update(v11AccountsTable)
    .set({
      emailHash: null,
      emailVerifiedAt: null,
      recoveryEmailAttachedAt: null,
      displayName: "Deleted account",
      status: "deleted",
      deletionRequestedAt: account.deletionRequestedAt ?? deletedAt,
      deletedAt,
      metadata: { deleted: true },
      updatedAt: deletedAt,
    })
    .where(eq(v11AccountsTable.id, accountId))
    .returning();

  return { deleted: true, account: toPublicAccount(updated[0]) };
}
