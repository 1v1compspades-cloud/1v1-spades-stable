import { setupInfoPanel } from "./info-panel.js";
import { clearSavedActiveRoom, loadSavedActiveRoom } from "./local-room-session.js";

const quickMatchButton = document.querySelector("#quickMatchButton");
const cancelQuickMatchButton = document.querySelector("#cancelQuickMatchButton");
const leaveCurrentRoomButton = document.querySelector("#leaveCurrentRoomButton");
const quickMatchStatus = document.querySelector("#quickMatchStatus");
const homeJoinRoomCode = document.querySelector("#homeJoinRoomCode");
const homeJoinRoomButton = document.querySelector("#homeJoinRoomButton");
const createRoomLink = document.querySelector("#createRoomLink");
const playerNameInput = document.querySelector("#playerNameInput");
const modeSelect = document.querySelector("#modeSelect");
const scoreLimitSelect = document.querySelector("#scoreLimitSelect");
const stickDealerToggle = document.querySelector("#stickDealerToggle");
const homepageAdminCode = document.querySelector("#homepageAdminCode");
const unlockAdminButton = document.querySelector("#unlockAdminButton");
const homepageAdminStatus = document.querySelector("#homepageAdminStatus");
const homepageAdminControls = document.querySelector("#homepageAdminControls");
const homepageAdminAccessKey = "euchreHomepageAdminUnlocked";
const homepageSettingsKey = "euchreHomepageSettings";
const homepageAdminCodeValue = "Zxcvfdsaqwer1287!";
const guestPlayerIdKey = "euchre.guestPlayerId";
const accountProfileKey = "euchre.accountProfile";
const quickMatchQueueKey = "euchre.quickMatchQueue";
let quickMatchPollHandle = null;
let fallbackGuestPlayerId = null;
let fallbackQuickMatchQueue = null;

setupInfoPanel();

const savedSettings = loadSettings();
playerNameInput.value = savedSettings.playerName ?? "";
modeSelect.value = savedSettings.modeId ?? "communityCompetitive";
scoreLimitSelect.value = savedSettings.targetScore ?? "10";
stickDealerToggle.checked = savedSettings.stickTheDealer ?? true;

if (sessionStorage.getItem(homepageAdminAccessKey) === "true") {
  showAdminControls("Admin tournament controls unlocked.");
}

syncCreateRoomHref();
restoreQuickMatchQueue();

quickMatchButton.addEventListener("click", async () => {
  await enterQuickMatchQueue();
});

cancelQuickMatchButton.addEventListener("click", async () => {
  await cancelQuickMatchQueue();
});

leaveCurrentRoomButton?.addEventListener("click", async () => {
  await leaveCurrentRoom();
});

createRoomLink.addEventListener("click", (event) => {
  event.preventDefault();
  const playerName = requiredPlayerName();
  if (!playerName) return;

  saveSettings();
  const settings = currentMatchSettings();
  console.debug("[raceTo] selected before create", { raceTo: settings.raceTo, modeId: settings.modeId });
  window.location.href = createRoomUrl(playerName, settings);
});

homeJoinRoomButton.addEventListener("click", () => {
  const playerName = requiredPlayerName();
  if (!playerName) return;

  const roomCode = homeJoinRoomCode.value.trim().toUpperCase();

  if (!roomCode) {
    quickMatchStatus.textContent = "Enter a room code.";
    return;
  }

  saveSettings();
  window.location.href = `./room.html?room=${encodeURIComponent(roomCode)}&name=${encodeURIComponent(playerName)}`;
});

playerNameInput.addEventListener("input", handleSettingsChange);
modeSelect.addEventListener("change", handleSettingsChange);
scoreLimitSelect.addEventListener("change", handleSettingsChange);
stickDealerToggle.addEventListener("change", handleSettingsChange);

document.querySelectorAll(".home-actions a").forEach((link) => {
  link.addEventListener("click", saveSettings);
});

unlockAdminButton.addEventListener("click", () => {
  if (homepageAdminCode.value.trim() !== homepageAdminCodeValue) {
    homepageAdminControls.hidden = true;
    homepageAdminStatus.textContent = "Admin code not recognized.";
    return;
  }

  sessionStorage.setItem(homepageAdminAccessKey, "true");
  showAdminControls("Admin tournament controls unlocked.");
});

