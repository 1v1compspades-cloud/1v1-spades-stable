import { createSpadesAppController } from "./app-controller.js";
import { createLocalActionLog } from "./action-log.js";
import { createLocalAccountStatsStore } from "./local-account-stats.js";
import { createSpadesLiveSyncClient } from "./live-sync-client.js";
import { createLocalPlayerIdentityStore } from "./local-identity.js";
import { createLocalTournamentHistoryStore } from "./local-tournament-history.js";
import {
  buildBetaSafetyChecklist,
  friendlyTesterError,
  hiddenHandSafe,
  listManualBetaFlows
} from "./beta-readiness.js";
import {
  buildDiagnosticsBundle,
  createBetaIssueReport,
  createLocalBetaFeedbackStore,
  formatDiagnosticsSummary
} from "./beta-feedback.js";
import {
  createTwoSeatManualHarness,
  listManualFixturePresets
} from "./manual-harness.js";
import { createMockSpadesSocketTransport } from "./mock-socket-transport.js";
import { renderRoomShellText } from "./room-shell.js";
import { createSpadesServerClient } from "./server-client.js";
import {
  buildVisualQaReport,
  buildVisualShellModel
} from "./visual-shell.js";
import {
  listVisualQaScripts,
  runVisualQaScript
} from "./visual-qa-scripts.js";

const identityStore = createLocalPlayerIdentityStore();
let localIdentity = identityStore.load();
const controller = createSpadesAppController({
  createPlayerId: () => identityStore.load().playerId
});
const liveSyncServer = createMockSpadesSocketTransport();
const liveSyncClient = createSpadesLiveSyncClient({
  socketServer: liveSyncServer,
  clientId: "shell-live-sync-client",
  playerId: localIdentity.playerId,
  seatToken: localIdentity.seatToken
});
const realServerClient = createSpadesServerClient({
  playerId: localIdentity.playerId,
  seatToken: localIdentity.seatToken
});

const displayNameInput = document.querySelector("#display-name");
const joinCodeInput = document.querySelector("#join-code");
const transportModeSelect = document.querySelector("#transport-mode");
const transportModeStatusOutput = document.querySelector("#transport-mode-status");
const connectionStatusOutput = document.querySelector("#connection-status");
const reconnectHelpOutput = document.querySelector("#reconnect-help");
const afkDisconnectWarningOutput = document.querySelector("#afk-disconnect-warning");
const roomCodeShareStatusOutput = document.querySelector("#room-code-share-status");
const quickMatchStatusOutput = document.querySelector("#quick-match-status");
const phaseStatusOutput = document.querySelector("#phase-status");
const seatStatusOutput = document.querySelector("#seat-status");
const turnStatusOutput = document.querySelector("#turn-status");
const actionStatusOutput = document.querySelector("#action-status");
const visualPhaseOutput = document.querySelector("#visual-phase");
const visualSeatOutput = document.querySelector("#visual-seat");
const visualActionOutput = document.querySelector("#visual-action");
const visualScoreSummaryOutput = document.querySelector("#visual-score-summary");
const visualBidBagSummaryOutput = document.querySelector("#visual-bid-bag-summary");
const visualHandOutput = document.querySelector("#visual-hand");
const visualCurrentTrickOutput = document.querySelector("#visual-current-trick");
const visualLastTrickOutput = document.querySelector("#visual-last-trick");
const tableOpponentAreaOutput = document.querySelector("#table-opponent-area");
const tableScoreAreaOutput = document.querySelector("#table-score-area");
const tableCenterTrickAreaOutput = document.querySelector("#table-center-trick-area");
const tableLastTrickAreaOutput = document.querySelector("#table-last-trick-area");
const tablePlayerHandAreaOutput = document.querySelector("#table-player-hand-area");
const qaCheckListOutput = document.querySelector("#qa-check-list");
const qaEdgeListOutput = document.querySelector("#qa-edge-list");
const betaSafetyCheckListOutput = document.querySelector("#beta-safety-check-list");
const manualBetaFlowListOutput = document.querySelector("#manual-beta-flow-list");
const betaIssueTitleInput = document.querySelector("#beta-issue-title");
const betaIssueStepsInput = document.querySelector("#beta-issue-steps");
const betaIssueExpectedInput = document.querySelector("#beta-issue-expected");
const betaIssueActualInput = document.querySelector("#beta-issue-actual");
const betaDiagnosticsOutput = document.querySelector("#beta-diagnostics-bundle");
const betaFeedbackStatusOutput = document.querySelector("#beta-feedback-status");
const betaReportHistoryOutput = document.querySelector("#beta-report-history");
const betaFeedbackPanel = document.querySelector(".beta-feedback-panel");
const actionLogListOutput = document.querySelector("#action-log-list");
const manualVisualRoomOutput = document.querySelector("#manual-visual-room");
const manualVisualPhaseOutput = document.querySelector("#manual-visual-phase");
const manualVisualSeatOutput = document.querySelector("#manual-visual-seat");
const manualVisualActionOutput = document.querySelector("#manual-visual-action");
const manualVisualTurnOutput = document.querySelector("#manual-visual-turn");
const manualVisualBidOutput = document.querySelector("#manual-visual-bid");
const manualVisualPlayableOutput = document.querySelector("#manual-visual-playable");
const manualVisualScoreSummaryOutput = document.querySelector("#manual-visual-score-summary");
const manualVisualBidBagSummaryOutput = document.querySelector("#manual-visual-bid-bag-summary");
const manualVisualHandOutput = document.querySelector("#manual-visual-hand");
const manualVisualCurrentTrickOutput = document.querySelector("#manual-visual-current-trick");
const manualVisualLastTrickOutput = document.querySelector("#manual-visual-last-trick");
const manualQaCheckListOutput = document.querySelector("#manual-qa-check-list");
const manualQaEdgeListOutput = document.querySelector("#manual-qa-edge-list");
const twoSeatVisualCompareOutput = document.querySelector("#two-seat-visual-compare");
const statusOutput = document.querySelector("#room-status");
const bidStatusOutput = document.querySelector("#bid-status");
const handStatusOutput = document.querySelector("#hand-status");
const playableStatusOutput = document.querySelector("#playable-status");
const trickStatusOutput = document.querySelector("#trick-status");
const handSummaryOutput = document.querySelector("#hand-summary");
const matchHistoryOutput = document.querySelector("#match-history");
const localPlayerStatsOutput = document.querySelector("#local-player-stats");
const leaderboardPreviewOutput = document.querySelector("#leaderboard-preview");
const accountMatchResultsOutput = document.querySelector("#account-match-results");
const tournamentSummaryOutput = document.querySelector("#tournament-summary");
const tournamentPlacementsOutput = document.querySelector("#tournament-placements");
const tournamentHistoryOutput = document.querySelector("#tournament-history");
const errorOutput = document.querySelector("#shell-error");
const bidInput = document.querySelector("#bid-input");
const playCardIdInput = document.querySelector("#play-card-id");
const manualStatusOutput = document.querySelector("#manual-status");
const manualViewSelect = document.querySelector("#manual-view");
const fixturePresetSelect = document.querySelector("#fixture-preset");
const visualQaScriptSelect = document.querySelector("#visual-qa-script");
const visualQaStatusOutput = document.querySelector("#visual-qa-status");
let manualHarness = createTwoSeatManualHarness();
let lastSuccessfulAction = "none";
let activeFixturePreset = "none";
let transportMode = "direct";
const actionLog = createLocalActionLog();
const accountStats = createLocalAccountStatsStore();
const tournamentHistory = createLocalTournamentHistoryStore();
const betaFeedback = createLocalBetaFeedbackStore();
const launchParams = readLaunchParams();
const testerMode = shouldUseTesterMode(launchParams);
displayNameInput.value = localIdentity.displayName;
applyLaunchMode();
renderManualBetaFlows();

