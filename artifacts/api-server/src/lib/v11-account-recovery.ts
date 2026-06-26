import { createHmac, randomInt, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  v11AccountsTable,
  v11UsernamesTable,
  v11AccountRecoveryCodesTable,
  type InsertV11AccountRecoveryCode,
  type V11AccountRow,
  type V11UsernameRow,
  type V11AccountRecoveryCodeRow,
} from "@workspace/db/schema/v11-accounts";

export type V11RecoveryPurpose = "attach_email" | "recover_profile";

export type V11RecoveryErrorCode =
  | "invalid_email"
  | "invalid_code"
  | "account_not_found"
  | "account_deleted"
  | "username_not_found"
  | "account_exists"
  | "code_expired"
  | "code_consumed"
  | "too_many_attempts"
  | "recovery_not_found"
  | "recovery_not_enabled"
  | "recovery_not_configured"
  | "email_send_failed";

export class V11RecoveryError extends Error {
  readonly code: V11RecoveryErrorCode;

  constructor(
    code: V11RecoveryErrorCode,
    message: string,
    options: { cause?: unknown } = {},
  ) {
    super(message, options);
    this.code = code;
    this.name = "V11RecoveryError";
  }
}

export type V11RecoveryDb = {
  select: (...args: unknown[]) => any;
  insert: (...args: unknown[]) => any;
  update: (...args: unknown[]) => any;
};

export type RecoveryEmailSender = (message: {
  email: string;
  code: string;
  purpose: V11RecoveryPurpose;
  accountId: string | null;
  expiresAt: Date;
}) => void | Promise<void>;

export type RecoveredRankedUsername = {
  normalizedUsername: string;
  displayUsername: string;
  accountId: string;
  status: string;
  claimedAt: Date;
  releasedAt: Date | null;
};

export type RecoveredRankedProfile = {
  accountId: string;
  accountUsername: string | null;
  displayUsername: string | null;
  username: RecoveredRankedUsername | null;
};

const EMAIL_MAX = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_PATTERN = /^\d{6}$/;
const RECOVERY_CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

