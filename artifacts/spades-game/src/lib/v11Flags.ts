const productionDefaultV11WebFlags = import.meta.env.PROD;

export function isV11WebFlagEnabled(value: unknown, defaultEnabled = false): boolean {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value !== "string") return defaultEnabled;
  const normalized = value.trim().toLowerCase();
  if (normalized === "0" || normalized === "false" || normalized === "no") return false;
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export const v11WebFlags = {
  accounts: isV11WebFlagEnabled(import.meta.env.VITE_V11_ACCOUNTS_ENABLED, productionDefaultV11WebFlags),
  usernames: isV11WebFlagEnabled(import.meta.env.VITE_V11_USERNAMES_ENABLED, productionDefaultV11WebFlags),
  leaderboards: isV11WebFlagEnabled(import.meta.env.VITE_V11_LEADERBOARDS_ENABLED, productionDefaultV11WebFlags),
  matchmaking: isV11WebFlagEnabled(import.meta.env.VITE_V11_MATCHMAKING_ENABLED, productionDefaultV11WebFlags),
  tournaments: isV11WebFlagEnabled(import.meta.env.VITE_V11_TOURNAMENTS_ENABLED),
  accountRecovery: isV11WebFlagEnabled(import.meta.env.VITE_V11_ACCOUNT_RECOVERY_ENABLED, productionDefaultV11WebFlags),
} as const;
