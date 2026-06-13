const DEFAULT_LIMIT = 14;

export function createLocalActionLog({ limit = DEFAULT_LIMIT, now = () => new Date() } = {}) {
  const entries = [];

  return {
    record(action, status, options = {}) {
      const nextEntries = buildActionLogEntries(action, status, {
        ...options,
        timestamp: options.timestamp ?? now().toISOString()
      });
      entries.unshift(...nextEntries);
      entries.length = Math.min(entries.length, limit);
      return this.list();
    },

    list() {
      return entries.map((entry) => ({ ...entry, summary: { ...entry.summary } }));
    }
  };
}

export function buildActionLogEntries(action, status, {
  outcome = "success",
  message = "",
  timestamp = new Date().toISOString()
} = {}) {
  const primary = createActionEntry(action, status, { outcome, message, timestamp });
  const derived = outcome === "success"
    ? derivePublicActionEvents(status, timestamp)
    : [];

  return [primary, ...derived];
}

export function derivePublicActionEvents(status, timestamp = new Date().toISOString()) {
  if (!status) return [];

  const events = [];
  if (status.lastTrick?.winner) {
    events.push(createActionEntry("trick won", status, {
      outcome: "success",
      message: `${status.lastTrick.winner} won the last trick`,
      timestamp
    }));
  }
  if (status.phase === "hand_complete") {
    events.push(createActionEntry("hand complete", status, {
      outcome: "success",
      message: "Hand scoring is ready",
      timestamp
    }));
  }
  if (status.phase === "match_complete") {
    events.push(createActionEntry("match complete", status, {
      outcome: "success",
      message: `Winner ${status.matchWinner ?? "unknown"}`,
      timestamp
    }));
  }

  return events;
}

export function createActionEntry(action, status, {
  outcome = "success",
  message = "",
  timestamp = new Date().toISOString()
} = {}) {
  return {
    action,
    outcome,
    message,
    timestamp,
    summary: publicStatusSummary(status)
  };
}

export function publicStatusSummary(status) {
  if (!status) {
    return {
      phase: "none",
      viewerSeat: "none",
      currentTurn: "none",
      score: "none",
      bags: "none",
      bidStatus: "none",
      lastTrickWinner: "none"
    };
  }

  return {
    phase: status.phase ?? "none",
    viewerSeat: status.viewerSeat ?? "none",
    currentTurn: status.currentTurn ?? "none",
    score: formatScore(status.score),
    bags: formatScore(status.bags),
    bidStatus: formatBids(status.bids),
    lastTrickWinner: status.lastTrick?.winner ?? "none"
  };
}

function formatScore(value = {}) {
  return `P1 ${value.player1 ?? 0} / P2 ${value.player2 ?? 0}`;
}

function formatBids(bids = {}) {
  return `P1 ${bids.player1 ?? "none"} / P2 ${bids.player2 ?? "none"}`;
}
