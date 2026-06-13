import { createTwoSeatManualHarness } from "./manual-harness.js";
import { buildVisualShellModel } from "./visual-shell.js";

export const VISUAL_QA_SCRIPTS = Object.freeze({
  "normal-hand": Object.freeze({
    preset: "close-game",
    description: "Play one normal local hand through visual card models."
  }),
  "nil-made": Object.freeze({
    preset: "nil-made",
    description: "Play a hand where player2 makes nil."
  }),
  "nil-failed": Object.freeze({
    preset: "nil-failed",
    description: "Play a hand where player2 fails nil."
  }),
  "bag-penalty": Object.freeze({
    preset: "bag-penalty",
    description: "Play a hand that exercises bag penalty scoring."
  }),
  "match-win": Object.freeze({
    preset: "match-win",
    description: "Play a hand that completes the match."
  }),
  "spectator-view": Object.freeze({
    preset: "close-game",
    description: "Verify spectator visual model sees public state and no hand."
  }),
  "reconnect-restore-active-room": Object.freeze({
    preset: "reconnect-after-hand",
    restoreAfterPlay: true,
    description: "Complete a hand and restore both active seats."
  })
});

export function listVisualQaScripts() {
  return Object.keys(VISUAL_QA_SCRIPTS);
}

export function runVisualQaScript(name, { roomCode = scriptRoomCode(name) } = {}) {
  const script = VISUAL_QA_SCRIPTS[name];
  if (!script) {
    throw new Error(`Unknown visual QA script: ${name}`);
  }

  const harness = createTwoSeatManualHarness({ roomCode });
  const started = harness.startPreset(script.preset);
  const verificationLog = [verifyVisualSeatViews(harness, "after-bid")];
  const played = playFullHandWithVisualCards(harness, { verificationLog });
  const restored = script.restoreAfterPlay ? {
    host: harness.host.restoreActiveRoom(),
    guest: harness.guest.restoreActiveRoom()
  } : null;

  return {
    name,
    script,
    harness,
    started,
    played,
    restored,
    verificationLog,
    hostStatus: harness.statusForView("host"),
    guestStatus: harness.statusForView("guest"),
    spectatorStatus: harness.statusForView("spectator")
  };
}

export function playFullHandWithVisualCards(harness, { verificationLog = [], maxActions = 26 } = {}) {
  let latest = null;
  let completedTricks = 0;

  for (let action = 0; action < maxActions && harness.host.getActiveRoomStatus()?.phase === "playing"; action += 1) {
    latest = playNextVisualCard(harness);
    const status = harness.host.getActiveRoomStatus();
    if (status.currentTrick.length === 0 && status.lastTrick) {
      completedTricks += 1;
      verificationLog.push(verifyVisualSeatViews(harness, `after-trick-${completedTricks}`));
    }
  }

  return {
    latest,
    completedTricks,
    hostStatus: harness.statusForView("host"),
    guestStatus: harness.statusForView("guest"),
    spectatorStatus: harness.statusForView("spectator")
  };
}

export function playNextVisualCard(harness) {
  const activeSeat = harness.host.getActiveRoomStatus().currentTurn;
  const view = activeSeat === "player1" ? "host" : "guest";
  const controller = view === "host" ? harness.host : harness.guest;
  const model = buildVisualShellModel(harness.statusForView(view));
  const card = model.handCards.find((candidate) => candidate.playable);

  if (!card) {
    throw new Error(`No visual playable card for ${view}`);
  }

  return controller.submitPlayCardById({ cardId: card.id });
}

export function verifyVisualSeatViews(harness, label = "seat-view-check") {
  const host = buildVisualShellModel(harness.statusForView("host"));
  const guest = buildVisualShellModel(harness.statusForView("guest"));
  const spectator = buildVisualShellModel(harness.statusForView("spectator"));
  const publicState = {
    roomCode: host.roomCode,
    phase: host.phase,
    currentTurn: host.currentTurn,
    bidStatus: host.bidStatus,
    currentTrick: host.currentTrick,
    lastTrick: host.lastTrick,
    scoreRows: host.scoreRows,
    bidBagRows: host.bidBagRows
  };

  assertPublicModelsMatch(publicState, guest);
  assertPublicModelsMatch(publicState, spectator);

  return {
    label,
    hostHandCount: host.handCards.length,
    guestHandCount: guest.handCards.length,
    spectatorHandCount: spectator.handCards.length,
    publicState,
    valid: host.viewerSeat === "player1"
      && guest.viewerSeat === "player2"
      && spectator.viewerSeat === "spectator"
      && spectator.handCards.length === 0
      && host.handCards.every((card) => !guest.handCards.some((other) => other.id === card.id))
  };
}

function assertPublicModelsMatch(expected, model) {
  const actual = {
    roomCode: model.roomCode,
    phase: model.phase,
    currentTurn: model.currentTurn,
    bidStatus: model.bidStatus,
    currentTrick: model.currentTrick,
    lastTrick: model.lastTrick,
    scoreRows: model.scoreRows,
    bidBagRows: model.bidBagRows
  };

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Visual public state diverged between viewer seats");
  }
}

function scriptRoomCode(name) {
  return `VQA${String(name).replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase()}`;
}