for (const presetName of listManualFixturePresets().filter((name) => !name.startsWith("reconnect-"))) {
  const option = document.createElement("option");
  option.value = presetName;
  option.textContent = presetName;
  fixturePresetSelect.append(option);
}

for (const scriptName of listVisualQaScripts()) {
  const option = document.createElement("option");
  option.value = scriptName;
  option.textContent = scriptName;
  visualQaScriptSelect.append(option);
}

document.querySelector("#create-room").addEventListener("click", () => {
  runShellAction(() => {
    saveCurrentDisplayName();
    return activeShellActions().createRoom({
      displayName: localIdentity.displayName,
      seatToken: localIdentity.seatToken
    });
  }, "create room");
});

document.querySelector("#join-room").addEventListener("click", () => {
  runShellAction(() => {
    saveCurrentDisplayName();
    return activeShellActions().joinRoom({
      roomCode: joinCodeInput.value,
      displayName: localIdentity.displayName,
      seatToken: localIdentity.seatToken
    });
  }, "join room");
});

document.querySelector("#restore-room").addEventListener("click", () => {
  runShellAction(() => activeShellActions().restoreRoom(), "restore active room");
});

document.querySelector("#reconnect-live-sync").addEventListener("click", () => {
  runShellAction(() => reconnectLiveSyncSnapshot(), "reconnect live sync snapshot");
});

document.querySelector("#copy-room-code").addEventListener("click", () => {
  copyRoomCode();
});

document.querySelector("#jump-to-bug-report").addEventListener("click", () => {
  renderBetaFeedbackPanel(currentShellStatus());
  betaFeedbackPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  betaIssueTitleInput.focus();
});

document.querySelector("#join-quick-match").addEventListener("click", () => {
  runShellAction(async () => {
    if (!isRealServerMode()) {
      throw new Error("Quick Match requires real local server mode");
    }
    saveCurrentDisplayName();
    const response = await realServerClient.joinQuickMatch({
      displayName: localIdentity.displayName
    });
    if (response.session) {
      localIdentity = identityStore.saveSession(response.session);
    }
    renderQuickMatchStatus();
    return serverStatusFromResponseOrQueue(response);
  }, "join quick match");
});

document.querySelector("#leave-quick-match").addEventListener("click", () => {
  runShellAction(async () => {
    if (!isRealServerMode()) {
      throw new Error("Quick Match requires real local server mode");
    }
    const response = await realServerClient.leaveQuickMatch();
    renderQuickMatchStatus();
    return response.view ?? currentShellStatus();
  }, "leave quick match");
});

document.querySelector("#clear-room").addEventListener("click", () => {
  if (isLiveSyncMode()) {
    liveSyncClient.disconnect();
  } else if (isRealServerMode()) {
    realServerClient.disconnect();
  } else {
    controller.clearActiveRoom();
  }
  localIdentity = identityStore.clearSession();
  lastSuccessfulAction = "clear active room";
  actionLog.record("clear active room", null);
  renderStatus(null);
});

document.querySelector("#ready-player").addEventListener("click", () => {
  runShellAction(() => activeShellActions().readyPlayer(), "ready");
});

document.querySelector("#leave-room").addEventListener("click", () => {
  runShellAction(() => activeShellActions().leaveRoom(), "leave room");
});

document.querySelector("#submit-bid").addEventListener("click", () => {
  runShellAction(() => activeShellActions().submitBid({
    bid: Number(bidInput.value)
  }), "bid");
});

document.querySelector("#submit-nil").addEventListener("click", () => {
  bidInput.value = "0";
  runShellAction(() => activeShellActions().submitBid({ bid: 0 }), "bid");
});

document.querySelector("#submit-play-card").addEventListener("click", () => {
  runShellAction(() => activeShellActions().submitPlayCardById({
    cardId: playCardIdInput.value
  }), "play card");
});

document.querySelector("#play-full-hand").addEventListener("click", () => {
  runShellAction(() => controller.playFullHand().status, "play full hand");
});

document.querySelector("#start-next-hand").addEventListener("click", () => {
  runShellAction(() => activeShellActions().startNextHand(), "next hand");
});

document.querySelector("#record-match-history").addEventListener("click", () => {
  runShellAction(() => {
    recordLocalCompletedMatch();
    return controller.getActiveRoomStatus();
  }, "record match history");
});

