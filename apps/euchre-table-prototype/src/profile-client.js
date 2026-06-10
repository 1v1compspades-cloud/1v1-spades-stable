import { setupInfoPanel } from "./info-panel.js";

const accountProfileKey = "euchre.accountProfile";
const guestPlayerIdKey = "euchre.guestPlayerId";
const homepageSettingsKey = "euchreHomepageSettings";

const elements = {
  form: document.querySelector("#profileForm"),
  displayName: document.querySelector("#profileDisplayName"),
  username: document.querySelector("#profileUsername"),
  displayValue: document.querySelector("#profileDisplayValue"),
  usernameValue: document.querySelector("#profileUsernameValue"),
  status: document.querySelector("#profileStatus")
};

setupInfoPanel();

const storedAccount = loadAccount();
const storedName = loadSavedPlayerName();
elements.displayName.value = storedAccount?.displayName ?? storedName ?? "";
elements.username.value = storedAccount?.username ?? usernameFromDisplayName(elements.displayName.value);
renderAccount(storedAccount);

if (storedAccount?.accountId) {
  refreshProfile(storedAccount.accountId).catch(() => {
    setStatus("Profile saved on this device.");
  });
}

elements.displayName.addEventListener("input", () => {
  if (!elements.username.value.trim()) {
    elements.username.value = usernameFromDisplayName(elements.displayName.value);
  }
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const displayName = elements.displayName.value.trim();
  const username = elements.username.value.trim() || usernameFromDisplayName(displayName);

  if (!displayName) {
    setStatus("Enter a display name.");
    return;
  }

  try {
    const account = await saveProfile({ displayName, username });
    storeAccount(account);
    savePlayerName(account.displayName);
    renderAccount(account);
    setStatus("Profile saved.");
  } catch (error) {
    setStatus(error.message);
  }
});

async function saveProfile({ displayName, username }) {
  const existingAccount = loadAccount();
  const result = await api("/api/accounts/upgrade", {
    method: "POST",
    body: {
      accountId: existingAccount?.accountId,
      playerId: getGuestPlayerId(),
      displayName,
      username
    }
  });
  return result.account;
}

async function refreshProfile(accountId) {
  const result = await api(`/api/profile?accountId=${encodeURIComponent(accountId)}`);
  storeAccount(result.account);
  renderAccount(result.account);
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

function renderAccount(account) {
  elements.displayValue.textContent = account?.displayName ?? "Guest";
  elements.usernameValue.textContent = account?.username ?? "Guest";
}

function storeAccount(account) {
  localStorage.setItem(accountProfileKey, JSON.stringify(account));
}

function loadAccount() {
  try {
    const account = JSON.parse(localStorage.getItem(accountProfileKey));
    return account?.accountId ? account : null;
  } catch {
    return null;
  }
}

function loadSavedPlayerName() {
  try {
    return JSON.parse(localStorage.getItem(homepageSettingsKey))?.playerName ?? "";
  } catch {
    return "";
  }
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
    playerName
  }));
}

function usernameFromDisplayName(displayName) {
  const username = String(displayName ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return username.length >= 3 ? username : "";
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

function setStatus(message) {
  elements.status.textContent = message;
}
