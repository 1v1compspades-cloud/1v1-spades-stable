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
  window.location.href = `./room.html?action=create&name=${encodeURIComponent(playerName)}`;
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

playerNameInput.addEventListener("input", saveSettings);
modeSelect.addEventListener("change", saveSettings);
scoreLimitSelect.addEventListener("change", saveSettings);
stickDealerToggle.addEventListener("change", saveSettings);

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
  localStorage.setItem(homepageSettingsKey, JSON.stringify({
    playerName: playerNameInput.value.trim(),
    modeId: modeSelect.value,
    targetScore: scoreLimitSelect.value,
    stickTheDealer: stickDealerToggle.checked
  }));
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
