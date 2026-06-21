const DEFAULT_GUEST_PREFIX = "Guest";

const normalizeDisplayName = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, 32);
};

export const createTemporaryGuestName = (seed: number = Math.random()): string => {
  const normalizedSeed = Number.isFinite(seed) ? Math.abs(seed) : Math.random();
  const suffix = Math.max(1000, Math.floor((normalizedSeed % 1) * 9000) + 1000);
  return `${DEFAULT_GUEST_PREFIX} ${suffix}`;
};

export const resolveCasualGuestName = (
  preferredName: unknown,
  savedName?: unknown,
  seed?: number,
): string => {
  const preferred = normalizeDisplayName(preferredName);
  if (preferred) return preferred;
  const saved = normalizeDisplayName(savedName);
  if (saved) return saved;
  return createTemporaryGuestName(seed);
};

export const resolveRankedDisplayName = (
  preferredName: unknown,
  accountUsername: unknown,
): string | null => {
  const preferred = normalizeDisplayName(preferredName);
  if (preferred) return preferred;
  const username = normalizeDisplayName(accountUsername);
  return username || null;
};
