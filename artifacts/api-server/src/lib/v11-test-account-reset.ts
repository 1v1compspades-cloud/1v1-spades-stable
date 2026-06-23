import { inArray } from "drizzle-orm";
import {
  v11AccountRecoveryCodesTable,
  v11AccountsTable,
  v11UsernamesTable,
  type V11AccountRecoveryCodeRow,
  type V11AccountRow,
  type V11UsernameRow,
} from "@workspace/db/schema/v11-accounts";
import { hashRecoveryEmail, normalizeRecoveryEmail } from "./v11-account-recovery.js";

export type V11TestAccountResetDb = {
  select: (...args: unknown[]) => any;
  delete: (...args: unknown[]) => any;
};

export type V11TestAccountResetInput = {
  accountId?: unknown;
  displayName?: unknown;
  email?: unknown;
  keepAccountId?: unknown;
};

export type V11TestAccountResetResult = {
  ok: true;
  matchedAccountIds: string[];
  keptAccountId: string | null;
  deletedAccountIds: string[];
  deletedAccounts: number;
  deletedUsernames: number;
  deletedRecoveryCodes: number;
};

export type V11TestAccountResetErrorCode =
  | "invalid_target"
  | "missing_secret"
  | "not_allowed";

type V11TestAccountResetRuntimeEnv = Partial<
  Pick<NodeJS.ProcessEnv, "APP_ENV" | "NODE_ENV" | "RENDER_SERVICE_NAME">
>;

export class V11TestAccountResetError extends Error {
  readonly code: V11TestAccountResetErrorCode;

  constructor(code: V11TestAccountResetErrorCode, message: string) {
    super(message);
    this.name = "V11TestAccountResetError";
    this.code = code;
  }
}

export function isV11TestAccountResetRuntimeAllowed(
  env: V11TestAccountResetRuntimeEnv = process.env,
): boolean {
  const runtimeLabel = [
    env.APP_ENV ?? "",
    env.RENDER_SERVICE_NAME ?? "",
  ].join(" ");
  if (/staging|preview|dev|local/i.test(runtimeLabel)) return true;
  return env.NODE_ENV !== "production";
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function ids(rows: Array<{ id?: string }>): string[] {
  return rows.map((row) => row.id).filter((id): id is string => Boolean(id));
}

async function deleteByValues<T>(
  db: V11TestAccountResetDb,
  table: unknown,
  column: unknown,
  values: string[],
): Promise<T[]> {
  if (values.length === 0) return [];
  return (await db.delete(table).where(inArray(column as never, values)).returning()) as T[];
}

export async function resetV11TestAccounts(
  db: V11TestAccountResetDb,
  input: V11TestAccountResetInput,
  options: {
    recoverySecret?: string | null;
    env?: V11TestAccountResetRuntimeEnv;
  } = {},
): Promise<V11TestAccountResetResult> {
  if (!isV11TestAccountResetRuntimeAllowed(options.env)) {
    throw new V11TestAccountResetError(
      "not_allowed",
      "v1.1 test account reset is only available in staging/dev.",
    );
  }

  const targetAccountId = normalizeOptionalText(input.accountId);
  const targetDisplayName = normalizeOptionalText(input.displayName);
  const targetEmail = normalizeOptionalText(input.email);
  const keepAccountId = normalizeOptionalText(input.keepAccountId);

  if (!targetAccountId && !targetDisplayName && !targetEmail) {
    throw new V11TestAccountResetError(
      "invalid_target",
      "Provide accountId, displayName, or email.",
    );
  }

  const targetEmailHash = targetEmail
    ? (() => {
        if (!options.recoverySecret) {
          throw new V11TestAccountResetError(
            "missing_secret",
            "Recovery secret is required for email-based reset.",
          );
        }
        return hashRecoveryEmail(
          normalizeRecoveryEmail(targetEmail),
          options.recoverySecret,
        );
      })()
    : null;
  const targetDisplayKey = targetDisplayName
    ? normalizeDisplayName(targetDisplayName)
    : null;

  const accounts = (await db.select().from(v11AccountsTable)) as V11AccountRow[];
  const matchedAccounts = accounts.filter((account) => {
    return (
      (targetAccountId && account.id === targetAccountId) ||
      (targetDisplayKey && normalizeDisplayName(account.displayName) === targetDisplayKey) ||
      (targetEmailHash && account.emailHash === targetEmailHash)
    );
  });
  const accountsToDelete = matchedAccounts.filter(
    (account) => !keepAccountId || account.id !== keepAccountId,
  );
  const deleteAccountIds = ids(accountsToDelete);

  const deletedRecoveryCodeRows: V11AccountRecoveryCodeRow[] = [];
  if (deleteAccountIds.length > 0) {
    deletedRecoveryCodeRows.push(
      ...(await deleteByValues<V11AccountRecoveryCodeRow>(
        db,
        v11AccountRecoveryCodesTable,
        v11AccountRecoveryCodesTable.accountId,
        deleteAccountIds,
      )),
    );
  }

  const keeper = keepAccountId
    ? accounts.find((account) => account.id === keepAccountId) ?? null
    : null;
  const shouldDeleteEmailOnlyCodes =
    Boolean(targetEmailHash) &&
    (!keeper || keeper.emailHash !== targetEmailHash);
  if (targetEmailHash && shouldDeleteEmailOnlyCodes) {
    const deletedByEmail = await deleteByValues<V11AccountRecoveryCodeRow>(
      db,
      v11AccountRecoveryCodesTable,
      v11AccountRecoveryCodesTable.emailHash,
      [targetEmailHash],
    );
    const alreadyDeleted = new Set(deletedRecoveryCodeRows.map((row) => row.id));
    for (const row of deletedByEmail) {
      if (!alreadyDeleted.has(row.id)) deletedRecoveryCodeRows.push(row);
    }
  }

  const deletedUsernameRows = await deleteByValues<V11UsernameRow>(
    db,
    v11UsernamesTable,
    v11UsernamesTable.accountId,
    deleteAccountIds,
  );
  const deletedAccountRows = await deleteByValues<V11AccountRow>(
    db,
    v11AccountsTable,
    v11AccountsTable.id,
    deleteAccountIds,
  );

  return {
    ok: true,
    matchedAccountIds: matchedAccounts.map((account) => account.id),
    keptAccountId: keepAccountId ?? null,
    deletedAccountIds: deleteAccountIds,
    deletedAccounts: deletedAccountRows.length,
    deletedUsernames: deletedUsernameRows.length,
    deletedRecoveryCodes: deletedRecoveryCodeRows.length,
  };
}
