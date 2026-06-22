export function isV11WebFlagEnabled(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export const v11WebFlags = {
  accounts: isV11WebFlagEnabled(import.meta.env.VITE_V11_ACCOUNTS_ENABLED),
  usernames: isV11WebFlagEnabled(import.meta.env.VITE_V11_USERNAMES_ENABLED),
  leaderboards: isV11WebFlagEnabled(import.meta.env.VITE_V11_LEADERBOARDS_ENABLED),
  matchmaking: isV11WebFlagEnabled(import.meta.env.VITE_V11_MATCHMAKING_ENABLED),
  tournaments: isV11WebFlagEnabled(import.meta.env.VITE_V11_TOURNAMENTS_ENABLED),
  accountRecovery: isV11WebFlagEnabled(import.meta.env.VITE_V11_ACCOUNT_RECOVERY_ENABLED),
} as const;
