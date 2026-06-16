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
  buildPlayerNavigationVisibility,
  cleanHomeRoomCodeForStatus,
  isCleanHomeMode as isCleanHomeNavigationMode
} from "./player-ui-navigation.js";
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
const playerScreenStatusOutput = document.querySelector("#player-screen-status");
const universalHomeButton = document.querySelector("#universal-home");
const playerGuideTitleOutput = document.querySelector("#player-guide-title");
const playerGuideDetailOutput = document.querySelector("#player-guide-detail");
const playerGuidePanel = document.querySelector("#player-guide");
const globalRoomInviteBar = document.querySelector("#global-room-invite-bar");
const globalRoomCodeOutput = document.querySelector("#global-room-code");
const globalRoomHelpOutput = document.querySelector("#global-room-help");
const globalRoomPlayersOutput = document.querySelector("#global-room-players");
const globalInviteRoomButton = document.querySelector("#global-invite-room");
const globalCopyRoomCodeButton = document.querySelector("#global-copy-room-code");
const globalBackLobbyButton = document.querySelector("#global-back-lobby");
const copyFeedbackToast = document.querySelector("#copy-feedback-toast");
const coinFlipPanel = document.querySelector("#coin-flip-panel");
const coinFlipTitleOutput = document.querySelector("#coin-flip-title");
const coinFlipDetailOutput = document.querySelector("#coin-flip-detail");
const roomCodeShareStatusOutput = document.querySelector("#room-code-share-status");
const roomInvitePanel = document.querySelector("#room-invite-panel");
const roomInviteCodeOutput = document.querySelector("#room-invite-code");
const roomInviteInstructionsOutput = document.querySelector("#room-invite-instructions");
const roomInvitePlayersOutput = document.querySelector("#room-invite-players");
const roomInviteLinkButton = document.querySelector("#room-invite-link");
const roomCopyCodeButton = document.querySelector("#room-copy-code");
const copyInviteLinkButton = document.querySelector("#copy-invite-link");
const copyRoomCodeButton = document.querySelector("#copy-room-code");
const restoreRoomButton = document.querySelector("#restore-room");
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
const tableInviteLinkButton = document.querySelector("#table-copy-invite-link");
const tableLeaveRoomButton = document.querySelector("#table-leave-room");
const tableStartNextHandButton = document.querySelector("#table-start-next-hand");
const tableStartRematchButton = document.querySelector("#table-start-rematch");
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
const bidChoiceButtons = [...document.querySelectorAll("[data-bid-value]")];
const playCardIdInput = document.querySelector("#play-card-id");
const bidControls = document.querySelector(".bid-controls");
const readyPlayerButton = document.querySelector("#ready-player");
const leaveRoomButton = document.querySelector("#leave-room");
const askRematchButton = document.querySelector("#ask-rematch");
const leaveRoomHelp = document.querySelector("#leave-room-help");
const manualStatusOutput = document.querySelector("#manual-status");
const manualViewSelect = document.querySelector("#manual-view");
const fixturePresetSelect = document.querySelector("#fixture-preset");
const visualQaScriptSelect = document.querySelector("#visual-qa-script");
const visualQaStatusOutput = document.querySelector("#visual-qa-status");
let manualHarness = createTwoSeatManualHarness();
let lastSuccessfulAction = "none";
let activeFixturePreset = "none";
let transportMode = "direct";
let activePlayerScreen = "lobby";
let playerChoseScreen = false;
let cleanHomeRoomCode = null;
let lastGuidedScreenKey = "";
let lastNotificationStatusKey = "";
let lastNotificationAt = 0;
let titleFlashTimer = null;
let copyFeedbackTimer = null;
let coinFlipTimer = null;
let lastCoinFlipKey = "";
let readyCountdownTimer = null;
let readyCountdownInterval = null;
let readyCountdownKey = null;
let readyCountdownRemaining = 0;
let readyCountdownCompletedKey = null;
let launchInviteRoomCode = "";
let launchInviteJoinAttempted = false;
let expoPushToken = String(globalThis.__SPADES_EXPO_PUSH_TOKEN ?? "").trim();
let lastRegisteredPushKey = "";
const baseDocumentTitle = document.title || "1v1 Spades";
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

globalInviteRoomButton?.addEventListener("click", () => {
  copyInviteLink();
});

globalCopyRoomCodeButton?.addEventListener("click", () => {
  copyRoomCode();
});

globalBackLobbyButton?.addEventListener("click", () => {
  clearActiveRoom();
});

document.querySelector("#create-room").addEventListener("click", () => {
  requestGameNotificationPermission();
  runShellAction(() => {
    saveCurrentDisplayName();
    return activeShellActions().createRoom({
      displayName: localIdentity.displayName,
      seatToken: localIdentity.seatToken
    });
  }, "create room");
});

document.querySelector("#join-room").addEventListener("click", () => {
  requestGameNotificationPermission();
  runShellAction(() => {
    saveCurrentDisplayName();
    return activeShellActions().joinRoom({
      roomCode: joinCodeInput.value,
      displayName: localIdentity.displayName,
      seatToken: localIdentity.seatToken
    });
  }, "join room");
});

document.querySelector("#spectate-room")?.addEventListener("click", () => {
  runShellAction(() => {
    saveCurrentDisplayName();
    return activeShellActions().joinRoom({
      roomCode: joinCodeInput.value,
      displayName: localIdentity.displayName,
      seatToken: null,
      spectator: true
    });
  }, "spectate room");
});