document.querySelector("#start-new-match").addEventListener("click", () => {
  runShellAction(() => activeShellActions().startNewMatch(), "reset/new match");
});

document.querySelector("#table-leave-room").addEventListener("click", () => {
  runShellAction(() => activeShellActions().leaveRoom(), "leave room");
});

document.querySelector("#table-record-history").addEventListener("click", () => {
  runShellAction(() => {
    recordLocalCompletedMatch();
    return controller.getActiveRoomStatus();
  }, "record match history");
});

document.querySelector("#table-start-next-hand").addEventListener("click", () => {
  runShellAction(() => activeShellActions().startNextHand(), "next hand");
});

document.querySelector("#table-start-new-match").addEventListener("click", () => {
  runShellAction(() => activeShellActions().startNewMatch(), "reset/new match");
});

document.querySelector("#reset-local-stats").addEventListener("click", () => {
  accountStats.reset();
  lastSuccessfulAction = "reset local stats";
  actionLog.record("reset local stats", currentShellStatus());
  renderAccountsLitePanel();
  renderStatus(currentShellStatus());
});

document.querySelector("#record-tournament-snapshot").addEventListener("click", () => {
  runShellAction(() => {
    recordLocalTournamentSnapshot();
    return currentShellStatus();
  }, "record tournament snapshot");
});

document.querySelector("#reset-tournament-history").addEventListener("click", () => {
  tournamentHistory.reset();
  lastSuccessfulAction = "reset tournament history";
  actionLog.record("reset tournament history", currentShellStatus());
  renderTournamentHistoryPanel();
  renderStatus(currentShellStatus());
});

document.querySelector("#refresh-diagnostics").addEventListener("click", () => {
  renderBetaFeedbackPanel(currentShellStatus());
  betaFeedbackStatusOutput.textContent = "Diagnostics refreshed.";
});

document.querySelector("#copy-diagnostics").addEventListener("click", () => {
  copyDiagnosticsBundle();
});

document.querySelector("#save-beta-report").addEventListener("click", () => {
  const report = createBetaIssueReport({
    title: betaIssueTitleInput.value,
    steps: betaIssueStepsInput.value,
    expected: betaIssueExpectedInput.value,
    actual: betaIssueActualInput.value,
    diagnostics: currentDiagnosticsBundle()
  });
  betaFeedback.record(report);
  betaFeedbackStatusOutput.textContent = `Saved local beta report: ${report.title}`;
  renderBetaFeedbackHistory();
});

document.querySelector("#export-beta-reports").addEventListener("click", () => {
  betaDiagnosticsOutput.value = betaFeedback.exportText();
  betaFeedbackStatusOutput.textContent = "Saved beta reports exported into the diagnostics box.";
});

document.querySelector("#clear-beta-reports").addEventListener("click", () => {
  betaFeedback.clear();
  renderBetaFeedbackHistory();
  betaFeedbackStatusOutput.textContent = "Saved beta reports cleared locally.";
});

document.querySelector("#manual-setup").addEventListener("click", () => {
  manualHarness.setup();
  lastSuccessfulAction = "manual setup";
  renderManualStatus();
});

document.querySelector("#manual-ready").addEventListener("click", () => {
  manualHarness.readyBoth();
  lastSuccessfulAction = "manual ready";
  renderManualStatus();
});

document.querySelector("#manual-bid").addEventListener("click", () => {
  manualHarness.bidBoth();
  lastSuccessfulAction = "manual bid";
  renderManualStatus("guest");
});

document.querySelector("#manual-trick").addEventListener("click", () => {
  manualHarness.playOneTrick();
  lastSuccessfulAction = "manual trick";
  renderManualStatus();
});

document.querySelector("#manual-full-hand").addEventListener("click", () => {
  manualHarness.playFullHand();
  lastSuccessfulAction = "manual full hand";
  renderManualStatus();
});

document.querySelector("#manual-next-hand").addEventListener("click", () => {
  manualHarness.startNextHand();
  lastSuccessfulAction = "manual next hand";
  renderManualStatus();
});

document.querySelector("#run-fixture").addEventListener("click", () => {
  manualHarness = createTwoSeatManualHarness();
  activeFixturePreset = fixturePresetSelect.value;
  manualHarness.runPreset(activeFixturePreset);
  lastSuccessfulAction = `run fixture ${activeFixturePreset}`;
  renderManualStatus();
});

document.querySelector("#reset-fixture").addEventListener("click", () => {
  manualHarness = createTwoSeatManualHarness();
  activeFixturePreset = "clean-room";
  lastSuccessfulAction = "reset clean local room";
  manualHarness.setup();
  renderManualStatus();
});

document.querySelector("#run-visual-qa-script").addEventListener("click", () => {
  try {
    clearError();
    activeFixturePreset = visualQaScriptSelect.value;
    const result = runVisualQaScript(activeFixturePreset);
    manualHarness = result.harness;
    lastSuccessfulAction = `ran visual QA ${activeFixturePreset}`;
    visualQaStatusOutput.textContent = formatVisualQaResult(result);
    renderManualStatus();
  } catch (error) {
    showError(error?.message ?? "Visual QA script failed");
  }
});

manualViewSelect.addEventListener("change", () => {
  renderManualStatus();
});

transportModeSelect.addEventListener("change", () => {
  transportMode = transportModeSelect.value;
  renderStatus(currentShellStatus());
});

liveSyncClient.onStatus((update) => {
  if (isLiveSyncMode()) {
    renderStatus(update.view);
  }
});

realServerClient.onStatus((update) => {
  if (isRealServerMode()) {
    renderQuickMatchStatus();
    renderStatus(update.view);
  }
});

renderInitialStatus();

function readLaunchParams() {
  return new URLSearchParams(window.location.search);
}

function shouldUseTesterMode(params) {
  const tester = String(params.get("tester") ?? "").toLowerCase();
  return [
    "ios",
    "ios-wrapper",
    "ios-testflight",
    "testflight",
    "beta",
    "1",
    "true"
  ].includes(tester);
}

