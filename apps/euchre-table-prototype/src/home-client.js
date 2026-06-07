const quickMatchButton = document.querySelector("#quickMatchButton");
const quickMatchStatus = document.querySelector("#quickMatchStatus");
const playerNameInput = document.querySelector("#playerNameInput");
const scoreLimitSelect = document.querySelector("#scoreLimitSelect");
const stickDealerToggle = document.querySelector("#stickDealerToggle");
const homepageAdminCode = document.querySelector("#homepageAdminCode");
const unlockAdminButton = document.querySelector("#unlockAdminButton");
const homepageAdminStatus = document.querySelector("#homepageAdminStatus");
const homepageAdminControls = document.querySelector("#homepageAdminControls");
const homepageAdminAccessKey = "euchreHomepageAdminUnlocked";
const homepageSettingsKey = "euchreHomepageSettings";
const homepageAdminCodeValue = "MEHDI";

const savedSettings = loadSettings();
playerNameInput.value = savedSettings.playerName ?? "";
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

playerNameInput.addEventListener("input", saveSettings);
scoreLimitSelect.addEventListener("change", saveSettings);
stickDealerToggle.addEventListener("change", saveSettings);

document.querySelectorAll(".home-actions a").forEach((link) => {
  link.addEventListener("click", saveSettings);
});

unlockAdminButton.addEventListener("click", () => {
  if (homepageAdminCode.value.trim().toUpperCase() !== homepageAdminCodeValue) {
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
    targetScore: scoreLimitSelect.value,
    stickTheDealer: stickDealerToggle.checked
  }));
}

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(homepageSettingsKey)) ?? {};
  } catch {
    return {};
  }
}
