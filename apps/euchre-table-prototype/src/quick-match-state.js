const QUICK_MATCH_EXPIRY_MS = 5 * 60 * 1000;

export function enterQuickMatchQueue(quickMatchQueue, {
  playerId,
  accountId,
  displayName,
  matchSettings,
  createMatchRoom,
  now = Date.now()
} = {}) {
  const normalizedPlayerId = normalizeId(playerId);
  const normalizedAccountId = normalizeId(accountId);
  const name = normalizeDisplayName(displayName);
  const settings = normalizeMatchSettings(matchSettings);

  if (!normalizedPlayerId) {
    throw queueError(400, "Player identity is required for Quick Match");
  }

  expireWaitingEntries(quickMatchQueue, now);

  const existingEntry = findActiveEntryForPlayer(quickMatchQueue, {
    playerId: normalizedPlayerId,
    accountId: normalizedAccountId
  });

  if (existingEntry) {
    return {
      entry: sanitizeQueueEntry(existingEntry),
      matched: existingEntry.status === "matched"
    };
  }

  const compatibleEntry = findCompatibleEntry(quickMatchQueue, {
    playerId: normalizedPlayerId,
    accountId: normalizedAccountId,
    matchSettings: settings
  });

  const entry = {
    queueId: generateQueueId(),
    playerId: normalizedPlayerId,
    accountId: normalizedAccountId,
    displayName: name,
    matchSettings: settings,
    createdAt: new Date(now).toISOString(),
    status: "waiting",
    matchedRoomCode: null
  };

  quickMatchQueue.set(entry.queueId, entry);

  if (!compatibleEntry) {
    return {
      entry: sanitizeQueueEntry(entry),
      matched: false
    };
  }

  const room = createMatchRoom({
    player1: compatibleEntry,
    player2: entry,
    matchSettings: settings
  });
  const matchedAt = new Date(now).toISOString();
  const matchedRoomCode = room.roomCode;
  compatibleEntry.status = "matched";
  compatibleEntry.matchedRoomCode = matchedRoomCode;
  compatibleEntry.matchedAt = matchedAt;
  entry.status = "matched";
  entry.matchedRoomCode = matchedRoomCode;
  entry.matchedAt = matchedAt;

  return {
    entry: sanitizeQueueEntry(entry),
    matchedEntry: sanitizeQueueEntry(compatibleEntry),
    matched: true,
    room
  };
}

export function cancelQuickMatchQueue(quickMatchQueue, { playerId, accountId, queueId, now = Date.now() } = {}) {
  expireWaitingEntries(quickMatchQueue, now);

  const entry = queueId
    ? quickMatchQueue.get(queueId)
    : findActiveEntryForPlayer(quickMatchQueue, { playerId, accountId });

  if (!entry) {
    throw queueError(404, "Quick Match queue entry not found");
  }

  if (!identityMatches(entry, { playerId, accountId })) {
    throw queueError(403, "Quick Match queue entry belongs to another player");
  }

  if (entry.status === "waiting") {
    entry.status = "cancelled";
    entry.cancelledAt = new Date(now).toISOString();
  }

  return sanitizeQueueEntry(entry);
}

export function sanitizeQueueEntry(entry) {
  if (!entry) return null;

  return {
    queueId: entry.queueId,
    playerId: entry.playerId,
    accountId: entry.accountId,
    displayName: entry.displayName,
    matchSettings: {
      ...entry.matchSettings
    },
    createdAt: entry.createdAt,
    status: entry.status,
    matchedRoomCode: entry.matchedRoomCode ?? null
  };
}

function expireWaitingEntries(quickMatchQueue, now) {
  for (const entry of quickMatchQueue.values()) {
    if (entry.status !== "waiting") continue;
    if (now - Date.parse(entry.createdAt) >= QUICK_MATCH_EXPIRY_MS) {
      entry.status = "expired";
      entry.expiredAt = new Date(now).toISOString();
    }
  }
}

function findActiveEntryForPlayer(quickMatchQueue, identity) {
  return [...quickMatchQueue.values()].find((entry) => {
    if (!["waiting", "matched"].includes(entry.status)) return false;
    return identityMatches(entry, identity);
  }) ?? null;
}

function findCompatibleEntry(quickMatchQueue, challenger) {
  return [...quickMatchQueue.values()]
    .filter((entry) => entry.status === "waiting")
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .find((entry) => compatibleEntries(entry, challenger)) ?? null;
}

function compatibleEntries(entry, challenger) {
  if (entry.playerId === normalizeId(challenger.playerId)) return false;
  const challengerAccountId = normalizeId(challenger.accountId);
  if (entry.accountId && challengerAccountId && entry.accountId === challengerAccountId) return false;
  return sameMatchSettings(entry.matchSettings, challenger.matchSettings);
}

function identityMatches(entry, { playerId, accountId } = {}) {
  const normalizedPlayerId = normalizeId(playerId);
  const normalizedAccountId = normalizeId(accountId);
  return Boolean(normalizedPlayerId && entry.playerId === normalizedPlayerId)
    || Boolean(normalizedAccountId && entry.accountId && entry.accountId === normalizedAccountId);
}

function sameMatchSettings(left, right) {
  return left.raceTo === right.raceTo
    && left.modeId === right.modeId
    && Boolean(left.stickTheDealer) === Boolean(right.stickTheDealer);
}

function normalizeMatchSettings(settings = {}) {
  return {
    modeId: settings.modeId ?? "communityCompetitive",
    raceTo: [5, 10].includes(Number(settings.raceTo)) ? Number(settings.raceTo) : 10,
    stickTheDealer: settings.stickTheDealer ?? true
  };
}

function normalizeDisplayName(displayName) {
  const name = String(displayName ?? "").trim();
  if (!name) {
    throw queueError(400, "Enter your name to continue.");
  }
  return name.slice(0, 32);
}

function normalizeId(value) {
  const id = String(value ?? "").trim();
  return id ? id.slice(0, 120) : null;
}

function generateQueueId() {
  return `qm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function queueError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
