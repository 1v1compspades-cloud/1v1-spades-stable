const defaultFeedbackState = {
  reports: []
};

export function buildDiagnosticsBundle({
  status,
  transportMode = "direct",
  serverStatus = "unknown",
  webSocketStatus = "unknown",
  playerId = "unknown",
  displayName = "Player",
  lastAction = "none",
  lastError = "",
  hiddenHandSafe = false,
  fixturePreset = "none",
  actionLogEntries = [],
  timestamp = new Date().toISOString()
} = {}) {
  return {
    timestamp,
    roomCode: status?.roomCode ?? "none",
    phase: status?.phase ?? "none",
    transport: transportMode,
    seat: status?.viewerSeat ?? "none",
    alreadySeated: status?.alreadySeated === true,
    currentTurn: status?.currentTurn ?? "none",
    playerId,
    displayName,
    serverStatus,
    webSocketStatus,
    lastAction,
    lastError: lastError || "none",
    hiddenHandSafe: hiddenHandSafe === true,
    visibleHandCount: Array.isArray(status?.hand) ? status.hand.length : 0,
    currentTrickCount: status?.currentTrick?.length ?? 0,
    lastTrickWinner: status?.lastTrick?.winner ?? "none",
    score: publicSeatMap(status?.score),
    bids: publicSeatMap(status?.bids),
    bags: publicSeatMap(status?.bags),
    fixturePreset,
    recentActions: actionLogEntries.slice(0, 5).map(publicActionEntry)
  };
}

export function formatDiagnosticsSummary(bundle) {
  const lines = [
    "Send this to dev:",
    `Timestamp: ${bundle.timestamp}`,
    `Room code: ${bundle.roomCode}`,
    `Phase: ${bundle.phase}`,
    `Transport: ${bundle.transport}`,
    `Seat: ${bundle.seat}`,
    `Already seated: ${bundle.alreadySeated ? "yes" : "no"}`,
    `Current turn: ${bundle.currentTurn}`,
    `Player id: ${bundle.playerId}`,
    `Display name: ${bundle.displayName}`,
    `Server status: ${bundle.serverStatus}`,
    `WebSocket status: ${bundle.webSocketStatus}`,
    `Last action: ${bundle.lastAction}`,
    `Last error: ${bundle.lastError}`,
    `Hidden-hand safe: ${bundle.hiddenHandSafe ? "yes" : "no"}`,
    `Visible hand count: ${bundle.visibleHandCount}`,
    `Current trick cards: ${bundle.currentTrickCount}`,
    `Last trick winner: ${bundle.lastTrickWinner}`,
    `Score: ${formatSeatMap(bundle.score)}`,
    `Bids: ${formatSeatMap(bundle.bids)}`,
    `Bags: ${formatSeatMap(bundle.bags)}`,
    `Fixture preset: ${bundle.fixturePreset}`,
    `Recent actions: ${bundle.recentActions.length ? bundle.recentActions.join(" || ") : "none"}`
  ];
  return lines.join("\n");
}

export function createBetaIssueReport({
  title = "",
  steps = "",
  expected = "",
  actual = "",
  diagnostics,
  timestamp = new Date().toISOString()
} = {}) {
  return {
    id: `beta-report-${timestamp}`,
    timestamp,
    title: title.trim() || "Untitled beta issue",
    steps: steps.trim(),
    expected: expected.trim(),
    actual: actual.trim(),
    diagnostics
  };
}

export function formatIssueReport(report) {
  return [
    `Issue: ${report.title}`,
    `Reported: ${report.timestamp}`,
    "",
    "Steps:",
    report.steps || "Not provided",
    "",
    "Expected:",
    report.expected || "Not provided",
    "",
    "Actual:",
    report.actual || "Not provided",
    "",
    formatDiagnosticsSummary(report.diagnostics)
  ].join("\n");
}

export function createLocalBetaFeedbackStore({
  storage = defaultStorage(),
  namespace = "spades-beta-feedback"
} = {}) {
  let memoryState = defaultFeedbackState;

  return {
    record(report) {
      const state = loadState();
      const next = {
        reports: [report, ...state.reports]
      };
      saveState(next);
      return report;
    },

    list() {
      return loadState().reports.map(cloneReport);
    },

    exportText() {
      const reports = this.list();
      return reports.length
        ? reports.map(formatIssueReport).join("\n\n---\n\n")
        : "No local beta reports saved.";
    },

    clear() {
      saveState(defaultFeedbackState);
      return this.list();
    }
  };

  function loadState() {
    if (!storage) return memoryState;
    try {
      const parsed = JSON.parse(storage.getItem(namespace) ?? "null");
      if (!parsed || !Array.isArray(parsed.reports)) return defaultFeedbackState;
      return {
        reports: parsed.reports.map(cloneReport)
      };
    } catch {
      return defaultFeedbackState;
    }
  }

  function saveState(state) {
    memoryState = {
      reports: state.reports.map(cloneReport)
    };
    if (storage) {
      storage.setItem(namespace, JSON.stringify(memoryState));
    }
  }
}

function publicSeatMap(value) {
  return {
    player1: value?.player1 ?? 0,
    player2: value?.player2 ?? 0
  };
}

function formatSeatMap(value) {
  return `player1 ${value.player1}, player2 ${value.player2}`;
}

function publicActionEntry(entry) {
  const summary = entry.summary ?? {};
  return [
    entry.outcome?.toUpperCase?.() ?? "UNKNOWN",
    entry.action ?? "action",
    `phase ${summary.phase ?? "none"}`,
    `viewer ${summary.viewerSeat ?? "none"}`,
    `turn ${summary.currentTurn ?? "none"}`,
    entry.message ? `message ${entry.message}` : null
  ].filter(Boolean).join(" | ");
}

function cloneReport(report) {
  return JSON.parse(JSON.stringify(report));
}

function defaultStorage() {
  return typeof localStorage === "undefined" ? null : localStorage;
}
