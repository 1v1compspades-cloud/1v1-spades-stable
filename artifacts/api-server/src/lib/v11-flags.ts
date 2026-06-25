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
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "0" || normalized === "false" || normalized === "no") return false;
    return normalized === "1" || normalized === "true" || normalized === "yes";
  }

  return (
    env.NODE_ENV === "production" &&
    name !== "V11_TOURNAMENTS_ENABLED"
  );
}
