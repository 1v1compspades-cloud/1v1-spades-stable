export type V11AccountIdentity = {
  accountId: string;
  accountUsername: string;
};

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
