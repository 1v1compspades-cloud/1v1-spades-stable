import { createSpadesAppController } from "./app-controller.js";
import { createLocalActionLog } from "./action-log.js";
import {
  createTwoSeatManualHarness,
  listManualFixturePresets
} from "./manual-harness.js";
import { renderRoomShellText } from "./room-shell.js";
import {
  buildVisualQaReport,
  buildVisualShellModel
} from "./visual-shell.js";
import {
  listVisualQaScripts,
  runVisualQaScript
} from "./visual-qa-scripts.js";

const controller = createSpadesAppController({
  createPlayerId: loadOrCreatePlayerId
});

const displayNameInput = document.querySelector("#display-name");
const joinCodeInput = document.querySelector("#join-code");
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
const actionLog = createLocalActionLog();

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
  runShellAction(() => controller.createRoom({
    displayName: displayNameInput.value || "Player"
  }).status, "create room");
});

document.querySelector("#join-room").addEventListener("click", () => {
  runShellAction(() => controller.joinRoom({
    roomCode: joinCodeInput.value,
    displayName: displayNameInput.value || "Player"
  }).status, "join room");
});

document.querySelector("#restore-room").addEventListener("click", () => {
  runShellAction(() => controller.restoreActiveRoom().status, "restore active room");
});

document.querySelector("#clear-room").addEventListener("click", () => {
  controller.clearActiveRoom();
  lastSuccessfulAction = "clear active room";
  actionLog.record("clear active room", null);
  renderStatus(null);
});

document.querySelector("#ready-player").addEventListener("click", () => {
  runShellAction(() => controller.readyPlayer().status, "ready");
});

document.querySelector("#leave-room").addEventListener("click", () => {
  runShellAction(() => controller.leaveRoom().status, "leave room");
});

document.querySelector("#submit-bid").addEventListener("click", () => {
  runShellAction(() => controller.submitBid({
    bid: Number(bidInput.value)
  }).status, "bid");
});

document.querySelector("#submit-nil").addEventListener("click", () => {
  bidInput.value = "0";
  runShellAction(() => controller.submitBid({ bid: 0 }).status, "bid");
});

document.querySelector("#submit-play-card").addEventListener("click", () => {
  runShellAction(() => controller.submitPlayCardById({
    cardId: playCardIdInput.value
  }).status, "play card");
});

document.querySelector("#play-full-hand").addEventListener("click", () => {
  runShellAction(() => controller.playFullHand().status, "play full hand");
});

document.querySelector("#start-next-hand").addEventListener("click", () => {
  runShellAction(() => controller.startNextHand().status, "next hand");
});

document.querySelector("#record-match-history").addEventListener("click", () => {
  runShellAction(() => {
    controller.recordMatchHistory();
    return controller.getActiveRoomStatus();
  }, "record match history");
});

document.querySelector("#start-new-match").addEventListener("click", () => {
  runShellAction(() => controller.startNewMatch().status, "reset/new match");
});

document.querySelector("#table-leave-room").addEventListener("click", () => {
  runShellAction(() => controller.leaveRoom().status, "leave room");
});

document.querySelector("#table-record-history").addEventListener("click", () => {
  runShellAction(() => {
    controller.recordMatchHistory();
    return controller.getActiveRoomStatus();
  }, "record match history");
});

document.querySelector("#table-start-next-hand").addEventListener("click", () => {
  runShellAction(() => controller.startNextHand().status, "next hand");
});

document.querySelector("#table-start-new-match").addEventListener("click", () => {
  runShellAction(() => controller.startNewMatch().status, "reset/new match");
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

renderStatus(controller.restoreActiveRoom().status);

function runShellAction(action, successLabel = "completed action") {
  try {
    clearError();
    const status = action();
    lastSuccessfulAction = successLabel;
    actionLog.record(successLabel, status);
    renderStatus(status);
  } catch (error) {
    const message = error?.message ?? "Action failed";
    const status = controller.getActiveRoomStatus();
    actionLog.record(successLabel, status, { outcome: "failure", message });
    showError(message);
    renderActionLog();
    renderQaReport(status, message, {
      checks: qaCheckListOutput,
      edges: qaEdgeListOutput
    });
  }
}

function renderStatus(status) {
  phaseStatusOutput.textContent = `Phase: ${status?.phase ?? "none"}`;
  seatStatusOutput.textContent = `Seat: ${status?.viewerSeat ?? "none"}${status?.alreadySeated ? " seated" : ""}`;
  turnStatusOutput.textContent = `Turn: ${status?.currentTurn ?? "none"}`;
  actionStatusOutput.textContent = status ? formatActionStatus(status) : "Action: none";
  renderVisualShell(status);
  statusOutput.textContent = status ? renderRoomShellText(status) : "No active room.";
  bidStatusOutput.textContent = status?.biddingStatus
    ? `Bid next: ${status.biddingStatus.nextBidder ?? "none"}`
    : "Bid next: none";
  handStatusOutput.textContent = status?.hand?.length
    ? `Hand IDs: ${status.hand.map(cardIdFor).join(", ")}`
    : "Hand IDs: none";
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
  renderActionLog();
}

function renderVisualShell(status) {
  const playCard = (card) => {
    playCardIdInput.value = card.id;
    runShellAction(() => controller.submitPlayCardById({ cardId: card.id }).status, "play card");
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
    fixturePreset: activeFixturePreset
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
    matchHistoryCount: context.matchHistoryCount ?? controller.getMatchHistory().length
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
  errorOutput.textContent = message;
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

function formatVisualQaResult(result) {
  const finalPhase = result.hostStatus.phase;
  const trickCount = result.played.completedTricks;
  const checks = result.verificationLog.length;
  const restoreText = result.restored
    ? ` | restored ${result.restored.host.status.viewerSeat}/${result.restored.guest.status.viewerSeat}`
    : "";
  return `Visual QA ${result.name}: ${finalPhase}, tricks ${trickCount}, checks ${checks}${restoreText}`;
}

function loadOrCreatePlayerId() {
  const key = "spadesPrototypePlayerId";
  const existing = localStorage.getItem(key);
  if (existing) return existing;

  const nextId = `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(key, nextId);
  return nextId;
}
