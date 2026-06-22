export type V11FlagName =
  | "V11_ACCOUNTS_ENABLED"
  | "V11_USERNAMES_ENABLED"
  | "V11_LEADERBOARDS_ENABLED"
  | "V11_MATCHMAKING_ENABLED"
  | "V11_TOURNAMENTS_ENABLED"
  | "V11_ACCOUNT_RECOVERY_ENABLED";

export function isV11FlagEnabled(
  name: V11FlagName,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const value = env[name];
  return value === "1" || value === "true" || value === "yes";
}
