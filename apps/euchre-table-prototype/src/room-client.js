import { cardsEqual } from "../../../packages/euchre-core/src/index.js";
import { cardLabel, suitSymbol } from "./table-state.js";

const storageKey = "euchreRoomSeat";
const homepageSettingsKey = "euchreHomepageSettings";
const elements = {
  activeRoomControls: document.querySelector("#activeRoomControls"),
  copyCodeButton: document.querySelector("#copyCodeButton"),
  copySpectatorLinkButton: document.querySelector("#copySpectatorLinkButton"),
  nextHandButton: document.querySelector("#nextHandButton"),
  roomStatus: document.querySelector("#roomStatus"),
  roomCode: document.querySelector("#roomCode"),
  viewerSeat: document.querySelector("#viewerSeat"),
  playerStatus: document.querySelector("#playerStatus"),
  currentTurn: document.querySelector("#currentTurn"),
  trumpStatus: document.querySelector("#trumpStatus"),
  matchStatus: document.querySelector("#matchStatus"),
  readyStatus: document.querySelector("#readyStatus"),
  coinFlipWinner: document.querySelector("#coinFlipWinner"),
  startingPositionTile: document.querySelector("#startingPositionTile"),
  startingPosition: document.querySelector("#startingPosition"),
  currentDealer: document.querySelector("#currentDealer"),
  invitePanel: document.querySelector("#invitePanel"),
  roomLink: document.querySelector("#roomLink"),
  waitingNotice: document.querySelector("#waitingNotice"),
  joinNameInput: document.querySelector("#joinNameInput"),
  joinAsPlayer2Button: document.querySelector("#joinAsPlayer2Button"),
  coinFlipPanel: document.querySelector("#coinFlipPanel"),
  readyButton: document.querySelector("#readyButton"),
  scoreband: document.querySelector("#scoreband"),
  player1Score: document.querySelector("#player1Score"),
  player2Score: document.querySelector("#player2Score"),
  targetScore: document.querySelector("#targetScore"),
  pregameTargetScore: document.querySelector("#pregameTargetScore"),
  player1Slot: document.querySelector("#player1Slot"),
  player2Slot: document.querySelector("#player2Slot"),
  viewerTricks: document.querySelector("#viewerTricks"),
  opponentTricks: document.querySelector("#opponentTricks"),
  viewerHand: document.querySelector("#viewerHand"),
  opponentHand: document.querySelector("#opponentHand"),
  roomTable: document.querySelector("#roomTable"),
  pregamePanel: document.querySelector("#pregamePanel"),
  spectatorNotice: document.querySelector("#spectatorNotice"),
  kittyCount: document.querySelector("#kittyCount"),
  upcard: document.querySelector("#upcard"),
  trumpPanel: document.querySelector("#trumpPanel"),
  trumpHelp: document.querySelector("#trumpHelp"),
  trumpButtons: document.querySelector("#trumpButtons"),
  passButton: document.querySelector("#passButton"),
  currentTrick: document.querySelector("#currentTrick"),
  trickHistory: document.querySelector("#trickHistory")
};

const urlParams = new URL(window.location.href).searchParams;
let session = loadSession();
let roomView = null;
let pollHandle = null;

async function createRoomFromUi() {
  const displayName = currentPlayerName();
  if (!displayName) {
    setStatus("Enter your name to continue.");
    return;
  }

  try {
    const result = await api("/api/rooms", {
      method: "POST",
      body: { displayName }
    });
    setSession(result.room.roomCode, result.seatToken);
    setRoom(result.room, "You are Player 1. Share the room code with Player 2.");
    window.history.replaceState(null, "", `./room.html?room=${encodeURIComponent(result.room.roomCode)}`);
  } catch (error) {
    setStatus(error.message);
  }
}

elements.copyCodeButton.addEventListener("click", async () => {
  if (!roomView?.roomCode) return;

  const text = roomLinkFor(roomView.roomCode);

  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    setStatus("Room link copied.");
  } else {
    setStatus(text);
  }
});

