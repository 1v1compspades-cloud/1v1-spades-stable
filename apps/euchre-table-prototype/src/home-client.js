import { setupInfoPanel } from "./info-panel.js";

const quickMatchButton = document.querySelector("#quickMatchButton");
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

quickMatchButton.addEventListener("click", async () => {
  quickMatchButton.disabled = true;
  saveSettings();

  try {
    const response = await fetch("/api/quick-match", { method: "POST" });
    const payload = await response.json();
    quickMatchStatus.textContent = payload.message ?? "Quick Match coming next.";
  } catch {
    quickMatchStatus.textContent = "Quick Match coming next.";
  } finally {
    quickMatchButton.disabled = false;
  }
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

function saveSettings() {
  const settings = currentMatchSettings();
  localStorage.setItem(homepageSettingsKey, JSON.stringify({
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

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(homepageSettingsKey)) ?? {};
  } catch {
    return {};
  }
}
