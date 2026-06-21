export function isV11WebFlagEnabled(value: unknown): boolean {
  return value === "1" || value === "true" || value === "yes";
}

export const v11WebFlags = {
  accounts: isV11WebFlagEnabled(import.meta.env.VITE_V11_ACCOUNTS_ENABLED),
  usernames: isV11WebFlagEnabled(import.meta.env.VITE_V11_USERNAMES_ENABLED),
  leaderboards: isV11WebFlagEnabled(import.meta.env.VITE_V11_LEADERBOARDS_ENABLED),
  matchmaking: isV11WebFlagEnabled(import.meta.env.VITE_V11_MATCHMAKING_ENABLED),
  tournaments: isV11WebFlagEnabled(import.meta.env.VITE_V11_TOURNAMENTS_ENABLED),
  accountRecovery: isV11WebFlagEnabled(import.meta.env.VITE_V12_ACCOUNT_RECOVERY_ENABLED),
} as const;