elements.copySpectatorLinkButton.addEventListener("click", async () => {
  if (!roomView?.roomCode) return;

  const text = spectatorLinkFor(roomView.roomCode);

  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    setStatus("Spectator link copied.");
  } else {
    setStatus(text);
  }
});

elements.passButton.addEventListener("click", async () => {
  await sendAction({ type: "passTrump" });
});

elements.nextHandButton.addEventListener("click", async () => {
  await sendAction({ type: "startNextHand" });
});

elements.readyButton.addEventListener("click", async () => {
  const viewerSeat = roomView?.viewerSeat;
  const viewerReady = viewerSeat && viewerSeat !== "spectator"
    ? Boolean(roomView?.playerReady?.[viewerSeat])
    : false;
  await sendAction({ type: viewerReady ? "unready" : "ready" });
});

elements.joinAsPlayer2Button.addEventListener("click", async () => {
  if (!roomView?.roomCode) return;
  const displayName = fallbackJoinName();
  if (!displayName) {
    setStatus("Enter your name to continue.");
    return;
  }

  try {
    const result = await api(`/api/rooms/${roomView.roomCode}/join`, {
      method: "POST",
      body: { displayName }
    });
    setSession(result.room.roomCode, result.seatToken);
    setRoom(result.room, `You are ${seatName(result.seat)}.`);
  } catch (error) {
    setStatus(error.message);
  }
});

window.addEventListener("beforeunload", () => {
  if (pollHandle) clearInterval(pollHandle);
});

if (urlParams.get("action") === "create") {
  localStorage.removeItem(storageKey);
  session = null;
  createRoomFromUi();
} else if (session?.roomCode && session?.seatToken) {
  refreshRoom("Reconnected from this browser.");
} else {
  const urlRoomCode = urlParams.get("room");
  if (urlRoomCode) {
    if (urlParams.get("view") === "spectator") {
      viewRoomAsSpectator(urlRoomCode.toUpperCase());
    } else {
      autoJoinRoom(urlRoomCode.toUpperCase());
    }
  }
}

render();

async function sendAction(action) {
  if (!session?.roomCode || !session?.seatToken) {
    setStatus("Join this room before taking a player action.");
    return;
  }

  try {
    const result = await api(`/api/rooms/${session.roomCode}/actions`, {
      method: "POST",
      body: {
        seatToken: session.seatToken,
        ...action
      }
    });
    setRoom(result.room);
  } catch (error) {
    setStatus(error.message);
  }
}

async function refreshRoom(status) {
  if (!session?.roomCode) return;

  try {
    const result = await api(`/api/rooms/${session.roomCode}?seatToken=${encodeURIComponent(session.seatToken ?? "")}`);
    setRoom(result.room, status);
  } catch (error) {
    localStorage.removeItem(storageKey);
    session = null;
    setStatus(`${error.message}. Create a room or enter a room code to continue.`);
  }
}

async function autoJoinRoom(roomCode) {
  const displayName = currentPlayerName();
  if (!displayName) {
    await viewRoomAsSpectator(roomCode, "Enter your name to continue.");
    return;
  }

  try {
    const result = await api(`/api/rooms/${roomCode}/join`, {
      method: "POST",
      body: { displayName }
    });
    setSession(result.room.roomCode, result.seatToken);
    setRoom(result.room, `You are ${seatName(result.seat)}.`);
  } catch (error) {
    try {
      await viewRoomAsSpectator(roomCode, "Spectator View. Both player seats are already taken.");
    } catch {
      setStatus(error.message);
    }
  }
}

async function viewRoomAsSpectator(roomCode, status = "Spectator View. Hidden hands stay private.") {
  try {
    const result = await api(`/api/rooms/${roomCode}`);
    setRoom(result.room, status);
  } catch (error) {
    setStatus(error.message);
  }
}

async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }

  return payload;
}

function setRoom(nextRoom, status) {
  roomView = nextRoom;
  if (status) setStatus(status);
  startPolling();
  render();
}

