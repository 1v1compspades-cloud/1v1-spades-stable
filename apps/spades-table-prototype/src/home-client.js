import { createSpadesAppController } from "./app-controller.js";
import { renderRoomShellText } from "./room-shell.js";

const controller = createSpadesAppController({
  createPlayerId: loadOrCreatePlayerId
});

const displayNameInput = document.querySelector("#display-name");
const joinCodeInput = document.querySelector("#join-code");
const statusOutput = document.querySelector("#room-status");
const bidStatusOutput = document.querySelector("#bid-status");

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

renderStatus(controller.restoreActiveRoom().status);

function runShellAction(action) {
  try {
    renderStatus(action());
  } catch (error) {
    statusOutput.textContent = error?.message ?? "Action failed";
  }
}

function renderStatus(status) {
  statusOutput.textContent = status ? renderRoomShellText(status) : "No active room.";
  bidStatusOutput.textContent = status?.biddingStatus
    ? `Bid next: ${status.biddingStatus.nextBidder ?? "none"}`
    : "Bid next: none";
}

function loadOrCreatePlayerId() {
  const key = "spadesPrototypePlayerId";
  const existing = localStorage.getItem(key);
  if (existing) return existing;

  const nextId = `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(key, nextId);
  return nextId;
}