function applyLaunchMode() {
  const requestedTransport = launchParams.get("transport");
  if (["direct", "live-sync", "real-server"].includes(requestedTransport)) {
    transportMode = requestedTransport;
    transportModeSelect.value = requestedTransport;
  }

  if (testerMode) {
    document.body.classList.add("tester-mode");
    transportMode = "real-server";
    transportModeSelect.value = "real-server";
  }
}

function renderInitialStatus() {
  if (isRealServerMode()) {
    realServerClient.connect()
      .then(() => renderStatus(realServerClient.status))
      .catch((error) => {
        showError(error?.message ?? "Hosted server unavailable");
        renderStatus(realServerClient.status);
      });
    return;
  }

  renderStatus(controller.restoreActiveRoom().status);
}

async function runShellAction(action, successLabel = "completed action") {
  try {
    clearError();
    const status = await action();
    rememberSessionFromStatus(status);
    lastSuccessfulAction = successLabel;
    actionLog.record(successLabel, status);
    renderStatus(status);
  } catch (error) {
    const message = error?.message ?? "Action failed";
    const friendlyMessage = friendlyTesterError(message);
    const status = currentShellStatus();
    actionLog.record(successLabel, status, { outcome: "failure", message: friendlyMessage });
    showError(message);
    renderActionLog();
    renderQaReport(status, message, {
      checks: qaCheckListOutput,
      edges: qaEdgeListOutput
    });
    renderBetaSafetyPanel(status);
    renderBetaFeedbackPanel(status);
  }
}

function activeShellActions() {
  if (isRealServerMode()) return realServerActions();
  return isLiveSyncMode() ? liveSyncActions() : directActions();
}

function directActions() {
  return {
    createRoom(options) {
      return controller.createRoom(options).status;
    },
    joinRoom(options) {
      return controller.joinRoom(options).status;
    },
    restoreRoom() {
      return controller.restoreActiveRoom().status;
    },
    readyPlayer() {
      return controller.readyPlayer().status;
    },
    leaveRoom() {
      return controller.leaveRoom().status;
    },
    submitBid(options) {
      return controller.submitBid(options).status;
    },
    submitPlayCardById(options) {
      return controller.submitPlayCardById(options).status;
    },
    startNextHand() {
      return controller.startNextHand().status;
    },
    startNewMatch() {
      return controller.startNewMatch().status;
    }
  };
}

function liveSyncActions() {
  return {
    createRoom(options) {
      return liveSyncStatusFromResponse(liveSyncClient.createRoom(options));
    },
    joinRoom(options) {
      return liveSyncStatusFromResponse(liveSyncClient.joinRoom(options));
    },
    restoreRoom() {
      return reconnectLiveSyncSnapshot();
    },
    readyPlayer() {
      return liveSyncStatusFromResponse(liveSyncClient.readyPlayer());
    },
    leaveRoom() {
      return liveSyncStatusFromResponse(liveSyncClient.leaveRoom());
    },
    submitBid(options) {
      return liveSyncStatusFromResponse(liveSyncClient.submitBid(options));
    },
    submitPlayCardById(options) {
      return liveSyncStatusFromResponse(liveSyncClient.submitPlayCardById(options));
    },
    startNextHand() {
      return liveSyncStatusFromResponse(liveSyncClient.startNextHand());
    },
    startNewMatch() {
      return liveSyncStatusFromResponse(liveSyncClient.startNewMatch());
    }
  };
}

function realServerActions() {
  return {
    async createRoom(options) {
      return serverStatusFromResponse(await realServerClient.createRoom(options));
    },
    async joinRoom(options) {
      return serverStatusFromResponse(await realServerClient.joinRoom(options));
    },
    async restoreRoom() {
      return reconnectRealServerSnapshot();
    },
    async readyPlayer() {
      return serverStatusFromResponse(await realServerClient.readyPlayer());
    },
    async leaveRoom() {
      return serverStatusFromResponse(await realServerClient.leaveRoom());
    },
    async submitBid(options) {
      return serverStatusFromResponse(await realServerClient.submitBid(options));
    },
    async submitPlayCardById(options) {
      return serverStatusFromResponse(await realServerClient.submitPlayCardById(options));
    },
    async startNextHand() {
      return serverStatusFromResponse(await realServerClient.startNextHand());
    },
    async startNewMatch() {
      return serverStatusFromResponse(await realServerClient.startNewMatch());
    }
  };
}

function liveSyncStatusFromResponse(response) {
  if (!response.ok) {
    throw new Error(response.error?.message ?? "Live sync action failed");
  }
  return response.view;
}

function serverStatusFromResponse(response) {
  if (!response.ok) {
    throw new Error(response.error?.message ?? "Server action failed");
  }
  return response.view;
}

function serverStatusFromResponseOrQueue(response) {
  if (!response.ok) {
    throw new Error(response.error?.message ?? "Server action failed");
  }
  return response.view ?? currentShellStatus();
}

function reconnectLiveSyncSnapshot() {
  if (isRealServerMode()) return reconnectRealServerSnapshot();
  const result = liveSyncClient.reconnect();
  return result.status ?? liveSyncClient.status;
}

async function reconnectRealServerSnapshot() {
  const result = await realServerClient.reconnect();
  return result.status ?? realServerClient.status;
}

function currentShellStatus() {
  if (isRealServerMode()) return realServerClient.status;
  return isLiveSyncMode() ? liveSyncClient.status : controller.getActiveRoomStatus();
}

function isLiveSyncMode() {
  return transportMode === "live-sync";
}

function isRealServerMode() {
  return transportMode === "real-server";
}

function renderTransportModeStatus() {
  const label = isRealServerMode()
    ? `real local server (${realServerClient.connectionStatus}${realServerClient.error ? `: ${realServerClient.error}` : ""})`
    : (isLiveSyncMode() ? "live sync QA" : "direct local");
  transportModeStatusOutput.textContent = `Transport: ${label}`;
  renderQuickMatchStatus();
}

function renderQuickMatchStatus() {
  const queue = realServerClient.queueStatus;
  quickMatchStatusOutput.textContent = queue
    ? `Quick Match: ${queue.state} (${queue.waitingCount ?? 0} waiting)`
    : "Quick Match: idle";
}

