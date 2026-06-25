export type V11LeaderboardEntry = {
  rank: number;
  username: string;
  wins: number;
  losses: number;
  gamesPlayed: number;
  pointsFor?: number;
  pointsAgainst?: number;
  winRate: number;
  currentStreak: number;
  bagsTaken?: number;
  bagsGiven?: number;
};

export type V11LeaderboardResponse = {
  ok?: boolean;
  seasonKey?: string;
  entries?: V11LeaderboardEntry[];
};

export type V11LeaderboardPanelState =
  | { kind: "hidden" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "empty"; seasonKey: string }
  | { kind: "entries"; seasonKey: string; entries: V11LeaderboardEntry[] };

export function leaderboardEndpoint(limit = 10): string {
  return `/api/v1.1/leaderboards?limit=${limit}`;
}

export function formatWinRate(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  return `${Math.round(value * 100)}%`;
}

export function formatStreak(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0";
  return value > 0 ? `+${value}` : `${value}`;
}

export function formatBags(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0";
  return `${Math.max(0, Math.floor(value))}`;
}

export function formatScoreTotal(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0";
  return `${Math.trunc(value)}`;
}

export function formatSeasonLabel(seasonKey: string): string {
  if (seasonKey === "v1_1_beta") return "Season 0 Beta";
  return seasonKey;
}

export function computeLeaderboardPanelState(input: {
  enabled: boolean;
  loading: boolean;
  error: string | null;
  data: V11LeaderboardResponse | null;
}): V11LeaderboardPanelState {
  if (!input.enabled) return { kind: "hidden" };
  if (input.loading) return { kind: "loading" };
  if (input.error) return { kind: "error", message: input.error };

  const seasonKey = input.data?.seasonKey || "v1_1_beta";
  const entries = Array.isArray(input.data?.entries) ? input.data.entries : [];
  if (entries.length === 0) return { kind: "empty", seasonKey };

  return { kind: "entries", seasonKey, entries };
}
