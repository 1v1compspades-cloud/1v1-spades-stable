import { cardsEqual } from "../../../packages/euchre-core/src/index.js";
import { setupInfoPanel } from "./info-panel.js";
import { cardLabel, suitSymbol } from "./table-state.js";

const storageKey = "euchreRoomSeat";
const roomSessionsKey = "euchreRoomSeatsByRoom";
const roomSeatTokenPrefix = "euchre.room.";
const guestPlayerIdKey = "euchre.guestPlayerId";
const accountProfileKey = "euchre.accountProfile";
const homepageSettingsKey = "euchreHomepageSettings";
const elements = {
  activeRoomControls: document.querySelector("#activeRoomControls"),
  copyCodeButton: document.querySelector("#copyCodeButton"),
  copySpectatorLinkButton: document.querySelector("#copySpectatorLinkButton"),
  openInviteLinkButton: document.querySelector("#openInviteLinkButton"),
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
  player1ScoreLabel: document.querySelector("#player1ScoreLabel"),
  player2ScoreLabel: document.querySelector("#player2ScoreLabel"),
  targetScore: document.querySelector("#targetScore"),
  pregameTargetScore: document.querySelector("#pregameTargetScore"),
  player1Slot: document.querySelector("#player1Slot"),
  player2Slot: document.querySelector("#player2Slot"),
  viewerTricks: document.querySelector("#viewerTricks"),
  opponentTricks: document.querySelector("#opponentTricks"),
  viewerHand: document.querySelector("#viewerHand"),
  viewerHandTitle: document.querySelector("#viewerHandTitle"),
  opponentHand: document.querySelector("#opponentHand"),
  opponentHandTitle: document.querySelector("#opponentHandTitle"),
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
const urlRoomCode = urlParams.get("room")?.toUpperCase() ?? null;
const gamePagePhases = ["playing", "hand_score", "next_round_countdown", "match_complete"];
const isGamePage = window.location.pathname.endsWith("/game.html");
const isRoomPage = window.location.pathname.endsWith("/room.html") || !isGamePage;
let session = null;
let roomView = null;
let pollHandle = null;
let lastRaceToDebugKey = null;

setupInfoPanel();

async function createRoomFromUi() {
  const displayName = currentPlayerName();
  if (!displayName) {
    setStatus("Enter your name to continue.");
    return;
  }

  try {
    const matchSettings = currentMatchSettings();
    console.debug("[raceTo] create room request body", { matchSettings });
    const result = await api("/api/rooms", {
      method: "POST",
      body: {
        displayName,
        ...currentIdentityPayload(),
        matchSettings
      }
    });
    setSession(result.room.roomCode, result.seatToken);
    setRoom(result.room, "You are the host. Share the room link with your opponent.");
    window.history.replaceState(null, "", `./room.html?room=${encodeURIComponent(result.room.roomCode)}`);
  } catch (error) {
    setStatus(error.message);
  }
}

elements.copyCodeButton?.addEventListener("click", async () => {
  if (!roomView?.roomCode) return;

  const text = roomLinkFor(roomView.roomCode);

  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    setStatus("Room link copied.");
  } else {
    setStatus(text);
  }
});

elements.copySpectatorLinkButton?.addEventListener("click", async () => {
  if (!roomView?.roomCode) return;

  const text = spectatorLinkFor(roomView.roomCode);

  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    setStatus("Spectator link copied.");
  } else {
    setStatus(text);
  }
});

elements.openInviteLinkButton?.addEventListener("click", () => {
  if (!roomView?.roomCode) return;
  window.open(roomLinkFor(roomView.roomCode), "_blank", "noopener");
});

elements.passButton?.addEventListener("click", async () => {
  await sendAction({ type: "passTrump" });
});

elements.nextHandButton?.addEventListener("click", async () => {
  await sendAction({ type: "startNextHand" });
});