function setSession(roomCode, seatToken) {
  session = { roomCode, seatToken };
  localStorage.setItem(storageKey, JSON.stringify(session));
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

function currentPlayerName() {
  const urlName = urlParams.get("name")?.trim();
  if (urlName) {
    savePlayerName(urlName);
    return urlName;
  }

  try {
    const settings = JSON.parse(localStorage.getItem(homepageSettingsKey));
    return settings?.playerName?.trim() || null;
  } catch {
    return null;
  }
}

function fallbackJoinName() {
  const name = elements.joinNameInput.value.trim() || currentPlayerName();
  if (name) savePlayerName(name);
  return name || null;
}

function savePlayerName(playerName) {
  let settings = {};
  try {
    settings = JSON.parse(localStorage.getItem(homepageSettingsKey)) ?? {};
  } catch {
    settings = {};
  }
  localStorage.setItem(homepageSettingsKey, JSON.stringify({
    ...settings,
    playerName: playerName.trim()
  }));
}

function startPolling() {
  if (pollHandle) return;
  pollHandle = setInterval(() => {
    refreshRoom().catch((error) => setStatus(error.message));
  }, 1500);
}

function render() {
  if (!roomView) {
    elements.invitePanel.hidden = true;
    elements.coinFlipPanel.hidden = true;
    elements.coinFlipPanel.replaceChildren();
    elements.trumpPanel.hidden = true;
    elements.nextHandButton.disabled = true;
    elements.scoreband.hidden = true;
    elements.copyCodeButton.disabled = true;
    elements.copySpectatorLinkButton.disabled = true;
    elements.joinAsPlayer2Button.hidden = true;
    elements.joinNameInput.hidden = true;
    elements.readyButton.disabled = true;
    return;
  }

  const state = roomView.gameState;
  const viewerSeat = roomView.viewerSeat;
  const opponentSeat = viewerSeat === "player1" ? "player2" : "player1";
  const playerCount = Number(roomView.players.player1) + Number(roomView.players.player2);
  const gameInterfaceActive = state.phase === "playing";
  const trumpSuit = activeTrumpSuit(state);

  elements.activeRoomControls.hidden = false;
  elements.invitePanel.hidden = false;
  elements.roomCode.textContent = roomView.roomCode;
  elements.viewerSeat.textContent = seatName(viewerSeat);
  elements.playerStatus.textContent = `${playerCount} / 2`;
  elements.currentTurn.textContent = seatName(state.currentTurn);
  elements.trumpStatus.textContent = trumpLabel(trumpSuit);
  elements.matchStatus.textContent = matchStatusLabel(roomView.tournamentMatch);
  elements.readyStatus.textContent = readyLabel(roomView.playerReady);
  elements.coinFlipWinner.textContent = seatName(roomView.coinFlipWinner);
  elements.startingPosition.textContent = startingPositionLabel(roomView.startingPositionChoice);
  elements.currentDealer.textContent = seatName(state.currentDealer);
  elements.roomLink.textContent = roomLinkFor(roomView.roomCode);
  elements.waitingNotice.textContent = waitingMessage(roomView, state, playerCount);
  elements.copyCodeButton.disabled = false;
  elements.copySpectatorLinkButton.disabled = false;
  const showJoinFallback = viewerSeat === "spectator" && !roomView.players.player2;
  elements.joinAsPlayer2Button.hidden = !showJoinFallback;
  elements.joinNameInput.hidden = !showJoinFallback;
  elements.coinFlipWinner.closest("div").hidden = gameInterfaceActive;
  elements.startingPositionTile.hidden = gameInterfaceActive || !roomView.startingPositionChoice;
  elements.player1Score.textContent = state.score.player1;
  elements.player2Score.textContent = state.score.player2;
  elements.targetScore.textContent = state.targetScore;
  elements.pregameTargetScore.textContent = state.targetScore;
  elements.player1Slot.textContent = roomView.players.player1 ? readySeatLabel("player1", roomView.playerReady, roomView.playerNames) : "Waiting";
  elements.player2Slot.textContent = roomView.players.player2 ? readySeatLabel("player2", roomView.playerReady, roomView.playerNames) : "Waiting";
  elements.kittyCount.textContent = `${state.kittyCount} cards`;
  elements.viewerTricks.textContent = viewerSeat === "spectator" ? "0 tricks" : `${state.tricksWon[viewerSeat]} tricks`;
  elements.opponentTricks.textContent = viewerSeat === "spectator" ? "0 tricks" : `${state.tricksWon[opponentSeat]} tricks`;
  elements.spectatorNotice.hidden = viewerSeat !== "spectator";
  const viewerReady = viewerSeat === "spectator" ? true : roomView.playerReady?.[viewerSeat];
  const canReady = viewerSeat !== "spectator"
    && ["waiting_for_players", "pregame_settings", "ready_countdown"].includes(state.phase);
  const showStartSequence = shouldShowStartSequence(roomView, state, playerCount);
  renderStartSequenceModal(showStartSequence, viewerSeat);
  elements.readyButton.hidden = !canReady;
  elements.readyButton.disabled = !canReady;
  elements.readyButton.textContent = viewerReady ? "Ready (Tap to Cancel)" : "Ready Up";
  elements.nextHandButton.hidden = true;
  elements.nextHandButton.disabled = true;
  elements.scoreband.hidden = !gameInterfaceActive;
  elements.roomTable.hidden = !gameInterfaceActive;
  elements.pregamePanel.hidden = gameInterfaceActive;

  renderStatus();
  renderUpcard(state.upcard);
  renderTrumpControls(state, viewerSeat);
  renderViewerHand(state, viewerSeat);
  renderOpponentHand(state, viewerSeat, opponentSeat);
  renderCurrentTrick(state);
  renderTrickHistory(state);
}

function shouldShowStartSequence(view, state, playerCount) {
  return playerCount === 2
    && view.playerReady?.player1 === true
    && view.playerReady?.player2 === true
    && ["coin_flip", "dealer_choice"].includes(state.phase)
    && state.actionPhase === "dealer_choice"
    && Boolean(view.coinFlipWinner)
    && !view.firstDealer;
}

function renderStartSequenceModal(showStartSequence, viewerSeat) {
  elements.coinFlipPanel.replaceChildren();

  if (!showStartSequence) {
    elements.coinFlipPanel.hidden = true;
    return;
  }

  const canChoosePosition = viewerSeat === roomView.coinFlipWinner && !roomView.startingPositionChoice;
  const card = document.createElement("div");
  card.className = "coin-card";
  card.innerHTML = `
    <p class="eyebrow">Start Sequence</p>
    <h2>Coin Flip</h2>
    <p>${seatName(roomView.coinFlipWinner)} won the coin flip. ${canChoosePosition ? "Choose the starting position." : "Waiting for starting position choice."}</p>
  `;

  if (canChoosePosition) {
    const actions = document.createElement("div");
    actions.className = "coin-actions";

    const dealerButton = document.createElement("button");
    dealerButton.type = "button";
    dealerButton.textContent = "Be Dealer";
    dealerButton.addEventListener("click", () => sendAction({ type: "chooseStartingPosition", position: "dealer" }));

    const nonDealerButton = document.createElement("button");
    nonDealerButton.type = "button";
    nonDealerButton.className = "secondary";
    nonDealerButton.textContent = "Be Non-Dealer";
    nonDealerButton.addEventListener("click", () => sendAction({ type: "chooseStartingPosition", position: "non_dealer" }));

    actions.append(dealerButton, nonDealerButton);
    card.append(actions);
  }

  elements.coinFlipPanel.append(card);
  elements.coinFlipPanel.hidden = false;
}

function renderStatus() {
  const state = roomView.gameState;
  const playerCount = Number(roomView.players.player1) + Number(roomView.players.player2);

  if (state.winner) {
    setStatus(`${seatName(state.winner)} wins the match.`);
  } else if (state.phase === "waiting_for_players") {
    setStatus("Waiting for Player 2.");
  } else if (state.phase === "pregame_settings") {
    setStatus(`Waiting for both players. ${readyLabel(roomView.playerReady)}.`);
  } else if (state.phase === "ready_countdown") {
    setStatus(`Game starts in ${secondsUntil(state.countdownEndsAt)}.`);
  } else if (state.phase === "coin_flip") {
    setStatus(`${seatName(roomView.coinFlipWinner)} won the coin flip and chooses dealer or non-dealer.`);
  } else if (state.actionPhase === "selectingTrump") {
    if (roomView.viewerSeat === "spectator") {
      setStatus("Spectator view. This room is read-only for you.");
    } else if (playerCount < 2 && roomView.viewerSeat === "player1") {
      setStatus("You are Player 1. Waiting for Player 2.");
    } else if (roomView.viewerSeat === "player2") {
      setStatus(`You are Player 2. ${seatName(state.currentTurn)} to choose or pass trump.`);
    } else {
      setStatus(`${seatName(state.currentTurn)} to choose or pass trump.`);
    }
  } else if (state.actionPhase === "playing") {
    setStatus(`${seatName(state.currentTurn)} to play. Trump: ${suitName(activeTrumpSuit(state))}.`);
  } else if (state.phase === "next_round_countdown" || state.phase === "hand_score") {
    const points = state.handScore.points;
    setStatus(`Hand complete. Player 1 +${points.player1}, Player 2 +${points.player2}. Next round starts in ${secondsUntil(state.nextRoundStartsAt)}.`);
  }
}

function renderTrumpControls(state, viewerSeat) {
  const canAct = state.actionPhase === "selectingTrump" && viewerSeat === state.currentTurn;
  elements.trumpPanel.hidden = state.actionPhase !== "selectingTrump";
  elements.trumpButtons.replaceChildren();
  elements.passButton.disabled = !canAct || state.trumpState.forcedDealerChoice;
  elements.trumpHelp.textContent = canAct
    ? "Choose trump or pass. Trump may be led immediately once chosen."
    : `${seatName(state.currentTurn)} is choosing trump.`;

  if (!canAct) return;

  for (const suit of state.availableTrumpSuits) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${suitSymbol(suit)} ${suitName(suit)}`;
    button.addEventListener("click", () => sendAction({ type: "chooseTrump", suit }).catch((error) => setStatus(error.message)));
    elements.trumpButtons.append(button);
  }
}

function renderViewerHand(state, viewerSeat) {
  elements.viewerHand.replaceChildren();

  if (viewerSeat === "spectator") return;

  for (const card of state.viewerHand) {
    const legal = state.playableCards.some((candidate) => cardsEqual(candidate, card));
    const button = document.createElement("button");
    button.type = "button";
    button.className = ["card", isRed(card.suit) ? "red" : "", legal ? "legal" : ""].filter(Boolean).join(" ");
    button.innerHTML = cardMarkup(card);
    button.disabled = !legal;
    button.addEventListener("click", () => sendAction({ type: "playCard", card }).catch((error) => setStatus(error.message)));
    elements.viewerHand.append(button);
  }
}

function renderOpponentHand(state, viewerSeat, opponentSeat) {
  elements.opponentHand.replaceChildren();
  const opponentSeated = roomView.players[opponentSeat];
  const count = viewerSeat === "spectator" || !opponentSeated ? 0 : state.handCounts[opponentSeat];

  for (let index = 0; index < count; index += 1) {
    const back = document.createElement("div");
    back.className = "card card-back";
    back.textContent = "Card";
    elements.opponentHand.append(back);
  }
}

function renderUpcard(card) {
  elements.upcard.className = `upcard ${card && isRed(card.suit) ? "red" : ""}`;
  elements.upcard.innerHTML = card ? cardMarkup(card) : "No cards dealt";
}

function renderCurrentTrick(state) {
  elements.currentTrick.replaceChildren();

  for (const play of state.currentTrick) {
    const div = document.createElement("div");
    div.className = `card ${isRed(play.card.suit) ? "red" : ""}`;
    div.innerHTML = `<span>${seatName(play.player)}</span>${cardMarkup(play.card)}`;
    elements.currentTrick.append(div);
  }

  for (let index = state.currentTrick.length; index < 2; index += 1) {
    const slot = document.createElement("div");
    slot.className = "play-slot";
    slot.textContent = "Waiting";
    elements.currentTrick.append(slot);
  }
}

function renderTrickHistory(state) {
  elements.trickHistory.replaceChildren();

  for (const [index, trick] of state.completedTricks.entries()) {
    const item = document.createElement("li");
    const plays = trick.plays.map((play) => `${seatName(play.player)} ${cardLabel(play.card)}`).join(", ");
    item.textContent = `Trick ${index + 1}: ${plays}. Winner: ${seatName(trick.winner)}.`;
    elements.trickHistory.append(item);
  }
}

function cardMarkup(card) {
  return `<span><span class="rank">${card.rank}</span><span class="suit">${suitSymbol(card.suit)}</span></span>`;
}

function setStatus(message) {
  elements.roomStatus.textContent = message;
}

function seatName(seat) {
  return {
    player1: "Player 1",
    player2: "Player 2",
    spectator: "Spectator"
  }[seat] ?? "None";
}

function waitingMessage(view, state, playerCount) {
  if (view.tournamentMatch) {
    const match = view.tournamentMatch;
    return `${match.tournamentCode} ${match.matchId.toUpperCase()}: ${match.player1?.displayName ?? "TBD"} vs ${match.player2?.displayName ?? "TBD"} (${match.status}).`;
  }

  if (view.viewerSeat === "spectator") {
    return "Spectator mode: hidden hands stay private.";
  }

  if (playerCount < 2) {
    return "Waiting for Player 2.";
  }

  if (state.phase === "pregame_settings") {
    return `${readyLabel(view.playerReady)}. Waiting for both players to ready up.`;
  }

  if (state.phase === "ready_countdown") {
    return `Game starts in ${secondsUntil(state.countdownEndsAt)}.`;
  }

  if (state.phase === "coin_flip") {
    return `${seatName(view.coinFlipWinner)} won the coin flip. Waiting for dealer choice.`;
  }

  if (state.actionPhase === "selectingTrump") {
    return `${seatName(state.currentTurn)} is choosing trump.`;
  }

  if (state.actionPhase === "playing") {
    return `${seatName(state.currentTurn)} plays next.`;
  }

  if (state.phase === "next_round_countdown" || state.phase === "hand_score") {
    return `Next round starts in ${secondsUntil(state.nextRoundStartsAt)}.`;
  }

  return "Room ready.";
}

function readyLabel(ready = {}) {
  return `P1 ${ready.player1 ? "Ready" : "Not Ready"} / P2 ${ready.player2 ? "Ready" : "Not Ready"}`;
}

function readySeatLabel(seat, ready = {}, names = {}) {
  return `${names[seat] ?? seatName(seat)} ${ready[seat] ? "Ready" : "Not Ready"}`;
}

function startingPositionLabel(choice) {
  return {
    dealer: "Dealer",
    non_dealer: "Non-Dealer"
  }[choice] ?? "None";
}

function secondsUntil(isoTime) {
  if (!isoTime) return 0;
  return Math.max(0, Math.ceil((Date.parse(isoTime) - Date.now()) / 1000));
}

function matchStatusLabel(match) {
  if (!match) return "Casual";
  return `${match.matchId.toUpperCase()} ${match.status}`;
}

function roomLinkFor(roomCode) {
  if (!roomCode) return "";
  const url = new URL("/room.html", window.location.origin);
  url.search = `?room=${encodeURIComponent(roomCode)}`;
  return url.toString();
}

function spectatorLinkFor(roomCode) {
  if (!roomCode) return "";
  const url = new URL(roomLinkFor(roomCode));
  url.searchParams.set("view", "spectator");
  return url.toString();
}

function suitName(suit) {
  return suit ? suit[0].toUpperCase() + suit.slice(1) : "None";
}

function trumpLabel(suit) {
  return suit ? `Trump: ${suitName(suit)}` : "None";
}

function activeTrumpSuit(state) {
  return state.trumpSuit ?? state.trumpState?.trumpSuit ?? null;
}

function isRed(suit) {
  return suit === "hearts" || suit === "diamonds";
}