function renderStatus(status) {
  renderTransportModeStatus();
  renderConnectionHelp(status);
  renderRoomCodeShare(status);
  phaseStatusOutput.textContent = `Phase: ${status?.phase ?? "none"}`;
  seatStatusOutput.textContent = `Seat: ${status?.viewerSeat ?? "none"}${status?.alreadySeated ? " seated" : ""}`;
  turnStatusOutput.textContent = `Turn: ${status?.currentTurn ?? "none"}`;
  actionStatusOutput.textContent = status ? formatActionStatus(status) : "Action: none";
  renderVisualShell(status);
  renderBetaSafetyPanel(status);
  statusOutput.textContent = status ? renderRoomShellText(status) : "No active room.";
  bidStatusOutput.textContent = status?.biddingStatus
    ? `Bid next: ${status.biddingStatus.nextBidder ?? "none"}`
    : "Bid next: none";
  handStatusOutput.textContent = status?.hand?.length
    ? `Visible hand IDs: ${status.hand.map(cardIdFor).join(", ")}`
    : "Visible hand IDs: none";
  playableStatusOutput.textContent = status?.playableCardStatus
    ? `Playable IDs: ${status.playableCardStatus.cardIds.join(", ") || "none"}`
    : "Playable IDs: none";
  trickStatusOutput.textContent = status
    ? `Current trick: ${formatTrick(status.currentTrick)} | Last trick: ${status.lastTrick ? formatTrick(status.lastTrick.plays) : "none"} | Winner: ${status.lastTrick?.winner ?? "none"}`
    : "Current trick: none";
  handSummaryOutput.textContent = status?.handSummary
    ? `Hand summary: ${formatHandSummary(status.handSummary)}`
    : "Hand summary: none";
  matchHistoryOutput.textContent = formatMatchHistory(controller.getMatchHistory());
  renderAccountsLitePanel();
  renderTournamentHistoryPanel();
  renderActionLog();
  renderBetaFeedbackPanel(status);
}

function renderConnectionHelp(status) {
  connectionStatusOutput.textContent = `Connection: ${connectionStatusLabel(status)}`;
  reconnectHelpOutput.textContent = status?.roomCode
    ? `Reconnect help: if the page refreshes or disconnects, tap Restore Active Room for ${status.roomCode}.`
    : "Reconnect help: create or join a room first, then Restore Active Room can recover your seat.";
  afkDisconnectWarningOutput.textContent = status?.roomCode
    ? "AFK/disconnect warning: timer placeholder only; if you step away, reconnect manually before continuing."
    : "AFK/disconnect warning: timer placeholder only; no active room yet.";
}

function connectionStatusLabel(status) {
  if (isRealServerMode()) {
    const error = realServerClient.error ? `, ${friendlyTesterError(realServerClient.error)}` : "";
    return `real server ${realServerClient.connectionStatus}${status?.roomCode ? `, room ${status.roomCode}` : ""}${error}`;
  }
  if (isLiveSyncMode()) {
    return `${liveSyncClient.status ? "mock live-sync connected" : "mock live-sync idle"}${status?.roomCode ? `, room ${status.roomCode}` : ""}`;
  }
  return `direct local, no server needed${status?.roomCode ? `, room ${status.roomCode}` : ""}`;
}

function renderRoomCodeShare(status) {
  roomCodeShareStatusOutput.textContent = status?.roomCode
    ? `Room code: ${status.roomCode}. Share this code with another tester.`
    : "Room code: create or join a room to share.";
}

function renderVisualShell(status) {
  const playCard = (card) => {
    playCardIdInput.value = card.id;
    runShellAction(() => activeShellActions().submitPlayCardById({ cardId: card.id }), "play card");
  };
  renderVisualShellInto(status, {
    phase: visualPhaseOutput,
    seat: visualSeatOutput,
    action: visualActionOutput,
    scoreSummary: visualScoreSummaryOutput,
    bidBagSummary: visualBidBagSummaryOutput,
    hand: visualHandOutput,
    currentTrick: visualCurrentTrickOutput,
    lastTrick: visualLastTrickOutput
  }, playCard);
  renderTableLayout(status, playCard);
  renderQaReport(status, errorOutput.textContent, {
    checks: qaCheckListOutput,
    edges: qaEdgeListOutput
  }, {
    lastSuccessfulAction,
    fixturePreset: activeFixturePreset,
    transportMode,
    localPlayerId: localIdentity.playerId,
    displayName: localIdentity.displayName,
    seatBinding: status?.viewerSeat ?? "none",
    reconnectStatus: reconnectStatusFor(status)
  });
}

function renderVisualShellInto(status, targets, onPlayableCard) {
  const model = buildVisualShellModel(status);
  if (targets.room) targets.room.textContent = `Room: ${model.roomCode}`;
  if (targets.turn) targets.turn.textContent = `Turn: ${model.currentTurn}`;
  if (targets.bid) targets.bid.textContent = model.bidStatus;
  if (targets.playable) targets.playable.textContent = model.playableStatus;
  targets.phase.textContent = `Phase: ${model.phase}`;
  targets.seat.textContent = `Seat: ${model.viewerSeat}`;
  targets.action.textContent = `Action: ${model.action}`;
  targets.currentTrick.textContent = model.currentTrick;
  targets.lastTrick.textContent = model.lastTrick;
  targets.scoreSummary.replaceChildren(...model.scoreRows.map((row) => visualSummaryItem(
    row.seat,
    `Score ${row.score}`,
    `Tricks ${row.tricks}`
  )));
  targets.bidBagSummary.replaceChildren(...model.bidBagRows.map((row) => visualSummaryItem(
    row.seat,
    `Bid ${row.bid ?? "none"}`,
    `Bags ${row.bags} | Ready ${row.ready ? "yes" : "no"}`
  )));
  targets.hand.replaceChildren(...model.handCards.map((card) => visualCardButton(card, onPlayableCard)));
  if (!model.handCards.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No visible hand for this view.";
    targets.hand.append(empty);
  }
}