async function handleReadyClick() {
  const viewerSeat = roomView?.viewerSeat;
  const viewerReady = viewerSeat && viewerSeat !== "spectator"
    ? Boolean(roomView?.playerReady?.[viewerSeat])
    : false;
  await sendAction({ type: viewerReady ? "unready" : "ready" });
}

elements.joinAsPlayer2Button?.addEventListener("click", async () => {
  if (!roomView?.roomCode) return;
  const displayName = fallbackJoinName();
  if (!displayName) {
    setStatus("Enter your name to continue.");
    return;
  }

  try {
    const result = await api(`/api/rooms/${roomView.roomCode}/join`, {
      method: "POST",
      body: {
        displayName,
        ...currentIdentityPayload(),
        seatToken: session?.seatToken
      }
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
  clearCurrentSession();
  session = null;
  createRoomFromUi();
} else if (urlRoomCode) {
  if (urlParams.get("view") === "spectator") {
    viewRoomAsSpectator(urlRoomCode, "Spectator View. Hidden hands stay private.", { useStoredToken: false });
  } else {
    session = loadSession(urlRoomCode);
    if (session?.roomCode && session?.seatToken) {
      refreshRoom("Game restored.");
    } else {
      autoJoinRoom(urlRoomCode);
    }
  }
} else {
  session = loadLastSession();
  if (session?.roomCode && session?.seatToken) {
    refreshRoom("Game restored.");
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
        ...currentIdentityPayload(),
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
    const query = new URLSearchParams({
      seatToken: session.seatToken ?? "",
      ...currentIdentityPayload()
    });
    const result = await api(`/api/rooms/${session.roomCode}?${query.toString()}`);
    if (result.seatToken && result.room.viewerSeat !== "spectator") {
      setSession(result.room.roomCode, result.seatToken);
    }
    if (session.seatToken && result.room.viewerSeat === "spectator") {
      const roomCode = session.roomCode;
      clearStoredSession(roomCode);
      session = null;
      setRoom(result.room, "Session not recognized. Join as opponent or watch as spectator.");
      return;
    }
    setRoom(result.room, status);
  } catch (error) {
    clearStoredSession(session?.roomCode);
    session = null;
    setStatus(`${error.message}. Create a room or enter a room code to continue.`);
  }
}

async function autoJoinRoom(roomCode) {
  const storedSession = loadSession(roomCode);
  if (storedSession?.seatToken) {
    session = storedSession;
    await refreshRoom("Game restored.");
    return;
  }

  await viewRoomAsSpectator(roomCode, "Choose Join as Opponent to take the open seat, or watch as spectator.");
}

async function viewRoomAsSpectator(roomCode, status = "Spectator View. Hidden hands stay private.", { useStoredToken = true } = {}) {
  try {
    const storedSession = useStoredToken ? loadSession(roomCode) : null;
    const query = new URLSearchParams(currentIdentityPayload());
    if (storedSession?.seatToken) {
      query.set("seatToken", storedSession.seatToken);
    }
    const result = await api(`/api/rooms/${roomCode}?${query.toString()}`);
    if (result.seatToken && result.room.viewerSeat !== "spectator") {
      setSession(result.room.roomCode, result.seatToken);
    } else if (storedSession?.seatToken && result.room.viewerSeat !== "spectator") {
      session = storedSession;
    }
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
  startPolling();
  if (redirectForPage(nextRoom)) return;
  render();
  if (status) setStatus(status);
}

function redirectForPage(nextRoom) {
  if (!nextRoom?.roomCode) return false;

  const roomCode = encodeURIComponent(nextRoom.roomCode);
  const phase = nextRoom.gameState?.phase;

  if (isRoomPage && isGamePagePhase(phase)) {
    window.location.replace(`./game.html?room=${roomCode}`);
    return true;
  }

  if (isGamePage && !isGamePagePhase(phase)) {
    window.location.replace(`./room.html?room=${roomCode}`);
    return true;
  }

  return false;
}

function setSession(roomCode, seatToken) {
  const normalizedRoomCode = roomCode?.toUpperCase();
  session = {
    roomCode: normalizedRoomCode,
    seatToken,
    playerId: getGuestPlayerId(),
    accountId: getAccountId(),
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(roomSeatTokenKey(normalizedRoomCode), seatToken);
  localStorage.setItem(storageKey, JSON.stringify(session));

  const sessions = loadSessionMap();
  sessions[normalizedRoomCode] = session;
  localStorage.setItem(roomSessionsKey, JSON.stringify(sessions));
}

function isGamePagePhase(phase) {
  return gamePagePhases.includes(phase);
}

function loadSession(roomCode) {
  const normalizedRoomCode = roomCode?.toUpperCase();
  if (normalizedRoomCode) {
    const roomSeatToken = localStorage.getItem(roomSeatTokenKey(normalizedRoomCode));
    if (roomSeatToken) {
      return {
        roomCode: normalizedRoomCode,
        seatToken: roomSeatToken,
        playerId: getGuestPlayerId(),
        accountId: getAccountId(),
        updatedAt: new Date().toISOString()
      };
    }
  }

  const sessions = loadSessionMap();
  const matchingSession = normalizedRoomCode ? sessions[normalizedRoomCode] : null;

  if (matchingSession?.roomCode && matchingSession?.seatToken) {
    return matchingSession;
  }

  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    if (!stored?.roomCode || !stored?.seatToken) return null;
    if (normalizedRoomCode && stored.roomCode !== normalizedRoomCode) return null;
    return {
      ...stored,
      playerId: stored.playerId ?? getGuestPlayerId(),
      accountId: stored.accountId ?? getAccountId()
    };
  } catch {
    return null;
  }
}

function loadLastSession() {
  const currentSession = loadSession();
  if (currentSession?.roomCode && currentSession?.seatToken) return currentSession;

  const sessions = Object.values(loadSessionMap())
    .filter((candidate) => candidate?.roomCode && candidate?.seatToken)
    .sort((a, b) => Date.parse(b.updatedAt ?? 0) - Date.parse(a.updatedAt ?? 0));
  return sessions[0] ?? null;
}

function loadSessionMap() {
  try {
    const sessions = JSON.parse(localStorage.getItem(roomSessionsKey));
    return sessions && typeof sessions === "object" && !Array.isArray(sessions) ? sessions : {};
  } catch {
    return {};
  }
}

function clearCurrentSession() {
  localStorage.removeItem(storageKey);
}

function clearStoredSession(roomCode) {
  clearCurrentSession();
  if (!roomCode) return;

  const normalizedRoomCode = roomCode.toUpperCase();
  localStorage.removeItem(roomSeatTokenKey(normalizedRoomCode));
  const sessions = loadSessionMap();
  delete sessions[normalizedRoomCode];
  localStorage.setItem(roomSessionsKey, JSON.stringify(sessions));
}

function roomSeatTokenKey(roomCode) {
  return `${roomSeatTokenPrefix}${roomCode}.seatToken`;
}

function getGuestPlayerId() {
  const existingPlayerId = localStorage.getItem(guestPlayerIdKey);
  if (existingPlayerId) return existingPlayerId;

  const playerId = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(guestPlayerIdKey, playerId);
  return playerId;
}

function currentIdentityPayload() {
  const accountId = getAccountId();
  return {
    playerId: getGuestPlayerId(),
    ...(accountId ? { accountId } : {})
  };
}

function getAccountId() {
  try {
    const account = JSON.parse(localStorage.getItem(accountProfileKey));
    return account?.accountId ?? null;
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
    const settings = loadHomepageSettings();
    return settings?.playerName?.trim() || null;
  } catch {
    return null;
  }
}

function currentMatchSettings() {
  const settings = loadHomepageSettings();
  const modeId = urlParams.get("modeId") ?? urlParams.get("mode") ?? settings.modeId ?? "communityCompetitive";
  const requestedRaceTo = urlParams.get("raceTo") ?? settings.raceTo ?? settings.targetScore;
  const hasRaceTo = requestedRaceTo !== undefined
    && requestedRaceTo !== null
    && String(requestedRaceTo).trim() !== "";
  const matchSettings = {
    modeId,
    raceTo: hasRaceTo ? normalizeRaceTo(requestedRaceTo, modeId) : defaultRaceTo(modeId),
    stickTheDealer: normalizeBoolean(urlParams.get("stickTheDealer"), settings.stickTheDealer ?? true)
  };
  console.debug("[raceTo] room page create settings", {
    urlRaceTo: urlParams.get("raceTo"),
    storedRaceTo: settings.raceTo,
    targetScore: settings.targetScore,
    matchSettings
  });
  return matchSettings;
}

function loadHomepageSettings() {
  try {
    return JSON.parse(localStorage.getItem(homepageSettingsKey)) ?? {};
  } catch {
    return {};
  }
}

function normalizeRaceTo(value, modeId) {
  const raceTo = Number.parseInt(String(value ?? ""), 10);
  return [5, 10].includes(raceTo) ? raceTo : defaultRaceTo(modeId);
}

function defaultRaceTo(modeId) {
  return modeId === "fastGame" ? 5 : 10;
}

function normalizeBoolean(value, fallback) {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
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
    setHidden(elements.invitePanel, true);
    setHidden(elements.coinFlipPanel, true);
    elements.coinFlipPanel?.replaceChildren();
    setHidden(elements.trumpPanel, true);
    setDisabled(elements.nextHandButton, true);
    setHidden(elements.scoreband, true);
    setDisabled(elements.copyCodeButton, true);
    setDisabled(elements.copySpectatorLinkButton, true);
    setDisabled(elements.openInviteLinkButton, true);
    setHidden(elements.joinAsPlayer2Button, true);
    setHidden(elements.joinNameInput, true);
    setDisabled(elements.readyButton, true);
    return;
  }

  const state = roomView.gameState;
  const viewerSeat = roomView.viewerSeat;
  const opponentSeat = viewerSeat === "player1" ? "player2" : "player1";
  const playerCount = Number(roomView.players.player1) + Number(roomView.players.player2);
  const gameInterfaceActive = isGamePage && isGamePagePhase(state.phase);
  const trumpSuit = activeTrumpSuit(state);
  const raceTo = roomView.matchSettings?.raceTo ?? state.targetScore ?? 10;
  const raceToDebugKey = `${roomView.roomCode}:${roomView.matchSettings?.raceTo}:${state.targetScore}`;
  if (raceToDebugKey !== lastRaceToDebugKey) {
    console.debug("[raceTo] lobby loaded room", {
      roomCode: roomView.roomCode,
      matchSettings: roomView.matchSettings,
      targetScore: state.targetScore,
      displayedRaceTo: raceTo
    });
    lastRaceToDebugKey = raceToDebugKey;
  }

  setHidden(elements.activeRoomControls, false);
  setHidden(elements.invitePanel, false);
  setText(elements.roomCode, roomView.roomCode);
  setText(elements.viewerSeat, seatName(viewerSeat));
  setText(elements.playerStatus, `${playerCount} / 2`);
  setText(elements.currentTurn, seatName(state.currentTurn));
  setText(elements.trumpStatus, trumpLabel(trumpSuit));
  setText(elements.matchStatus, matchStatusLabel(roomView.tournamentMatch));
  setText(elements.readyStatus, readyLabel(roomView.playerReady));
  setText(elements.coinFlipWinner, seatName(roomView.coinFlipWinner));
  setText(elements.startingPosition, startingPositionLabel(roomView.startingPositionChoice));
  setText(elements.currentDealer, seatName(state.currentDealer));
  setText(elements.roomLink, roomLinkFor(roomView.roomCode));
  setText(elements.waitingNotice, waitingMessage(roomView, state, playerCount));
  setDisabled(elements.copyCodeButton, false);
  setDisabled(elements.copySpectatorLinkButton, false);
  setDisabled(elements.openInviteLinkButton, false);
  const showJoinFallback = viewerSeat === "spectator" && roomView.alreadySeated !== true && !roomView.players.player2;
  setHidden(elements.joinAsPlayer2Button, !showJoinFallback);
  setHidden(elements.joinNameInput, !showJoinFallback);
  setHidden(elements.coinFlipWinner?.closest("div"), gameInterfaceActive);
  setHidden(elements.startingPositionTile, gameInterfaceActive || !roomView.startingPositionChoice);
  setText(elements.player1Score, state.score.player1);
  setText(elements.player2Score, state.score.player2);
  setText(elements.player1ScoreLabel, getPlayerDisplayName("player1"));
  setText(elements.player2ScoreLabel, getPlayerDisplayName("player2"));
  setText(elements.targetScore, raceTo);
  setText(elements.pregameTargetScore, raceTo);
  setText(elements.player1Slot, roomView.players.player1 ? readySeatLabel("player1", roomView.playerReady, roomView.playerNames) : "Waiting");
  setText(elements.player2Slot, roomView.players.player2 ? readySeatLabel("player2", roomView.playerReady, roomView.playerNames) : "Waiting");
  setText(elements.viewerHandTitle, viewerSeat === "spectator" ? "Spectator View" : handTitle(viewerSeat));
  setText(elements.opponentHandTitle, viewerSeat === "spectator" ? "Hidden Hands" : handTitle(opponentSeat));
  setText(elements.kittyCount, `${state.kittyCount} cards`);
  setText(elements.viewerTricks, viewerSeat === "spectator" ? "0 tricks" : `${state.tricksWon[viewerSeat]} tricks`);
  setText(elements.opponentTricks, viewerSeat === "spectator" ? "0 tricks" : `${state.tricksWon[opponentSeat]} tricks`);
  setHidden(elements.spectatorNotice, viewerSeat !== "spectator");
  const viewerReady = viewerSeat === "spectator" ? true : roomView.playerReady?.[viewerSeat];
  const canReady = viewerSeat !== "spectator"
    && ["waiting_for_players", "pregame_settings", "ready_countdown"].includes(state.phase);
  const showStartSequence = shouldShowStartSequence(roomView, state, playerCount);
  renderStartSequenceModal(showStartSequence, viewerSeat);
  setHidden(elements.readyButton, !canReady);
  setDisabled(elements.readyButton, !canReady);
  if (elements.readyButton) {
    elements.readyButton.onclick = canReady ? handleReadyClick : null;
    elements.readyButton.style.pointerEvents = canReady ? "auto" : "";
    elements.readyButton.textContent = viewerReady ? "Ready (Tap to Cancel)" : "Ready Up";
  }
  setHidden(elements.nextHandButton, true);
  setDisabled(elements.nextHandButton, true);
  setHidden(elements.scoreband, !gameInterfaceActive);
  setHidden(elements.roomTable, !gameInterfaceActive);
  setHidden(elements.pregamePanel, gameInterfaceActive);

  renderStatus();
  if (isGamePage) {
    renderUpcard(state.upcard);
    renderTrumpControls(state, viewerSeat);
    renderViewerHand(state, viewerSeat);
    renderOpponentHand(state, viewerSeat, opponentSeat);
    renderCurrentTrick(state);
    renderTrickHistory(state);
  }
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
  if (!elements.coinFlipPanel) return;
  elements.coinFlipPanel.replaceChildren();

  if (!showStartSequence) {
    setHidden(elements.coinFlipPanel, true);
    return;
  }

  const canChoosePosition = viewerSeat === roomView.coinFlipWinner && !roomView.startingPositionChoice;
  const card = document.createElement("div");
  card.className = "coin-card";
  card.innerHTML = `
    <p class="eyebrow">Start Sequence</p>
    <h2>Coin Flip</h2>
    <p>${getPlayerDisplayName(roomView.coinFlipWinner)} won the coin flip. ${canChoosePosition ? "Choose the starting position." : "Waiting for starting position choice."}</p>
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
  setHidden(elements.coinFlipPanel, false);
}

function renderStatus() {
  const state = roomView.gameState;
  const playerCount = Number(roomView.players.player1) + Number(roomView.players.player2);

  if (state.winner) {
    setStatus(`${getPlayerDisplayName(state.winner)} wins the match.`);
  } else if (state.phase === "waiting_for_players") {
    setStatus("Waiting for opponent.");
  } else if (state.phase === "pregame_settings") {
    setStatus(`Waiting for both players. ${readyLabel(roomView.playerReady)}.`);
  } else if (state.phase === "ready_countdown") {
    setStatus(`Game starts in ${secondsUntil(state.countdownEndsAt)}.`);
  } else if (state.phase === "coin_flip") {
    setStatus(`${getPlayerDisplayName(roomView.coinFlipWinner)} won the coin flip and chooses dealer or non-dealer.`);
  } else if (state.actionPhase === "selectingTrump") {
    if (roomView.viewerSeat === "spectator") {
      setStatus("Spectator view. This room is read-only for you.");
    } else if (playerCount < 2) {
      setStatus("You are waiting for an opponent.");
    } else {
      setStatus(`${getPlayerDisplayName(state.currentTurn)} to choose or pass trump.`);
    }
  } else if (state.actionPhase === "dealer_discard") {
    setStatus(`${getPlayerDisplayName(state.dealer)} picked up the upcard and must discard one card.`);
  } else if (state.actionPhase === "playing") {
    setStatus(`${getPlayerDisplayName(state.currentTurn)} to play. Trump: ${suitName(activeTrumpSuit(state))}.`);
  } else if (state.phase === "next_round_countdown" || state.phase === "hand_score") {
    const points = state.handScore.points;
    setStatus(`Hand complete. ${scoreDeltaLabel(points)}. Next round starts in ${secondsUntil(state.nextRoundStartsAt)}.`);
  }
}

function renderTrumpControls(state, viewerSeat) {
  if (!elements.trumpPanel || !elements.trumpButtons || !elements.passButton || !elements.trumpHelp) return;
  const canAct = state.actionPhase === "selectingTrump" && viewerSeat === state.currentTurn;
  setHidden(elements.trumpPanel, state.actionPhase !== "selectingTrump");
  elements.trumpButtons.replaceChildren();
  setHidden(elements.passButton, !canAct);
  elements.passButton.disabled = !canAct || state.trumpState.forcedDealerChoice;
  elements.trumpHelp.textContent = trumpActionHelp(state, canAct);

  if (!canAct) return;

  for (const suit of state.availableTrumpSuits) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = trumpActionLabel(state, suit);
    button.addEventListener("click", () => sendAction({ type: "chooseTrump", suit }).catch((error) => setStatus(error.message)));
    elements.trumpButtons.append(button);
  }
}

function renderViewerHand(state, viewerSeat) {
  if (!elements.viewerHand) return;
  elements.viewerHand.replaceChildren();

  if (viewerSeat === "spectator") return;

  for (const card of state.viewerHand) {
    const discardable = state.actionPhase === "dealer_discard"
      && viewerSeat === state.dealer
      && state.discardableCards.some((candidate) => cardsEqual(candidate, card));
    const legal = discardable || state.playableCards.some((candidate) => cardsEqual(candidate, card));
    const button = document.createElement("button");
    button.type = "button";
    button.className = ["card", isRed(card.suit) ? "red" : "", legal ? "legal" : ""].filter(Boolean).join(" ");
    button.innerHTML = cardMarkup(card);
    button.disabled = !legal;
    button.addEventListener("click", () => sendAction({ type: discardable ? "discard" : "playCard", card }).catch((error) => setStatus(error.message)));
    elements.viewerHand.append(button);
  }
}

function renderOpponentHand(state, viewerSeat, opponentSeat) {
  if (!elements.opponentHand) return;
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
  if (!elements.upcard) return;
  elements.upcard.className = `upcard ${card && isRed(card.suit) ? "red" : ""}`;
  elements.upcard.innerHTML = card ? cardMarkup(card) : "No cards dealt";
}

function renderCurrentTrick(state) {
  if (!elements.currentTrick) return;
  elements.currentTrick.replaceChildren();

  for (const play of state.currentTrick) {
    const div = document.createElement("div");
    div.className = `card ${isRed(play.card.suit) ? "red" : ""}`;
    div.innerHTML = `<span>${getPlayerDisplayName(play.player)}</span>${cardMarkup(play.card)}`;
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
  if (!elements.trickHistory) return;
  elements.trickHistory.replaceChildren();

  for (const [index, trick] of state.completedTricks.entries()) {
    const item = document.createElement("li");
    const plays = trick.plays.map((play) => `${getPlayerDisplayName(play.player)} ${cardLabel(play.card)}`).join(", ");
    item.textContent = `Trick ${index + 1}: ${plays}. Winner: ${getPlayerDisplayName(trick.winner)}.`;
    elements.trickHistory.append(item);
  }
}

function setText(element, value) {
  if (element) element.textContent = value;
}

function setHidden(element, hidden) {
  if (!element) return;

  element.hidden = hidden;
  if (hidden) {
    element.style.display = "none";
    element.style.pointerEvents = "none";
    return;
  }

  element.style.removeProperty("display");
  element.style.removeProperty("pointer-events");
}

function setDisabled(element, disabled) {
  if (element) element.disabled = disabled;
}

function cardMarkup(card) {
  return `<span><span class="rank">${card.rank}</span><span class="suit">${suitSymbol(card.suit)}</span></span>`;
}

function setStatus(message) {
  setText(elements.roomStatus, message);
}

function seatName(seat) {
  return getPlayerDisplayName(seat);
}

function getPlayerDisplayName(seat) {
  if (seat === "spectator") return "Spectator";
  if (!["player1", "player2"].includes(seat)) return "None";

  const name = roomView?.playerNames?.[seat]?.trim();
  if (name) return name;

  if (roomView?.viewerSeat === seat) return "You";
  if (roomView?.viewerSeat === "spectator") return seat === "player1" ? "Host" : "Opponent";
  return seat === "player1" && !roomView?.viewerSeat ? "Host" : "Opponent";
}

function handTitle(seat) {
  const name = getPlayerDisplayName(seat);
  return name === "You" ? "Your Hand" : `${name}'s Hand`;
}

function scoreDeltaLabel(points = {}) {
  return ["player1", "player2"]
    .map((seat) => `${getPlayerDisplayName(seat)} +${points[seat] ?? 0}`)
    .join(", ");
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
    return "Waiting for opponent.";
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

function trumpActionHelp(state, canAct) {
  if (canAct) {
    if (state.trumpState?.forcedDealerChoice) {
      return "Stick the Dealer is active. Choose trump to continue.";
    }

    return `${getPlayerDisplayName(state.currentTurn)} to choose or pass trump.`;
  }

  if (roomView?.viewerSeat === "spectator") {
    return `${getPlayerDisplayName(state.currentTurn)} is choosing trump. Spectators cannot act.`;
  }

  return `${getPlayerDisplayName(state.currentTurn)} is choosing trump.`;
}

function trumpActionLabel(state, suit) {
  const label = `${suitSymbol(suit)} ${suitName(suit)}`;

  if (state.trumpState?.round === 1) {
    return state.currentTurn === state.trumpState.dealer
      ? `Keep ${label}`
      : `Order Up ${label}`;
  }

  return `Choose ${label}`;
}

function readyLabel(ready = {}) {
  return `${getPlayerDisplayName("player1")} ${ready.player1 ? "Ready" : "Not Ready"} / ${getPlayerDisplayName("player2")} ${ready.player2 ? "Ready" : "Not Ready"}`;
}

function readySeatLabel(seat, ready = {}, names = {}) {
  return `${names[seat] ?? getPlayerDisplayName(seat)} ${ready[seat] ? "Ready" : "Not Ready"}`;
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
