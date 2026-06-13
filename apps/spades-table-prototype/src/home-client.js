import { createSpadesAppController } from "./app-controller.js";
import { createTwoSeatManualHarness } from "./manual-harness.js";
import { renderRoomShellText } from "./room-shell.js";

const controller = createSpadesAppController({
  createPlayerId: loadOrCreatePlayerId
});

const displayNameInput = document.querySelector("#display-name");
const joinCodeInput = document.querySelector("#join-code");
const statusOutput = document.querySelector("#room-status");
const bidStatusOutput = document.querySelector("#bid-status");
const handStatusOutput = document.querySelector("#hand-status");
const playableStatusOutput = document.querySelector("#playable-status");
const trickStatusOutput = document.querySelector("#trick-status");
const handSummaryOutput = document.querySelector("#hand-summary");
const errorOutput = document.querySelector("#shell-error");
const bidInput = document.querySelector("#bid-input");
const playCardIdInput = document.querySelector("#play-card-id");
const manualStatusOutput = document.querySelector("#manual-status");
const manualHarness = createTwoSeatManualHarness();

document.querySelector("#create-room").addEventListener("click", () => {
  runShellAction(() => controller.createRoom({
    displayName: displayNameInput.value || "Player"
  }).status);
});

document.querySelector("#join-room").addEventListener("click", () => {
  runShellAction(() => controller.joinRoom({
    roomCode: joinCodeInput.value,
    displayName: displayNameInput.value || "Player"
  }).status);
});

document.querySelector("#restore-room").addEventListener("click", () => {
  runShellAction(() => controller.restoreActiveRoom().status);
});

document.querySelector("#clear-room").addEventListener("click", () => {
  controller.clearActiveRoom();
  renderStatus(null);
});

document.querySelector("#ready-player").addEventListener("click", () => {
  runShellAction(() => controller.readyPlayer().status);
});

document.querySelector("#leave-room").addEventListener("click", () => {
  runShellAction(() => controller.leaveRoom().status);
});

document.querySelector("#submit-bid").addEventListener("click", () => {
  runShellAction(() => controller.submitBid({
    bid: Number(bidInput.value)
  }).status);
});

document.querySelector("#submit-nil").addEventListener("click", () => {
  bidInput.value = "0";
  runShellAction(() => controller.submitBid({ bid: 0 }).status);
});

document.querySelector("#submit-play-card").addEventListener("click", () => {
  runShellAction(() => controller.submitPlayCardById({
    cardId: playCardIdInput.value
  }).status);
});

document.querySelector("#play-full-hand").addEventListener("click", () => {
  runShellAction(() => controller.playFullHand().status);
});

document.querySelector("#start-next-hand").addEventListener("click", () => {
  runShellAction(() => controller.startNextHand().status);
});

document.querySelector("#manual-setup").addEventListener("click", () => {
  manualHarness.setup();
  renderManualStatus();
});

document.querySelector("#manual-ready").addEventListener("click", () => {
  manualHarness.readyBoth();
  renderManualStatus();
});

document.querySelector("#manual-bid").addEventListener("click", () => {
  manualHarness.bidBoth();
  renderManualStatus(manualHarness.guest);
});

document.querySelector("#manual-trick").addEventListener("click", () => {
  manualHarness.playOneTrick();
  renderManualStatus(manualHarness.guest);
});

document.querySelector("#manual-full-hand").addEventListener("click", () => {
  manualHarness.playFullHand();
  renderManualStatus(manualHarness.guest);
});

document.querySelector("#manual-next-hand").addEventListener("click", () => {
  manualHarness.startNextHand();
  renderManualStatus();
});

renderStatus(controller.restoreActiveRoom().status);

function runShellAction(action) {
  try {
    clearError();
    renderStatus(action());
  } catch (error) {
    showError(error?.message ?? "Action failed");
  }
}

function renderStatus(status) {
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
}

function renderManualStatus(controllerForView = manualHarness.host) {
  manualStatusOutput.textContent = manualHarness.statusText(controllerForView);
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

function loadOrCreatePlayerId() {
  const key = "spadesPrototypePlayerId";
  const existing = localStorage.getItem(key);
  if (existing) return existing;

  const nextId = `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(key, nextId);
  return nextId;
}
