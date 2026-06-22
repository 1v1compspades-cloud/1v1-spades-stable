import { eq } from "drizzle-orm";
import {
  v11AccountsTable,
  v11UsernamesTable,
  type V11AccountRow,
  type V11UsernameRow,
} from "@workspace/db/schema/v11-accounts";
import { normalizeUsername, V11AccountError } from "./v11-accounts.js";

export type V11AccountIdentity = {
  accountId: string;
  accountUsername: string;
};

export type ValidatedV11AccountIdentity = V11AccountIdentity & {
  validatedRanked: true;
};

export type V11AccountIdentityDb = {
  select: (...args: unknown[]) => any;
};

export type V11AccountIdentityErrorCode =
  | "account_required"
  | "invalid_username"
  | "account_not_found"
  | "account_deleted"
  | "username_not_found"
  | "username_mismatch";

export class V11AccountIdentityError extends Error {
  readonly code: V11AccountIdentityErrorCode;

  constructor(code: V11AccountIdentityErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "V11AccountIdentityError";
  }
}

export function normalizeV11AccountIdentity(
  data: { accountId?: unknown; accountUsername?: unknown },
  enabled: boolean,
): V11AccountIdentity | null {
  if (!enabled) return null;
  if (typeof data.accountId !== "string" || typeof data.accountUsername !== "string") {
    return null;
  }
  const accountId = data.accountId.trim();
  const accountUsername = data.accountUsername.trim().replace(/\s+/g, "_");
  if (
    !accountId ||
    accountId.length > 80 ||
    !accountUsername ||
    accountUsername.length > 32
  ) {
    return null;
  }
  return { accountId, accountUsername };
}

export async function validateV11RankedAccountIdentity(
  db: V11AccountIdentityDb,
  data: { accountId?: unknown; accountUsername?: unknown },
  enabled: boolean,
): Promise<ValidatedV11AccountIdentity> {
  const submitted = normalizeV11AccountIdentity(data, enabled);
  if (!submitted) {
    throw new V11AccountIdentityError(
      "account_required",
      "Create account to play ranked.",
    );
  }

  let requestedUsername: ReturnType<typeof normalizeUsername>;
  try {
    requestedUsername = normalizeUsername(submitted.accountUsername);
  } catch (err) {
    if (err instanceof V11AccountError) {
      throw new V11AccountIdentityError("invalid_username", err.message);
    }
    throw err;
  }

  const accounts = (await db
    .select()
    .from(v11AccountsTable)
    .where(eq(v11AccountsTable.id, submitted.accountId))) as V11AccountRow[];
  const account = accounts[0];
  if (!account) {
    throw new V11AccountIdentityError(
      "account_not_found",
      "Ranked account was not found.",
    );
  }
  if (account.status !== "active" || account.deletedAt) {
    throw new V11AccountIdentityError(
      "account_deleted",
      "Ranked account is no longer active.",
    );
  }

  const usernames = (await db
    .select()
    .from(v11UsernamesTable)
    .where(eq(v11UsernamesTable.accountId, account.id))) as V11UsernameRow[];
  const username = usernames.find(
    (row) => row.status === "active" && !row.releasedAt,
  );
  if (!username) {
    throw new V11AccountIdentityError(
      "username_not_found",
      "Claim a username to play ranked.",
    );
  }

  if (
    username.normalizedUsername !== requestedUsername.normalizedUsername ||
    username.displayUsername !== requestedUsername.displayUsername
  ) {
    throw new V11AccountIdentityError(
      "username_mismatch",
      "Ranked username does not match this account.",
    );
  }

  return {
    accountId: account.id,
    accountUsername: username.displayUsername,
    validatedRanked: true,
  };
}