document.querySelector("#restore-room").addEventListener("click", () => {
  cleanHomeRoomCode = null;
  playerChoseScreen = false;
  runShellAction(() => activeShellActions().restoreRoom(), "restore active room");
});

universalHomeButton?.addEventListener("click", () => {
  showCleanHome(currentShellStatus());
});

document.querySelector("#reconnect-live-sync").addEventListener("click", () => {
  runShellAction(() => reconnectLiveSyncSnapshot(), "reconnect live sync snapshot");
});

copyInviteLinkButton?.addEventListener("click", () => {
  copyInviteLink();
});

roomInviteLinkButton?.addEventListener("click", () => {
  copyInviteLink();
});

roomCopyCodeButton?.addEventListener("click", () => {
  copyRoomCode();
});

tableInviteLinkButton?.addEventListener("click", () => {
  copyInviteLink();
});

copyRoomCodeButton?.addEventListener("click", () => {
  copyRoomCode();
});

document.querySelector("#jump-to-bug-report").addEventListener("click", () => {
  document.body.dataset.reportOpen = "true";
  if (testerMode) {
    setActivePlayerScreen(currentShellStatus()?.roomCode ? "play" : "lobby", { manual: true });
  }
  renderBetaFeedbackPanel(currentShellStatus());
  betaFeedbackPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  betaIssueTitleInput.focus();
});

document.querySelector("#join-quick-match").addEventListener("click", () => {
  requestGameNotificationPermission();
  runShellAction(async () => {
    if (!isRealServerMode()) {
      throw new Error("Find Match requires hosted server mode");
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
      throw new Error("Find Match requires hosted server mode");
    }
    const response = await realServerClient.leaveQuickMatch();
    renderQuickMatchStatus();
    return response.view ?? currentShellStatus();
  }, "leave quick match");
});

document.querySelector("#clear-room").addEventListener("click", () => {
  clearActiveRoom();
});

function clearActiveRoom() {
  if (isLiveSyncMode()) {
    liveSyncClient.disconnect();
  } else if (isRealServerMode()) {
    realServerClient.disconnect();
  } else {
    controller.clearActiveRoom();
  }
  localIdentity = identityStore.clearSession();
  lastSuccessfulAction = "clear active room";
  playerChoseScreen = false;
  lastGuidedScreenKey = "";
  lastCoinFlipKey = "";
  hideCoinFlip();
  actionLog.record("clear active room", null);
  renderStatus(null);
}