function showAdminControls(message) {
  homepageAdminControls.hidden = false;
  homepageAdminStatus.textContent = message;
}

async function enterQuickMatchQueue() {
  const playerName = requiredPlayerName();
  if (!playerName) return;

  quickMatchButton.disabled = true;
  saveSettings();

  try {
    const result = await postJson("/api/quick-match", {
      displayName: playerName,
      ...currentIdentityPayload(),
      matchSettings: currentMatchSettings()
    });
    handleQuickMatchResult(result);
  } catch (error) {
    quickMatchStatus.textContent = error.message;
    stopQuickMatchPolling();
  } finally {
    quickMatchButton.disabled = false;
  }
}

async function cancelQuickMatchQueue() {
  const savedQueue = loadQuickMatchQueue();
  if (!savedQueue?.queueId) return;

  cancelQuickMatchButton.disabled = true;
  try {
    const result = await postJson("/api/quick-match/cancel", {
      queueId: savedQueue.queueId,
      ...currentIdentityPayload()
    });
    storeQuickMatchQueue(result.queue);
    stopQuickMatchPolling();
    renderQuickMatchQueue(result.queue);
  } catch (error) {
    quickMatchStatus.textContent = error.message;
  } finally {
    cancelQuickMatchButton.disabled = false;
  }
}

async function leaveCurrentRoom() {
  const savedRoom = loadSavedActiveRoom();
  if (!savedRoom?.roomCode) {
    quickMatchStatus.textContent = "No current room saved on this device.";
    return;
  }

  try {
    const room = await fetchSavedRoom(savedRoom);
    if (roomHasStarted(room) && !window.confirm("Leave this match? You may need the invite link to rejoin.")) {
      quickMatchStatus.textContent = "Still restoring current room.";
      return;
    }
  } catch {
    // If the room no longer exists or cannot be checked, it is still safe to clear local restore data.
  }

  const cleared = clearSavedActiveRoom(localStorage, savedRoom.roomCode);
  storeQuickMatchQueue(null);
  quickMatchStatus.textContent = cleared?.roomCode
    ? `You left current room ${cleared.roomCode} on this device.`
    : "You left current room on this device.";
  window.history.replaceState(null, "", "./home.html");
}

async function fetchSavedRoom(savedRoom) {
  const identity = currentIdentityPayload();
  const query = new URLSearchParams({
    seatToken: savedRoom.seatToken ?? "",
    playerId: savedRoom.playerId ?? identity.playerId
  });
  const accountId = savedRoom.accountId ?? identity.accountId;
  if (accountId) query.set("accountId", accountId);

  const response = await fetch(`/api/rooms/${encodeURIComponent(savedRoom.roomCode)}?${query.toString()}`);
  if (!response.ok) throw new Error("Room unavailable");
  const result = await response.json();
  return result.room;
}

function roomHasStarted(room) {
  return ["playing", "hand_score", "next_round_countdown", "match_complete"].includes(room?.gameState?.phase);
}

function handleQuickMatchResult(result) {
  if (result.matched && result.matchedRoomCode) {
    storeQuickMatchQueue(null);
    renderQuickMatchQueue(null);
    stopQuickMatchPolling();
    quickMatchStatus.textContent = "Match found. Opening room...";
    window.location.href = `./room.html?room=${encodeURIComponent(result.matchedRoomCode)}`;
    return;
  }

  storeQuickMatchQueue(result.queue);
  renderQuickMatchQueue(result.queue);
  startQuickMatchPolling();
}

function restoreQuickMatchQueue() {
  const savedQueue = loadQuickMatchQueue();
  if (!savedQueue) return;

  if (savedQueue.status !== "waiting") {
    storeQuickMatchQueue(null);
    renderQuickMatchQueue(null);
    return;
  }

  renderQuickMatchQueue(savedQueue);
  enterQuickMatchQueue().catch((error) => {
    quickMatchStatus.textContent = error.message;
  });
}

function startQuickMatchPolling() {
  if (quickMatchPollHandle) return;
  quickMatchPollHandle = setInterval(() => {
    enterQuickMatchQueue().catch((error) => {
      quickMatchStatus.textContent = error.message;
    });
  }, 2500);
}

function stopQuickMatchPolling() {
  if (!quickMatchPollHandle) return;
  clearInterval(quickMatchPollHandle);
  quickMatchPollHandle = null;
}

