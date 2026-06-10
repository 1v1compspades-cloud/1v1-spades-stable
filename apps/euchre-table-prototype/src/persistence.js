import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const PERSISTENCE_VERSION = 1;

export function defaultPersistenceFile(appDir) {
  return process.env.EUCHRE_STATE_FILE || join(appDir, ".data", "euchre-state.json");
}

export function loadPersistedState(filePath) {
  if (!filePath || !existsSync(filePath)) {
    return emptyState();
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return {
      rooms: mapFromRecord(parsed.rooms),
      tournaments: mapFromRecord(parsed.tournaments),
      accounts: mapFromRecord(parsed.accounts),
      leaderboardStats: mapFromRecord(parsed.leaderboardStats)
    };
  } catch (error) {
    console.warn(`Could not load persisted Euchre state: ${error.message}`);
    return emptyState();
  }
}

export function savePersistedState(filePath, { rooms, tournaments, accounts, leaderboardStats }) {
  if (!filePath) return;

  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  const payload = {
    version: PERSISTENCE_VERSION,
    savedAt: new Date().toISOString(),
    rooms: Object.fromEntries(rooms),
    tournaments: Object.fromEntries(tournaments),
    accounts: Object.fromEntries(accounts ?? new Map()),
    leaderboardStats: Object.fromEntries(leaderboardStats ?? new Map())
  };

  writeFileSync(tempPath, JSON.stringify(payload, null, 2));
  renameSync(tempPath, filePath);
}

function emptyState() {
  return {
    rooms: new Map(),
    tournaments: new Map(),
    accounts: new Map(),
    leaderboardStats: new Map()
  };
}

function mapFromRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return new Map();
  }

  return new Map(Object.entries(value));
}