function renderTableLayout(status, onPlayableCard) {
  const model = buildVisualShellModel(status);
  tableOpponentAreaOutput.textContent = status
    ? `Opponent: ${model.viewerSeat === "player1" ? "player2" : "player1"} | turn ${model.currentTurn}`
    : "Opponent: waiting";
  tableScoreAreaOutput.textContent = model.scoreRows.length
    ? `${model.scoreRows.map((row) => `${row.seat} ${row.score}`).join(" | ")} | ${model.bidStatus} | ${model.playableStatus}`
    : "Score/status: waiting";
  tableCenterTrickAreaOutput.textContent = `Current trick: ${model.currentTrick}`;
  tableLastTrickAreaOutput.textContent = `Last trick: ${model.lastTrick}`;
  const handLabel = document.createElement("p");
  handLabel.className = "table-hand-label";
  handLabel.textContent = `Player hand: ${model.handCards.length} visible cards`;
  const handGrid = document.createElement("div");
  handGrid.className = "card-button-grid table-hand-grid";
  handGrid.append(...model.handCards.map((card) => visualCardButton(card, onPlayableCard)));
  if (!model.handCards.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No visible hand for this view.";
    handGrid.append(empty);
  }
  tablePlayerHandAreaOutput.replaceChildren(handLabel, handGrid);
}

function renderQaReport(status, errorMessage, targets, context = {}) {
  const report = buildVisualQaReport(status, {
    errorMessage,
    lastSuccessfulAction: context.lastSuccessfulAction ?? lastSuccessfulAction,
    fixturePreset: context.fixturePreset ?? activeFixturePreset,
    matchHistoryCount: context.matchHistoryCount ?? controller.getMatchHistory().length,
    transportMode: context.transportMode ?? transportMode,
    localPlayerId: context.localPlayerId ?? localIdentity.playerId,
    displayName: context.displayName ?? localIdentity.displayName,
    seatBinding: context.seatBinding ?? status?.viewerSeat ?? "none",
    reconnectStatus: context.reconnectStatus ?? reconnectStatusFor(status)
  });
  targets.checks.replaceChildren(
    ...report.contextMessages.map((check) => qaReportItem(check.pass, check.name, check.detail)),
    ...report.checks.map((check) => qaReportItem(
    check.pass,
    check.name,
    check.detail
  )));
  targets.edges.replaceChildren(...report.edgeMessages.map((edge) => qaReportItem(
    edge.pass,
    edge.name,
    edge.message
  )));
}

function qaReportItem(pass, name, detail) {
  const item = document.createElement("p");
  item.className = pass ? "qa-check pass" : "qa-check fail";
  item.textContent = `${pass ? "PASS" : "FAIL"} ${name}: ${detail}`;
  return item;
}

function renderActionLog() {
  const entries = actionLog.list();
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "action-log-entry";
    empty.textContent = "No local actions recorded yet.";
    actionLogListOutput.replaceChildren(empty);
    return;
  }

  actionLogListOutput.replaceChildren(...entries.map((entry) => {
    const item = document.createElement("p");
    item.className = `action-log-entry ${entry.outcome === "success" ? "success" : "fail"}`;
    item.textContent = formatActionLogEntry(entry);
    return item;
  }));
}

function formatActionLogEntry(entry) {
  const summary = entry.summary;
  const statusText = [
    `phase ${summary.phase}`,
    `viewer ${summary.viewerSeat}`,
    `turn ${summary.currentTurn}`,
    `score ${summary.score}`,
    `bags ${summary.bags}`,
    `bids ${summary.bidStatus}`,
    `last trick winner ${summary.lastTrickWinner}`
  ].join(" | ");
  const message = entry.message ? ` | ${entry.message}` : "";
  return `${entry.outcome.toUpperCase()} ${entry.action}: ${statusText}${message}`;
}

function visualSummaryItem(label, primary, secondary) {
  const item = document.createElement("p");
  item.className = "summary-item";
  item.textContent = `${label}: ${primary} | ${secondary}`;
  return item;
}

function visualCardButton(card, onPlayableCard) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = card.playable ? "card-button playable" : "card-button";
  button.setAttribute("aria-label", card.ariaLabel);
  button.dataset.cardId = card.id;
  button.append(
    visualCardText("card-rank", card.rank),
    visualCardText("card-suit", card.suit),
    visualCardText("card-id", card.id),
    visualCardText("card-state", card.stateLabel)
  );
  button.disabled = !card.playable || !onPlayableCard;
  button.addEventListener("click", () => {
    if (onPlayableCard) onPlayableCard(card);
  });
  return button;
}