function renderQuickMatchQueue(queue) {
  const waiting = queue?.status === "waiting";
  const matched = queue?.status === "matched";
  quickMatchButton.hidden = waiting || matched;
  cancelQuickMatchButton.hidden = !waiting;
  quickMatchStatus.textContent = quickMatchStatusFor(queue);
}

function quickMatchStatusFor(queue) {
  if (!queue) return "";
  if (queue.status === "waiting") return `Searching for a ${quickMatchRaceLabel(queue)} Quick Match. Both players must choose the same Match target.`;
  if (queue.status === "matched") return "Match found. Opening room...";
  if (queue.status === "cancelled") return "Quick Match search cancelled.";
  if (queue.status === "expired") return "Quick Match search expired. Try again.";
  return "";
}

function storeQuickMatchQueue(queue) {
  fallbackQuickMatchQueue = queue ?? null;

  if (!queue) {
    removeLocalStorage(quickMatchQueueKey);
    return;
  }
  writeLocalStorage(quickMatchQueueKey, JSON.stringify(queue));
}

function loadQuickMatchQueue() {
  try {
    const storedQueue = readLocalStorage(quickMatchQueueKey);
    return storedQueue ? JSON.parse(storedQueue) : fallbackQuickMatchQueue;
  } catch {
    return fallbackQuickMatchQueue;
  }
}

async function postJson(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }

  return payload;
}

function saveSettings() {
  const settings = currentMatchSettings();
  writeLocalStorage(homepageSettingsKey, JSON.stringify({
    playerName: playerNameInput.value.trim(),
    modeId: settings.modeId,
    targetScore: String(settings.raceTo),
    raceTo: settings.raceTo,
    stickTheDealer: settings.stickTheDealer
  }));
}

function handleSettingsChange() {
  saveSettings();
  syncCreateRoomHref();
}

function syncCreateRoomHref() {
  createRoomLink.href = createRoomUrl(playerNameInput.value.trim());
}

function createRoomUrl(playerName, settings = currentMatchSettings()) {
  const url = new URL("./room.html", window.location.href);
  url.searchParams.set("action", "create");
  if (playerName) {
    url.searchParams.set("name", playerName);
  }
  url.searchParams.set("modeId", settings.modeId);
  url.searchParams.set("raceTo", String(settings.raceTo));
  url.searchParams.set("stickTheDealer", String(settings.stickTheDealer));
  return url.toString();
}

function currentMatchSettings() {
  const modeId = modeSelect.value || "communityCompetitive";
  return {
    modeId,
    raceTo: normalizeRaceTo(scoreLimitSelect.value, modeId),
    stickTheDealer: stickDealerToggle.checked
  };
}

function normalizeRaceTo(value, modeId) {
  const raceTo = Number.parseInt(String(value ?? ""), 10);
  if ([5, 10].includes(raceTo)) return raceTo;
  return modeId === "fastGame" ? 5 : 10;
}

function requiredPlayerName() {
  const playerName = playerNameInput.value.trim();
  if (!playerName) {
    quickMatchStatus.textContent = "Enter your name to continue.";
    return null;
  }
  return playerName;
}

function currentIdentityPayload() {
  const accountId = getAccountId();
  return {
    playerId: getGuestPlayerId(),
    ...(accountId ? { accountId } : {})
  };
}

function getGuestPlayerId() {
  const existingPlayerId = readLocalStorage(guestPlayerIdKey) ?? fallbackGuestPlayerId;
  if (existingPlayerId) return existingPlayerId;

  const playerId = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  fallbackGuestPlayerId = playerId;
  writeLocalStorage(guestPlayerIdKey, playerId);
  return playerId;
}

function getAccountId() {
  try {
    const storedProfile = readLocalStorage(accountProfileKey);
    const account = storedProfile ? JSON.parse(storedProfile) : null;
    return account?.accountId ?? null;
  } catch {
    return null;
  }
}

function loadSettings() {
  try {
    const storedSettings = readLocalStorage(homepageSettingsKey);
    return storedSettings ? JSON.parse(storedSettings) : {};
  } catch {
    return {};
  }
}

function quickMatchRaceLabel(queue) {
  const raceTo = Number(queue?.matchSettings?.raceTo);
  return [5, 10].includes(raceTo) ? `Race To ${raceTo}` : "compatible";
}

function readLocalStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeLocalStorage(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