function hmac(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function normalizeRecoveryEmail(value: unknown): string {
  if (typeof value !== "string") {
    throw new V11RecoveryError("invalid_email", "Email is required.");
  }

  const email = value.trim().toLowerCase();
  if (!email || email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) {
    throw new V11RecoveryError("invalid_email", "Enter a valid email address.");
  }
  return email;
}

export function hashRecoveryEmail(email: string, secret: string): string {
  return hmac(secret, `email:${email}`);
}

function hashRecoveryCode(
  emailHash: string,
  code: string,
  purpose: V11RecoveryPurpose,
  accountId: string | null,
  secret: string,
): string {
  return hmac(secret, `code:${purpose}:${emailHash}:${accountId ?? ""}:${code}`);
}

function generateRecoveryCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function assertRecoveryCode(value: unknown): string {
  if (typeof value !== "string" || !CODE_PATTERN.test(value.trim())) {
    throw new V11RecoveryError("invalid_code", "Enter the 6 digit recovery code.");
  }
  return value.trim();
}

async function findActiveAccount(
  db: V11RecoveryDb,
  accountId: string,
): Promise<V11AccountRow> {
  const accounts = await db
    .select()
    .from(v11AccountsTable)
    .where(eq(v11AccountsTable.id, accountId));
  const account = accounts[0] as V11AccountRow | undefined;
  if (!account) {
    throw new V11RecoveryError("account_not_found", "Account not found.");
  }
  if (account.status !== "active" || account.deletedAt) {
    throw new V11RecoveryError("account_deleted", "Account has been deleted.");
  }
  return account;
}

async function findActiveAccountByEmailHash(
  db: V11RecoveryDb,
  emailHash: string,
): Promise<V11AccountRow> {
  const accounts = (await db
    .select()
    .from(v11AccountsTable)
    .where(eq(v11AccountsTable.emailHash, emailHash))) as V11AccountRow[];
  const account = accounts.find((row) => row.status === "active" && !row.deletedAt);
  if (!account) {
    throw new V11RecoveryError(
      "account_not_found",
      "No ranked profile is attached to that recovery email.",
    );
  }
  if (!account.recoveryEmailAttachedAt) {
    throw new V11RecoveryError(
      "recovery_not_enabled",
      "Recovery is not enabled for that ranked profile.",
    );
  }
  return account;
}

async function assertEmailNotAttachedToAnotherAccount(
  db: V11RecoveryDb,
  emailHash: string,
  accountId: string,
): Promise<void> {
  const accounts = (await db
    .select()
    .from(v11AccountsTable)
    .where(eq(v11AccountsTable.emailHash, emailHash))) as V11AccountRow[];
  const otherAccount = accounts.find(
    (row) =>
      row.id !== accountId &&
      row.status === "active" &&
      !row.deletedAt &&
      row.recoveryEmailAttachedAt,
  );
  if (otherAccount) {
    throw new V11RecoveryError(
      "account_exists",
      "That email is already attached to another ranked profile.",
    );
  }
}

async function activeUsernameForAccount(
  db: V11RecoveryDb,
  accountId: string,
): Promise<V11UsernameRow | null> {
  const usernames = await db
    .select()
    .from(v11UsernamesTable)
    .where(eq(v11UsernamesTable.accountId, accountId));
  const active = (usernames as V11UsernameRow[]).find(
    (row) => row.status === "active" && !row.releasedAt,
  );
  return active ?? null;
}

function toRecoveredUsername(row: V11UsernameRow): RecoveredRankedUsername {
  return {
    normalizedUsername: row.normalizedUsername,
    displayUsername: row.displayUsername,
    accountId: row.accountId,
    status: row.status,
    claimedAt: row.claimedAt,
    releasedAt: row.releasedAt,
  };
}

function toRecoveredProfile(
  accountId: string,
  username: V11UsernameRow | null,
): RecoveredRankedProfile {
  const publicUsername = username ? toRecoveredUsername(username) : null;
  return {
    accountId,
    accountUsername: publicUsername?.displayUsername ?? null,
    displayUsername: publicUsername?.displayUsername ?? null,
    username: publicUsername,
  };
}

async function requireActiveUsernameForAccount(
  db: V11RecoveryDb,
  accountId: string,
): Promise<V11UsernameRow> {
  const username = await activeUsernameForAccount(db, accountId);
  if (!username) {
    throw new V11RecoveryError(
      "username_not_found",
      "Recovered account has no claimed username.",
    );
  }
  return username;
}

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

export async function startV11AccountRecovery(
  db: V11RecoveryDb,
  input: {
    email: unknown;
    purpose: V11RecoveryPurpose;
    accountId?: unknown;
  },
  options: {
    secret: string;
    sender: RecoveryEmailSender;
    now?: Date;
  },
): Promise<{ ok: true; expiresAt: Date }> {
  const email = normalizeRecoveryEmail(input.email);
  const emailHash = hashRecoveryEmail(email, options.secret);
  const accountId =
    typeof input.accountId === "string" && input.accountId.trim()
      ? input.accountId.trim()
      : null;

  if (input.purpose === "attach_email") {
    if (!accountId) {
      throw new V11RecoveryError("account_not_found", "Account not found.");
    }
    await findActiveAccount(db, accountId);
    await assertEmailNotAttachedToAnotherAccount(db, emailHash, accountId);
  } else {
    await findActiveAccountByEmailHash(db, emailHash);
  }

  const now = options.now ?? new Date();
  const expiresAt = new Date(now.getTime() + RECOVERY_CODE_TTL_MS);
  const code = generateRecoveryCode();
  const row: InsertV11AccountRecoveryCode = {
    id: randomUUID(),
    emailHash,
    accountId,
    codeHash: hashRecoveryCode(
      emailHash,
      code,
      input.purpose,
      accountId,
      options.secret,
    ),
    purpose: input.purpose,
    expiresAt,
    attemptCount: 0,
    createdAt: now,
  };

  await db.insert(v11AccountRecoveryCodesTable).values(row).returning();
  try {
    await options.sender({
      email,
      code,
      purpose: input.purpose,
      accountId,
      expiresAt,
    });
  } catch (error) {
    if (error instanceof V11RecoveryError) throw error;
    throw new V11RecoveryError(
      "email_send_failed",
      "We could not send the recovery email. Please try again in a few minutes.",
      { cause: error },
    );
  }

  return { ok: true, expiresAt };
}

async function verifyRecoveryCode(
  db: V11RecoveryDb,
  input: {
    email: unknown;
    code: unknown;
    purpose: V11RecoveryPurpose;
    accountId?: unknown;
  },
  options: {
    secret: string;
    now?: Date;
  },
): Promise<{
  row: V11AccountRecoveryCodeRow;
  emailHash: string;
  now: Date;
}> {
  const email = normalizeRecoveryEmail(input.email);
  const emailHash = hashRecoveryEmail(email, options.secret);
  const accountId =
    typeof input.accountId === "string" && input.accountId.trim()
      ? input.accountId.trim()
      : null;
  const code = assertRecoveryCode(input.code);
  const now = options.now ?? new Date();

  const rows = (await db
    .select()
    .from(v11AccountRecoveryCodesTable)
    .where(
      and(
        eq(v11AccountRecoveryCodesTable.emailHash, emailHash),
        eq(v11AccountRecoveryCodesTable.purpose, input.purpose),
      ),
    )) as V11AccountRecoveryCodeRow[];

  const candidates = rows
    .filter(
      (row) =>
        row.emailHash === emailHash &&
        row.purpose === input.purpose &&
        (accountId ? row.accountId === accountId : true),
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const row = candidates[0];
  if (!row) {
    throw new V11RecoveryError("recovery_not_found", "Recovery code not found.");
  }
  if (row.consumedAt) {
    throw new V11RecoveryError("code_consumed", "Recovery code has already been used.");
  }
  if (row.expiresAt.getTime() <= now.getTime()) {
    throw new V11RecoveryError("code_expired", "Recovery code has expired.");
  }

  const attempts = row.attemptCount;
  if (attempts >= MAX_CODE_ATTEMPTS) {
    throw new V11RecoveryError("too_many_attempts", "Too many recovery attempts.");
  }

  const expected = hashRecoveryCode(
    emailHash,
    code,
    input.purpose,
    row.accountId,
    options.secret,
  );
  if (expected !== row.codeHash) {
    await db
      .update(v11AccountRecoveryCodesTable)
      .set({ attemptCount: attempts + 1 })
      .where(eq(v11AccountRecoveryCodesTable.id, row.id))
      .returning();
    throw new V11RecoveryError("invalid_code", "Recovery code is invalid.");
  }

  return { row, emailHash, now };
}

export async function confirmV11RecoveryEmailAttach(
  db: V11RecoveryDb,
  input: {
    accountId: unknown;
    email: unknown;
    code: unknown;
  },
  options: {
    secret: string;
    now?: Date;
  },
): Promise<RecoveredRankedProfile> {
  if (typeof input.accountId !== "string" || !input.accountId.trim()) {
    throw new V11RecoveryError("account_not_found", "Account not found.");
  }
  const accountId = input.accountId.trim();
  await findActiveAccount(db, accountId);
  const verified = await verifyRecoveryCode(
    db,
    {
      email: input.email,
      code: input.code,
      purpose: "attach_email",
      accountId,
    },
    options,
  );
  await assertEmailNotAttachedToAnotherAccount(db, verified.emailHash, accountId);

  try {
    await db
      .update(v11AccountsTable)
      .set({
        emailHash: verified.emailHash,
        emailVerifiedAt: verified.now,
        recoveryEmailAttachedAt: verified.now,
        updatedAt: verified.now,
      })
      .where(eq(v11AccountsTable.id, accountId))
      .returning();
  } catch (error) {
    if (isUniqueViolation(error, "v11_accounts_email_hash_unique")) {
      throw new V11RecoveryError(
        "account_exists",
        "That email is already attached to a ranked profile.",
      );
    }
    throw error;
  }

  await db
    .update(v11AccountRecoveryCodesTable)
    .set({ consumedAt: verified.now })
    .where(eq(v11AccountRecoveryCodesTable.id, verified.row.id))
    .returning();

  return toRecoveredProfile(accountId, await activeUsernameForAccount(db, accountId));
}

export async function verifyV11AccountRecovery(
  db: V11RecoveryDb,
  input: {
    email: unknown;
    code: unknown;
  },
  options: {
    secret: string;
    now?: Date;
  },
): Promise<RecoveredRankedProfile> {
  const verified = await verifyRecoveryCode(
    db,
    {
      email: input.email,
      code: input.code,
      purpose: "recover_profile",
    },
    options,
  );

  const accounts = (await db
    .select()
    .from(v11AccountsTable)
    .where(eq(v11AccountsTable.emailHash, verified.emailHash))) as V11AccountRow[];
  const account = accounts.find((row) => row.status === "active" && !row.deletedAt);
  if (!account) {
    throw new V11RecoveryError("account_not_found", "Account not found.");
  }
  if (!account.recoveryEmailAttachedAt) {
    throw new V11RecoveryError(
      "recovery_not_enabled",
      "Recovery is not enabled for that ranked profile.",
    );
  }

  await db
    .update(v11AccountRecoveryCodesTable)
    .set({ consumedAt: verified.now })
    .where(eq(v11AccountRecoveryCodesTable.id, verified.row.id))
    .returning();

  return toRecoveredProfile(
    account.id,
    await requireActiveUsernameForAccount(db, account.id),
  );
}