function visualCardText(className, text) {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

function renderManualStatus(view = manualViewSelect.value) {
  const status = manualHarness.statusForView(view);
  manualStatusOutput.textContent = status ? manualHarness.statusText(view) : "Manual harness idle.";
  renderVisualShellInto(status, {
    room: manualVisualRoomOutput,
    phase: manualVisualPhaseOutput,
    seat: manualVisualSeatOutput,
    action: manualVisualActionOutput,
    turn: manualVisualTurnOutput,
    bid: manualVisualBidOutput,
    playable: manualVisualPlayableOutput,
    scoreSummary: manualVisualScoreSummaryOutput,
    bidBagSummary: manualVisualBidBagSummaryOutput,
    hand: manualVisualHandOutput,
    currentTrick: manualVisualCurrentTrickOutput,
    lastTrick: manualVisualLastTrickOutput
  }, manualCardActionForView(view));
  renderQaReport(status, "", {
    checks: manualQaCheckListOutput,
    edges: manualQaEdgeListOutput
  }, {
    lastSuccessfulAction,
    fixturePreset: activeFixturePreset
  });
  renderTwoSeatVisualCompare();
}

function manualCardActionForView(view) {
  const controllerForView = view === "host"
    ? manualHarness.host
    : (view === "guest" ? manualHarness.guest : null);
  if (!controllerForView) return null;

  return (card) => {
    controllerForView.submitPlayCardById({ cardId: card.id });
    renderManualStatus(view);
  };
}

function renderTwoSeatVisualCompare() {
  const views = ["host", "guest", "spectator"].map((view) => ({
    view,
    status: manualHarness.statusForView(view)
  }));
  twoSeatVisualCompareOutput.replaceChildren(...views.map(({ view, status }) => {
    const model = buildVisualShellModel(status);
    const item = document.createElement("p");
    item.className = "summary-item";
    item.textContent = `${view}: ${model.viewerSeat} | hand ${model.handCards.length} | ${model.bidStatus} | ${model.playableStatus} | trick ${model.currentTrick} | last ${model.lastTrick}`;
    return item;
  }));
}

function showError(message) {
  errorOutput.textContent = friendlyTesterError(message);
}

function clearError() {
  errorOutput.textContent = "";
}

function cardIdFor(card) {
  return `${card.rank}-${card.suit}`;
}

function formatTrick(plays = []) {
  if (!plays.length) return "none";
  return plays.map((play) => `${play.player}:${cardIdFor(play.card)}`).join(", ");
}

function formatHandSummary(summary) {
  return ["player1", "player2"].map((player) => {
    const row = summary.players[player];
    return `${player} bid ${row.bid}, tricks ${row.tricks}, bags ${row.bags}, nil ${row.nilResult ?? "none"}, change ${row.scoreChange}, total ${row.totalScore}`;
  }).join(" | ");
}

function formatActionStatus(status) {
  if (status.phase === "waiting") {
    return `Action: ready ${status.playerReady.player1 ? "P1 yes" : "P1 no"} / ${status.playerReady.player2 ? "P2 yes" : "P2 no"}`;
  }
  if (status.phase === "bidding") {
    return `Action: bid needed from ${status.biddingStatus.nextBidder ?? "none"}`;
  }
  if (status.phase === "playing") {
    return `Action: ${status.currentPlayerStatus.canAct ? "play a card ID" : `waiting for ${status.currentTurn}`}`;
  }
  if (status.phase === "hand_complete") {
    return "Action: review summary or start next hand";
  }
  if (status.phase === "match_complete") {
    return "Action: record history or reset to new match";
  }
  return "Action: none";
}

function formatMatchHistory(history) {
  if (!history.length) return "Match history: none";
  return `Match history: ${history.map((entry) => (
    `${entry.timestamp} ${entry.winner} ${entry.finalScore.player1}-${entry.finalScore.player2}`
  )).join(" | ")}`;
}

function recordLocalCompletedMatch(options = {}) {
  const entry = controller.recordMatchHistory(options);
  accountStats.recordMatch(entry);
  renderAccountsLitePanel();
  renderTournamentHistoryPanel();
  return entry;
}

function recordLocalTournamentSnapshot() {
  const matches = accountStats.listResults();
  if (!matches.length) {
    throw new Error("Record at least one completed match before creating a local history snapshot");
  }
  const nextNumber = tournamentHistory.listTournaments().length + 1;
  const tournament = tournamentHistory.recordTournament({
    id: `local-history-${nextNumber}`,
    name: `Local History ${nextNumber}`,
    matches
  });
  renderTournamentHistoryPanel();
  return tournament;
}

function renderAccountsLitePanel() {
  const playerStats = accountStats.getPlayerStats(localIdentity.playerId);
  localPlayerStatsOutput.replaceChildren(
    accountStatItem("Local player", `${localIdentity.displayName} (${localIdentity.playerId})`),
    accountStatItem("Games", `${playerStats.gamesPlayed} played | ${playerStats.wins}W ${playerStats.losses}L`),
    accountStatItem("Nil", `${playerStats.nilMade} made | ${playerStats.nilFailed} failed`),
    accountStatItem("Bags", String(playerStats.bags))
  );

  const leaderboard = accountStats.getLeaderboard({ limit: 5 });
  leaderboardPreviewOutput.replaceChildren(...(leaderboard.length
    ? leaderboard.map((row, index) => accountStatItem(
      `#${index + 1} ${row.displayName}`,
      `${row.wins}W ${row.losses}L | games ${row.gamesPlayed} | nil ${row.nilMade}/${row.nilFailed} | bags ${row.bags}`
    ))
    : [accountStatItem("Local preview", "No local completed matches yet")]));

  const results = accountStats.listResults({ playerId: localIdentity.playerId });
  accountMatchResultsOutput.textContent = results.length
    ? `Local match results: ${results.map((entry) => (
      `${entry.timestamp} ${entry.roomCode} winner ${entry.winner} score ${entry.finalScore.player1}-${entry.finalScore.player2}`
    )).join(" | ")}`
    : "Local match results: none";
}

function accountStatItem(label, value) {
  const item = document.createElement("p");
  item.className = "account-stat-item";
  item.textContent = `${label}: ${value}`;
  return item;
}

function renderBetaSafetyPanel(status = currentShellStatus()) {
  const checklist = buildBetaSafetyChecklist({
    status,
    transportMode,
    serverStatus: betaServerStatus(),
    webSocketStatus: betaWebSocketStatus(),
    playerId: localIdentity.playerId,
    lastAction: lastSuccessfulAction,
    lastError: errorOutput.textContent
  });
  betaSafetyCheckListOutput.replaceChildren(...checklist.map((check) => qaReportItem(
    check.pass,
    check.name,
    check.detail
  )));
}

function renderBetaFeedbackPanel(status = currentShellStatus()) {
  betaDiagnosticsOutput.value = formatDiagnosticsSummary(currentDiagnosticsBundle(status));
  renderBetaFeedbackHistory();
}

function currentDiagnosticsBundle(status = currentShellStatus()) {
  return buildDiagnosticsBundle({
    status,
    transportMode,
    serverStatus: betaServerStatus(),
    webSocketStatus: betaWebSocketStatus(),
    playerId: localIdentity.playerId,
    displayName: localIdentity.displayName,
    lastAction: lastSuccessfulAction,
    lastError: errorOutput.textContent,
    hiddenHandSafe: hiddenHandSafe(status),
    fixturePreset: activeFixturePreset,
    actionLogEntries: actionLog.list()
  });
}

function renderBetaFeedbackHistory() {
  const reports = betaFeedback.list();
  betaFeedbackStatusOutput.textContent = reports.length
    ? `Feedback reports: ${reports.length} saved locally`
    : "Feedback reports: none saved";
  betaReportHistoryOutput.textContent = reports.length
    ? `Saved beta reports: ${reports.map((report) => (
      `${report.timestamp} ${report.title} | room ${report.diagnostics.roomCode} | phase ${report.diagnostics.phase} | seat ${report.diagnostics.seat}`
    )).join("\n")}`
    : "Saved beta reports: none";
}

async function copyDiagnosticsBundle() {
  const text = betaDiagnosticsOutput.value || formatDiagnosticsSummary(currentDiagnosticsBundle());
  betaDiagnosticsOutput.value = text;
  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(text);
      betaFeedbackStatusOutput.textContent = "Diagnostics copied.";
      return;
    }
    betaDiagnosticsOutput.focus();
    betaDiagnosticsOutput.select();
    document.execCommand?.("copy");
    betaFeedbackStatusOutput.textContent = "Diagnostics selected for copying.";
  } catch (error) {
    betaFeedbackStatusOutput.textContent = `Copy failed: ${friendlyTesterError(error?.message ?? "copy failed")}`;
  }
}