document.querySelector("#ready-player").addEventListener("click", () => {
  requestGameNotificationPermission();
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

bidChoiceButtons.forEach((button) => {
  button.addEventListener("click", () => {
    bidInput.value = button.dataset.bidValue;
    syncBidChoiceSelection();
  });
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

document.querySelector("#start-rematch").addEventListener("click", () => {
  runShellAction(() => activeShellActions().requestRematch(), "ask rematch");
});

document.querySelector("#ask-rematch").addEventListener("click", () => {
  runShellAction(() => activeShellActions().requestRematch(), "ask rematch");
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

document.querySelector("#table-start-rematch").addEventListener("click", () => {
  runShellAction(() => activeShellActions().requestRematch(), "ask rematch");
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
  document.body.dataset.reportOpen = "false";
});

document.querySelector("#export-beta-reports").addEventListener("click", () => {
  betaDiagnosticsOutput.value = betaFeedback.exportText();
  betaFeedbackStatusOutput.textContent = "Saved beta reports exported into the diagnostics box.";
});

document.querySelector("#clear-beta-reports").addEventListener("click", () => {
  betaFeedback.clear();
  renderBetaFeedbackHistory();
  betaFeedbackStatusOutput.textContent = "Saved beta reports cleared locally.";
  document.body.dataset.reportOpen = "false";
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

function showCleanHome(status) {
  cleanHomeRoomCode = cleanHomeRoomCodeForStatus(status);
  setActivePlayerScreen("lobby", { manual: true, status });
  renderStatus(status);
}

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

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) clearGameAttentionSignal();
});

globalThis.addEventListener?.("spades:expo-push-token", (event) => {
  expoPushToken = String(event?.detail?.token ?? "").trim();
  registerExpoPushToken(currentShellStatus());
});

renderInitialStatus();

function readLaunchParams() {
  return new URLSearchParams(window.location.search);
}

function shouldUseTesterMode(params) {
  if (["1", "true"].includes(String(params.get("dev") ?? "").toLowerCase())) {
    return false;
  }

  const tester = String(params.get("tester") ?? "").toLowerCase();
  if ([
    "ios",
    "ios-wrapper",
    "ios-testflight",
    "testflight",
    "beta",
    "1",
    "true"
  ].includes(tester)) {
    return true;
  }

  return true;
}

function applyLaunchMode() {
  const invitedRoomCode = String(launchParams.get("room") ?? launchParams.get("code") ?? "").trim().toUpperCase();
  if (invitedRoomCode) {
    launchInviteRoomCode = invitedRoomCode;
    joinCodeInput.value = invitedRoomCode;
    roomCodeShareStatusOutput.textContent = `Joining room ${invitedRoomCode} from invite link...`;
  }

  const requestedTransport = launchParams.get("transport");
  if (["direct", "live-sync", "real-server"].includes(requestedTransport)) {
    transportMode = requestedTransport;
    transportModeSelect.value = requestedTransport;
  }

  if (testerMode) {
    document.body.classList.add("tester-mode");
    transportMode = "real-server";
    transportModeSelect.value = "real-server";
  } else {
    document.body.classList.remove("tester-mode");
  }

  setActivePlayerScreen("lobby");
}

function renderInitialStatus() {
  if (isRealServerMode()) {
    realServerClient.connect()
      .then(() => joinLaunchInviteRoom())
      .then((status) => renderStatus(status ?? realServerClient.status))
      .catch((error) => {
        showError(error?.message ?? "Hosted server unavailable");
        renderStatus(realServerClient.status);
      });
    return;
  }

  renderStatus(controller.restoreActiveRoom().status);
}

async function joinLaunchInviteRoom() {
  if (!launchInviteRoomCode || launchInviteJoinAttempted) return realServerClient.status;
  launchInviteJoinAttempted = true;
  saveCurrentDisplayName();
  const status = serverStatusFromResponse(await realServerClient.joinRoom({
    roomCode: launchInviteRoomCode,
    displayName: localIdentity.displayName,
    seatToken: localIdentity.seatToken
  }));
  rememberSessionFromStatus(status);
  lastSuccessfulAction = `joined invite room ${launchInviteRoomCode}`;
  actionLog.record(lastSuccessfulAction, status);
  roomCodeShareStatusOutput.textContent = `Joined room ${launchInviteRoomCode}. Both players press Ready on Play.`;
  window.history?.replaceState?.({}, document.title, window.location.pathname);
  return status;
}

async function runShellAction(action, successLabel = "completed action") {
  try {
    clearError();
    const status = await action();
    rememberSessionFromStatus(status);
    lastSuccessfulAction = successLabel;
    actionLog.record(successLabel, status);
    if (shouldAutoPageAfterAction(successLabel, status)) {
      playerChoseScreen = false;
    }
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

function shouldAutoPageAfterAction(successLabel, status) {
  if (!status?.roomCode) return false;
  return [
    "create room",
    "join room",
    "spectate room",
    "restore active room",
    "join quick match",
    "ready",
    "ask rematch"
  ].includes(successLabel);
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
  document.body.dataset.findMatch = queue?.state ?? "idle";
  quickMatchStatusOutput.textContent = queue
    ? findMatchStatusText(queue)
    : "Find Match: ready";
}

function findMatchStatusText(queue) {
  if (queue.state === "waiting") return "Finding opponent... keep this screen open.";
  if (queue.state === "matched") return "Match found. Opening your table.";
  if (queue.state === "left") return "Find Match canceled.";
  return `Find Match: ${queue.state} (${queue.waitingCount ?? 0} waiting)`;
}

function renderStatus(status) {
  if (!status?.roomCode || status.roomCode !== cleanHomeRoomCode) {
    cleanHomeRoomCode = null;
  }
  registerExpoPushToken(status);
  maybeNotifyGameAttention(status);
  updateReadyCountdown(status);
  updatePlayerScreenForStatus(status);
  updatePlayerActionVisibility(status);
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
  renderPlayerGuide(status);
  renderCoinFlip(status);
}

function renderPlayerGuide(status) {
  if (!playerGuideTitleOutput || !playerGuideDetailOutput) return;
  const guide = playerGuideForStatus(status);
  playerGuideTitleOutput.textContent = guide.title;
  playerGuideDetailOutput.textContent = guide.detail;
  playerGuidePanel?.classList.toggle("urgent", Boolean(guide.urgent));
  setRecommendedAction(guide.selector);
}

function playerGuideForStatus(status) {
  const queue = realServerClient.queueStatus;
  if (isCleanHomeMode(status)) {
    return {
      title: "Choose how to play",
      detail: `Room ${status.roomCode} is saved. Tap Reconnect to Current Game to return.`,
      selector: "#restore-room"
    };
  }

  if (isReadyCountdownActive(status)) {
    return {
      title: `Starting in ${readyCountdownRemaining || 5}`,
      detail: "Both players are ready. The coin flip starts when the countdown ends.",
      selector: null,
      urgent: true
    };
  }

  if (!status?.roomCode) {
    if (queue?.state === "waiting") {
      return {
        title: "Finding an opponent",
        detail: "Keep this screen open. We will move you to the table when someone joins.",
        selector: "#leave-quick-match",
        urgent: true
      };
    }
    return {
      title: "Choose how to play",
      detail: "Tap Find Match for a fast game, or Create Room to invite a friend.",
      selector: "#join-quick-match"
    };
  }

  if (status.phase === "waiting") {
    const bothPlayersPresent = Boolean(status.players?.player1 && status.players?.player2);
    const isReady = Boolean(status.playerReady?.[status.viewerSeat]);
    if (bothPlayersPresent && !isReady) {
      return {
        title: "Opponent joined",
        detail: "You are at the table. Press Ready on Play to start the hand.",
        selector: "#ready-player",
        urgent: true
      };
    }
    if (bothPlayersPresent && isReady) {
      return {
        title: "Waiting on opponent",
        detail: "You are ready. The hand starts as soon as your opponent presses Ready.",
        selector: null,
        urgent: false
      };
    }
    return {
      title: "Invite your opponent",
      detail: "Share the room code or invite link. We will move you to Play when they join.",
      selector: "#global-invite-room",
      urgent: true
    };
  }

  if (status.phase === "bidding") {
    const isYourBid = status.biddingStatus?.nextBidder === status.viewerSeat;
    return {
      title: isYourBid ? "Your bid" : "Opponent is bidding",
      detail: isYourBid ? "Choose how many tricks you think you can take, then submit your bid." : "Watch the table. Your turn is coming next.",
      selector: isYourBid ? "#submit-bid" : null,
      urgent: isYourBid
    };
  }

  if (status.phase === "playing") {
    const canPlay = status.currentPlayerStatus?.canAct;
    return {
      title: canPlay ? "Your play" : "Opponent turn",
      detail: canPlay ? "Tap a highlighted card to play it." : "Watch the trick. You will play after your opponent.",
      selector: canPlay ? ".card-button:not(:disabled)" : null,
      urgent: canPlay
    };
  }

  if (status.phase === "hand_complete") {
    return {
      title: "Hand complete",
      detail: "Review the score, then start the next hand when you are ready.",
      selector: "#table-start-next-hand",
      urgent: true
    };
  }

  if (status.phase === "match_complete") {
    const rematchRequests = status.rematchRequests ?? {};
    if (rematchRequests[status.viewerSeat]) {
      return {
        title: "Waiting for rematch",
        detail: "Your rematch request is in. We will start when your opponent asks too.",
        selector: null,
        urgent: false
      };
    }
    return {
      title: "Match complete",
      detail: "Return to the lobby or ask your opponent for a rematch.",
      selector: "#ask-rematch",
      urgent: true
    };
  }

  return {
    title: "You are at the table",
    detail: "Use the game screen for room status and actions.",
    selector: null
  };
}

function setRecommendedAction(selector) {
  document.querySelectorAll(".recommended-action").forEach((element) => {
    element.classList.remove("recommended-action");
  });
  if (!selector) return;
  const target = document.querySelector(selector);
  if (target && !target.hidden && !target.disabled) {
    target.classList.add("recommended-action");
  }
}

function setActivePlayerScreen(screen, { manual = false, status = currentShellStatus() } = {}) {
  if (!["lobby", "table", "play"].includes(screen)) return;
  if (screen !== "lobby" && !status?.roomCode) {
    screen = "lobby";
    manual = false;
  }
  activePlayerScreen = screen;
  if (screen !== "lobby") {
    cleanHomeRoomCode = null;
  }
  if (manual) {
    playerChoseScreen = true;
  }
  document.body.dataset.activeScreen = screen;
}

function updatePlayerScreenForStatus(status) {
  updatePlayerChrome(status);
  if (isCleanHomeMode(status)) return;
  const guidance = guidedPlayerScreen(status);
  const preferredScreen = guidance.screen;
  if (!status || !playerChoseScreen || shouldAutoGuideScreen(guidance)) {
    setActivePlayerScreen(preferredScreen, { status });
    return;
  }
}

function guidedPlayerScreen(status) {
  if (!status?.roomCode) return { screen: "lobby", key: "lobby:none" };
  if (isReadyCountdownActive(status)) {
    return { screen: "play", key: `${status.roomCode}:ready-countdown:${readyCountdownKey}` };
  }
  const bothPlayersPresent = Boolean(status.players?.player1 && status.players?.player2);
  const viewerReady = Boolean(status.playerReady?.[status.viewerSeat]);
  const yourBid = status.phase === "bidding" && status.biddingStatus?.nextBidder === status.viewerSeat;
  const yourPlay = status.phase === "playing" && status.currentPlayerStatus?.canAct;

  if (status.phase === "waiting") {
    if (bothPlayersPresent && !viewerReady) {
      return { screen: "play", key: `${status.roomCode}:waiting:ready:${status.viewerSeat}` };
    }
    if (bothPlayersPresent && viewerReady) {
      return { screen: "play", key: `${status.roomCode}:waiting:opponent-ready:${status.viewerSeat}` };
    }
    return { screen: "play", key: `${status.roomCode}:waiting:invite` };
  }

  if (status.phase === "bidding") {
    return {
      screen: "play",
      key: `${status.roomCode}:bidding:${yourBid ? "your-bid" : "opponent-bid"}:${status.biddingStatus?.nextBidder ?? "none"}`
    };
  }

  if (status.phase === "playing") {
    return {
      screen: "play",
      key: `${status.roomCode}:playing:${yourPlay ? "your-play" : "opponent-play"}:${status.currentTurn ?? "none"}:${status.hand?.length ?? 0}`
    };
  }

  if (status.phase === "hand_complete") {
    return { screen: "play", key: `${status.roomCode}:hand-complete` };
  }

  if (status.phase === "match_complete") {
    return { screen: "play", key: `${status.roomCode}:match-complete` };
  }

  return { screen: "table", key: `${status.roomCode}:${status.phase ?? "unknown"}` };
}

function preferredPlayerScreen(status) {
  return guidedPlayerScreen(status).screen;
}

function shouldAutoGuideScreen(guidance) {
  if (guidance.key === lastGuidedScreenKey) return false;
  lastGuidedScreenKey = guidance.key;
  return activePlayerScreen !== guidance.screen;
}

function updatePlayerChrome(status) {
  if (!playerScreenStatusOutput) return;
  if (isCleanHomeMode(status)) {
    playerScreenStatusOutput.textContent = "Home";
    return;
  }
  const roomLabel = status?.roomCode ? `Room ${status.roomCode}` : "Home";
  const phaseLabel = status?.phase ? status.phase.replace("_", " ") : "ready";
  playerScreenStatusOutput.textContent = `${roomLabel} · ${phaseLabel}`;
}

function renderCoinFlip(status) {
  if (!coinFlipPanel || !status?.roomCode || status.phase !== "bidding" || !status.coinFlipWinner) return;
  const key = `${status.roomCode}:${status.coinFlipWinner}:${status.dealer}:${status.firstPlayer}`;
  if (readyCountdownCompletedKey !== key) {
    hideCoinFlip();
    return;
  }
  if (key === lastCoinFlipKey) return;
  lastCoinFlipKey = key;

  const winnerName = status.players?.[status.coinFlipWinner]?.displayName ?? seatName(status.coinFlipWinner);
  const leaderName = status.players?.[status.firstPlayer]?.displayName ?? seatName(status.firstPlayer);
  if (coinFlipTitleOutput) coinFlipTitleOutput.textContent = `${winnerName} won the flip`;
  if (coinFlipDetailOutput) coinFlipDetailOutput.textContent = `${winnerName} deals first. ${leaderName} leads the first trick.`;

  coinFlipPanel.hidden = false;
  coinFlipPanel.classList.remove("show");
  void coinFlipPanel.offsetWidth;
  coinFlipPanel.classList.add("show");
  clearTimeout(coinFlipTimer);
  coinFlipTimer = setTimeout(hideCoinFlip, 2600);
}

function hideCoinFlip() {
  clearTimeout(coinFlipTimer);
  coinFlipTimer = null;
  coinFlipPanel?.classList.remove("show");
  if (coinFlipPanel) coinFlipPanel.hidden = true;
}

function coinFlipKeyForStatus(status) {
  if (!status?.roomCode || status.phase !== "bidding" || !status.coinFlipWinner) return null;
  return `${status.roomCode}:${status.coinFlipWinner}:${status.dealer}:${status.firstPlayer}`;
}

function isReadyCountdownActive(status) {
  const key = coinFlipKeyForStatus(status);
  return Boolean(key && readyCountdownKey === key && readyCountdownCompletedKey !== key);
}

function updateReadyCountdown(status) {
  const key = coinFlipKeyForStatus(status);
  if (!key) {
    clearReadyCountdown();
    return;
  }
  if (readyCountdownCompletedKey === key || readyCountdownKey === key) return;

  clearReadyCountdown();
  readyCountdownKey = key;
  readyCountdownRemaining = 5;
  renderPlayerGuide(status);
  readyCountdownInterval = setInterval(() => {
    readyCountdownRemaining = Math.max(0, readyCountdownRemaining - 1);
    renderPlayerGuide(currentShellStatus());
  }, 1000);
  readyCountdownTimer = setTimeout(() => {
    readyCountdownCompletedKey = key;
    clearReadyCountdown({ keepCompleted: true });
    setActivePlayerScreen("play", { status: currentShellStatus() });
    renderStatus(currentShellStatus());
  }, 5000);
}

function clearReadyCountdown({ keepCompleted = false } = {}) {
  clearTimeout(readyCountdownTimer);
  clearInterval(readyCountdownInterval);
  readyCountdownTimer = null;
  readyCountdownInterval = null;
  readyCountdownKey = null;
  readyCountdownRemaining = 0;
  if (!keepCompleted) readyCountdownCompletedKey = null;
}

function seatName(seat) {
  if (seat === "player1") return "Player 1";
  if (seat === "player2") return "Player 2";
  return "Opponent";
}

function updatePlayerActionVisibility(status) {
  const phase = status?.phase ?? "none";
  const navigation = buildPlayerNavigationVisibility({
    status,
    activePlayerScreen,
    cleanHomeRoomCode,
    hasSavedRoom: Boolean(localIdentity.lastSession)
  });
  const cleanHome = navigation.cleanHome;
  document.body.dataset.gamePhase = phase;
  document.body.dataset.hasRoom = navigation.bodyHasRoom ? "true" : "false";
  document.body.dataset.cleanHome = cleanHome ? "true" : "false";
  document.body.dataset.hasSavedRoom = localIdentity.lastSession ? "true" : "false";

  const isWaiting = phase === "waiting";
  const isBidding = phase === "bidding";
  const isYourBid = isBidding && status?.biddingStatus?.nextBidder === status?.viewerSeat;
  const countdownActive = isReadyCountdownActive(status);
  const isHandComplete = phase === "hand_complete";
  const isMatchComplete = phase === "match_complete";
  const hasRoom = Boolean(status?.roomCode);
  const rematchRequested = Boolean(status?.rematchRequests?.[status.viewerSeat]);

  setHidden(universalHomeButton, !navigation.showUniversalHome);
  setHidden(bidControls, !isYourBid || countdownActive);
  setHidden(globalRoomInviteBar, !navigation.showGlobalRoomInvite);
  if (globalRoomCodeOutput) globalRoomCodeOutput.textContent = status?.roomCode ?? "------";
  setHidden(globalInviteRoomButton, !isWaiting);
  setHidden(globalCopyRoomCodeButton, !hasRoom);
  setHidden(globalBackLobbyButton, !isMatchComplete);
  setHidden(restoreRoomButton, !navigation.showReconnect);
  if (restoreRoomButton) restoreRoomButton.textContent = "Reconnect to Current Game";
  setHidden(readyPlayerButton, !isWaiting);
  setHidden(leaveRoomButton, !hasRoom);
  setHidden(askRematchButton, !isMatchComplete || rematchRequested);
  setHidden(leaveRoomHelp, !hasRoom);
  setHidden(tableLeaveRoomButton, !hasRoom);
  setHidden(copyInviteLinkButton, !hasRoom);
  setHidden(copyRoomCodeButton, !hasRoom);
  setHidden(tableInviteLinkButton, !isWaiting);
  setHidden(roomInvitePanel, !hasRoom);
  setHidden(roomInviteLinkButton, !isWaiting);
  setHidden(roomCopyCodeButton, !hasRoom);
  if (roomInviteCodeOutput) roomInviteCodeOutput.textContent = status?.roomCode ?? "------";
  setHidden(tableStartNextHandButton, !isHandComplete);
  setHidden(tableStartRematchButton, !isMatchComplete || rematchRequested);
  if (leaveRoomButton) leaveRoomButton.textContent = isMatchComplete ? "Return to Lobby" : "Leave Game";
  if (tableLeaveRoomButton) tableLeaveRoomButton.textContent = isMatchComplete ? "Return to Lobby" : "Leave Game";
}

function isCleanHomeMode(status) {
  return isCleanHomeNavigationMode({ activePlayerScreen, cleanHomeRoomCode, status });
}

function setHidden(element, hidden) {
  if (!element) return;
  element.hidden = hidden;
}
function registerExpoPushToken(status) {
  if (!expoPushToken || !status?.roomCode || !["player1", "player2"].includes(status.viewerSeat)) return;
  const key = [localIdentity.playerId, expoPushToken, status.roomCode, status.viewerSeat].join(":");
  if (key === lastRegisteredPushKey) return;
  lastRegisteredPushKey = key;
  fetch("/api/push/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      playerId: localIdentity.playerId,
      token: expoPushToken,
      displayName: localIdentity.displayName,
      roomCode: status.roomCode,
      seat: status.viewerSeat
    })
  }).catch(() => {
    lastRegisteredPushKey = "";
  });
}

function isPageAway() {
  return document.hidden || document.visibilityState === "hidden";
}

function requestGameNotificationPermission() {
  if (!("Notification" in globalThis)) return;
  if (Notification.permission !== "default") return;
  try {
    void Notification.requestPermission();
  } catch {
    // Some webviews do not support permission prompts; title/vibration fallback still works.
  }
}

function maybeNotifyGameAttention(status) {
  if (!status?.roomCode || !["player1", "player2"].includes(status.viewerSeat)) return;
  const attention = gameAttentionReason(status);
  if (!attention) return;
  const key = [status.roomCode, status.viewerSeat, status.phase, attention.type, attention.detail].join(":");
  if (key === lastNotificationStatusKey) return;
  lastNotificationStatusKey = key;
  if (!isPageAway()) return;
  sendGameAttentionNotification(attention.title, attention.body, key);
}

function gameAttentionReason(status) {
  const opponentSeat = status.viewerSeat === "player1" ? "player2" : "player1";
  const opponent = status.players?.[opponentSeat];
  const opponentName = opponent?.displayName || "Your opponent";
  const bothPlayersPresent = Boolean(status.players?.player1 && status.players?.player2);
  if (status.phase === "waiting" && bothPlayersPresent && !status.playerReady?.[status.viewerSeat]) {
    return {
      type: "room-ready",
      detail: status.players?.[opponentSeat]?.playerId ?? opponentSeat,
      title: "Opponent joined your Spades room",
      body: opponentName + " is in room " + status.roomCode + ". Open Spades and press Ready."
    };
  }
  if (status.phase === "bidding" && status.biddingStatus?.nextBidder === status.viewerSeat) {
    return {
      type: "bid-turn",
      detail: status.biddingStatus?.nextBidder,
      title: "Your Spades bid is up",
      body: "Room " + status.roomCode + ": open the game and place your bid."
    };
  }
  if (status.phase === "playing" && status.currentPlayerStatus?.canAct) {
    return {
      type: "play-turn",
      detail: status.currentTurn,
      title: "Your turn in Spades",
      body: "Room " + status.roomCode + ": open the game and play a card."
    };
  }
  return null;
}

function sendGameAttentionNotification(title, body, key) {
  const now = Date.now();
  if (now - lastNotificationAt < 1200) return;
  lastNotificationAt = now;
  flashDocumentTitle(title);
  postNativeGameAttention(title, body, key);
  try {
    globalThis.navigator?.vibrate?.([160, 80, 160]);
  } catch {
    // Vibration is best-effort and unavailable in many browsers/webviews.
  }
  if (!("Notification" in globalThis) || Notification.permission !== "granted") return;
  try {
    const notification = new Notification(title, {
      body,
      tag: key,
      renotify: true,
      silent: false
    });
    notification.onclick = () => {
      try { globalThis.focus?.(); } catch {}
      clearGameAttentionSignal();
      notification.close?.();
    };
  } catch {
    // Notification construction can fail in embedded webviews; fallback already ran.
  }
}

function postNativeGameAttention(title, body, key) {
  try {
    globalThis.ReactNativeWebView?.postMessage?.(JSON.stringify({
      type: "spades:game-attention",
      title,
      body,
      key
    }));
  } catch {
    // Native bridge is optional; browser notifications/title flash still work.
  }
}

function flashDocumentTitle(title) {
  if (titleFlashTimer) clearInterval(titleFlashTimer);
  let on = false;
  document.title = title;
  titleFlashTimer = setInterval(() => {
    on = !on;
    document.title = on ? title : baseDocumentTitle;
  }, 1400);
}

function clearGameAttentionSignal() {
  if (titleFlashTimer) {
    clearInterval(titleFlashTimer);
    titleFlashTimer = null;
  }
  document.title = baseDocumentTitle;
}

function renderConnectionHelp(status) {
  connectionStatusOutput.textContent = `Connection: ${connectionStatusLabel(status)}`;
  reconnectHelpOutput.textContent = status?.roomCode
    ? `Reconnect help: if the page refreshes or disconnects, tap Reconnect to Current Game for ${status.roomCode}.`
    : "Reconnect help: create or join a room first, then Reconnect to Current Game can recover your seat.";
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
    ? `Room ${status.roomCode} is ready. Share this code with your opponent, then both players press Ready on Play.`
    : "Room code: create or join a room to share.";
  renderRoomPresence(status);
}

function renderRoomPresence(status) {
  const presence = roomPresenceText(status);
  const help = roomInviteHelpText(status);

  if (globalRoomPlayersOutput) globalRoomPlayersOutput.textContent = presence;
  if (roomInvitePlayersOutput) roomInvitePlayersOutput.textContent = presence;
  if (globalRoomHelpOutput) globalRoomHelpOutput.textContent = help;
  if (roomInviteInstructionsOutput) roomInviteInstructionsOutput.textContent = help;
}

function roomInviteHelpText(status) {
  if (!status?.roomCode) return "Create or join a room first.";
  const bothPlayersPresent = Boolean(status.players?.player1 && status.players?.player2);
  if (status.phase === "waiting" && bothPlayersPresent) {
    return "Opponent joined. Both players press Ready to start.";
  }
  if (status.phase === "waiting") {
    return "Share this code with your opponent, then both players press Ready on Play.";
  }
  if (status.phase === "bidding") return "Bidding is live. Watch your hand and submit when it is your turn.";
  if (status.phase === "playing") return "Game is live. Play from this screen when it is your turn.";
  if (status.phase === "hand_complete") return "Hand complete. Review the score and continue when ready.";
  if (status.phase === "match_complete") return "Match complete. Return to lobby or ask for a rematch.";
  return "Room is active.";
}

function roomPresenceText(status) {
  if (!status?.roomCode) return "Players: waiting for room.";
  const player1 = status.players?.player1;
  const player2 = status.players?.player2;
  if (!player1 && !player2) return "Players: waiting for seats.";
  if (!player1 || !player2) {
    const seated = player1 ?? player2;
    const label = player1 ? "Player 1" : "Player 2";
    return `Players: ${label} ${seated?.displayName ?? "Player"} is here. Opponent waiting.`;
  }

  if (status.viewerSeat === "spectator") {
    return `Players: ${player1.displayName ?? "Player 1"} vs ${player2.displayName ?? "Player 2"}.`;
  }

  const opponentSeat = status.viewerSeat === "player1" ? "player2" : "player1";
  const you = status.players?.[status.viewerSeat]?.displayName ?? seatName(status.viewerSeat);
  const opponent = status.players?.[opponentSeat]?.displayName ?? seatName(opponentSeat);
  const ready = status.phase === "waiting"
    ? ` Ready: you ${status.playerReady?.[status.viewerSeat] ? "yes" : "no"}, opponent ${status.playerReady?.[opponentSeat] ? "yes" : "no"}.`
    : "";
  return `Players: you ${you} · opponent ${opponent}.${ready}`;
}

function buildInviteLink(roomCode) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", roomCode);
  url.searchParams.set("transport", "real-server");
  return url.toString();
}

function allCopyFeedbackButtons() {
  return [
    globalInviteRoomButton,
    copyInviteLinkButton,
    roomInviteLinkButton,
    tableInviteLinkButton,
    globalCopyRoomCodeButton,
    copyRoomCodeButton,
    roomCopyCodeButton
  ].filter(Boolean);
}

function copyFeedbackButtons(kind) {
  const inviteButtons = [
    globalInviteRoomButton,
    copyInviteLinkButton,
    roomInviteLinkButton,
    tableInviteLinkButton
  ];
  const roomCodeButtons = [
    globalCopyRoomCodeButton,
    copyRoomCodeButton,
    roomCopyCodeButton
  ];
  return (kind === "invite" ? inviteButtons : roomCodeButtons).filter(Boolean);
}

function restoreCopyFeedbackButtons() {
  for (const button of allCopyFeedbackButtons()) {
    if (button.dataset.copyOriginalLabel) {
      button.textContent = button.dataset.copyOriginalLabel;
    }
    button.classList.remove("copied");
  }
}

function showCopyFeedback(message, kind = "invite") {
  roomCodeShareStatusOutput.textContent = message;
  if (copyFeedbackToast) {
    copyFeedbackToast.textContent = message;
    copyFeedbackToast.hidden = false;
  }

  clearTimeout(copyFeedbackTimer);
  restoreCopyFeedbackButtons();

  for (const button of copyFeedbackButtons(kind)) {
    if (!button.dataset.copyOriginalLabel) {
      button.dataset.copyOriginalLabel = button.textContent;
    }
    button.textContent = "Copied";
    button.classList.add("copied");
  }

  copyFeedbackTimer = setTimeout(() => {
    if (copyFeedbackToast) {
      copyFeedbackToast.hidden = true;
      copyFeedbackToast.textContent = "";
    }
    restoreCopyFeedbackButtons();
  }, 3600);
}

async function copyInviteLink() {
  const roomCode = currentShellStatus()?.roomCode;
  if (!roomCode) {
    roomCodeShareStatusOutput.textContent = "Create a room first, then copy the invite link.";
    return;
  }
  const inviteLink = buildInviteLink(roomCode);
  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(inviteLink);
      showCopyFeedback(`Copied invite link for room ${roomCode}. Send it to your opponent.`, "invite");
      return;
    }
    joinCodeInput.value = inviteLink;
    joinCodeInput.focus();
    joinCodeInput.select();
    document.execCommand?.("copy");
    showCopyFeedback(`Copied invite link for room ${roomCode}. Send it to your opponent.`, "invite");
  } catch (error) {
    roomCodeShareStatusOutput.textContent = `Could not copy invite link: ${friendlyTesterError(error?.message ?? "copy failed")}`;
  }
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
  syncBidChoiceSelection();
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
  const bidRowsBySeat = new Map(model.bidBagRows.map((row) => [row.seat, row]));
  const scoreRows = [...model.scoreRows].sort((a, b) => {
    if (a.seat === model.viewerSeat) return 1;
    if (b.seat === model.viewerSeat) return -1;
    return a.seat.localeCompare(b.seat);
  });
  targets.scoreSummary.replaceChildren(...scoreRows.map((row) => playerRailSummaryItem({
    seat: row.seat,
    viewerSeat: model.viewerSeat,
    score: row.score,
    tricks: row.tricks,
    bid: bidRowsBySeat.get(row.seat)?.bid,
    bags: bidRowsBySeat.get(row.seat)?.bags,
    ready: bidRowsBySeat.get(row.seat)?.ready,
    cards: row.seat === model.viewerSeat
      ? model.handCards.length
      : model.hiddenHandCounts?.[row.seat]
  })));
  targets.bidBagSummary.replaceChildren(...model.bidBagRows.map((row) => visualSummaryItem(
    seatName(row.seat),
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

function renderTableLayout(status) {
  const model = buildVisualShellModel(status);
  tableOpponentAreaOutput.textContent = status
    ? `Opponent: ${seatName(model.viewerSeat === "player1" ? "player2" : "player1")} | turn ${seatName(model.currentTurn)}`
    : "Opponent: waiting";
  tableScoreAreaOutput.textContent = status ? "Gameplay is on Play." : "Table: waiting";
  tableCenterTrickAreaOutput.textContent = status?.phase === "waiting"
    ? "Waiting room: invite, copy code, then both players press Ready."
    : "Active hand: use Play for bidding, cards, tricks, and scoreboard.";
  tableLastTrickAreaOutput.textContent = status ? `Room ${model.roomCode} | ${model.phase}` : "No active room.";
  const handLabel = document.createElement("p");
  handLabel.className = "table-hand-label";
  handLabel.textContent = "Cards and bidding are only shown on Play.";
  tablePlayerHandAreaOutput.replaceChildren(handLabel);
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

function playerRailSummaryItem({ seat, viewerSeat, score, tricks, bid, bags, ready, cards }) {
  const item = document.createElement("div");
  item.className = seat === viewerSeat ? "summary-item scoreboard-rail viewer-rail" : "summary-item scoreboard-rail opponent-rail";
  item.dataset.seat = seat;
  item.append(
    railText("rail-seat", seat === viewerSeat ? `${seatName(seat)} · You` : seatName(seat)),
    railText("rail-name", currentShellStatus()?.players?.[seat]?.displayName ?? seatName(seat)),
    railMetric("pts", `${score} pts`),
    railMetric("bags", `${bags ?? 0} bags`),
    railMetric("cards", `${cards ?? 0} cards`),
    railMetric("bid", bid ?? "–"),
    railMetric("tricks", tricks ?? 0),
    railText("rail-ready", ready ? "Online" : "Online")
  );
  return item;
}


function syncBidChoiceSelection() {
  const selectedBid = String(bidInput.value ?? "");
  bidChoiceButtons.forEach((button) => {
    button.classList.toggle("selected", button.dataset.bidValue === selectedBid);
  });
}

function railMetric(label, value) {
  const metric = document.createElement("span");
  metric.className = `rail-metric rail-${label}`;
  metric.append(
    railText("rail-metric-value", String(value)),
    railText("rail-metric-label", label)
  );
  return metric;
}

function railText(className, text) {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

function visualCardButton(card, onPlayableCard) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = card.playable ? "card-button playable" : "card-button";
  button.setAttribute("aria-label", card.ariaLabel);
  button.dataset.cardId = card.id;
  button.dataset.suit = card.suit;
  button.append(
    visualCardText("card-rank", card.rank),
    visualCardText("card-suit", suitGlyph(card.suit)),
    visualCardText("card-id", card.id),
    visualCardText("card-state", card.playable ? card.stateLabel : "")
  );
  button.disabled = !card.playable || !onPlayableCard;
  button.addEventListener("click", () => {
    if (onPlayableCard) onPlayableCard(card);
  });
  return button;
}

function suitGlyph(suit) {
  if (suit === "spades") return "♠";
  if (suit === "hearts") return "♥";
  if (suit === "diamonds") return "♦";
  if (suit === "clubs") return "♣";
  return suit;
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
      showCopyFeedback(`Copied room code ${roomCode}. Send it to your opponent.`, "room-code");
      return;
    }
    joinCodeInput.value = roomCode;
    joinCodeInput.focus();
    joinCodeInput.select();
    document.execCommand?.("copy");
    showCopyFeedback(`Copied room code ${roomCode}. Send it to your opponent.`, "room-code");
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