async function copyRoomCode() {
  const roomCode = currentShellStatus()?.roomCode;
  if (!roomCode) {
    roomCodeShareStatusOutput.textContent = "Room code: create or join a room before copying.";
    return;
  }

  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(roomCode);
      roomCodeShareStatusOutput.textContent = `Room code copied: ${roomCode}`;
      return;
    }
    joinCodeInput.value = roomCode;
    joinCodeInput.focus();
    joinCodeInput.select();
    document.execCommand?.("copy");
    roomCodeShareStatusOutput.textContent = `Room code selected for sharing: ${roomCode}`;
  } catch (error) {
    roomCodeShareStatusOutput.textContent = `Could not copy room code: ${friendlyTesterError(error?.message ?? "copy failed")}`;
  }
}

function renderManualBetaFlows() {
  manualBetaFlowListOutput.replaceChildren(...listManualBetaFlows().map((flow) => accountStatItem(
    flow.label,
    flow.steps.join(" > ")
  )));
}

function betaServerStatus() {
  if (isRealServerMode()) {
    return realServerClient.error
      ? `real server ${realServerClient.connectionStatus}: ${friendlyTesterError(realServerClient.error)}`
      : `real server ${realServerClient.connectionStatus}`;
  }
  if (isLiveSyncMode()) return "mock live-sync local";
  return "direct local controller";
}

function betaWebSocketStatus() {
  if (isRealServerMode()) return realServerClient.connectionStatus;
  if (isLiveSyncMode()) return liveSyncClient.status ? "mock socket active" : "mock socket idle";
  return "not used in direct local mode";
}

function renderTournamentHistoryPanel() {
  const summary = tournamentHistory.getSummary();
  tournamentSummaryOutput.replaceChildren(
    accountStatItem("Local snapshots", String(summary.tournamentCount)),
    accountStatItem("Grouped matches", String(summary.matchCount)),
    accountStatItem("Latest", summary.latest ? `${summary.latest.name} (${summary.latest.matchIds.length} matches)` : "none")
  );

  const latestPlacements = summary.latest?.placements ?? [];
  tournamentPlacementsOutput.replaceChildren(...(latestPlacements.length
    ? latestPlacements.map((row) => accountStatItem(
      `#${row.place} ${row.displayName}`,
      `${row.wins}W ${row.losses}L | diff ${row.scoreDiff} | bags ${row.bags} | nil ${row.nilMade}/${row.nilFailed}`
    ))
    : [accountStatItem("Placements", "No local tournament snapshots yet")]));

  const tournaments = tournamentHistory.listTournaments({ playerId: localIdentity.playerId });
  tournamentHistoryOutput.textContent = tournaments.length
    ? `Local history: ${tournaments.map((entry) => (
      `${entry.timestamp} ${entry.name} matches ${entry.matchIds.length} players ${entry.players.length}`
    )).join(" | ")}`
    : "Local history: none";
}

function formatVisualQaResult(result) {
  const finalPhase = result.hostStatus.phase;
  const trickCount = result.played.completedTricks;
  const checks = result.verificationLog.length;
  const restoreText = result.restored
    ? ` | restored ${result.restored.host.status.viewerSeat}/${result.restored.guest.status.viewerSeat}`
    : "";
  return `Visual QA ${result.name}: ${finalPhase}, tricks ${trickCount}, checks ${checks}${restoreText}`;
}

function saveCurrentDisplayName() {
  localIdentity = identityStore.saveDisplayName(displayNameInput.value || "Player");
  displayNameInput.value = localIdentity.displayName;
  return localIdentity;
}

function rememberSessionFromStatus(status) {
  if (!status) {
    localIdentity = identityStore.clearSession();
    return localIdentity;
  }

  const activeSession = activeSessionForMode();
  if (activeSession) {
    localIdentity = identityStore.saveSession(activeSession);
  } else if (status.viewerSeat === "spectator") {
    localIdentity = identityStore.clearSession();
  }
  return localIdentity;
}

function activeSessionForMode() {
  if (isRealServerMode()) return realServerClient.session;
  if (isLiveSyncMode()) return liveSyncClient.session;
  if (!["player1", "player2"].includes(currentShellStatus()?.viewerSeat)) return null;
  return {
    roomCode: currentShellStatus().roomCode,
    seatToken: localIdentity.seatToken,
    playerId: localIdentity.playerId,
    seat: currentShellStatus().viewerSeat
  };
}

function reconnectStatusFor(status) {
  if (!status) return localIdentity.lastSession ? "saved session missing active room" : "no saved room";
  const session = localIdentity.lastSession;
  if (!session) return `${status.viewerSeat} view active without saved room`;
  if (session.roomCode !== status.roomCode) return `saved ${session.roomCode}; viewing ${status.roomCode}`;
  return `${status.viewerSeat} restored for ${session.roomCode}`;
}
