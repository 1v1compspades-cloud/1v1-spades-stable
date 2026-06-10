const ACCOUNT_ID_PREFIX = "acct";
const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;

export function createOrUpgradeAccount(accounts, { accountId, username, displayName } = {}) {
  const existingAccount = getAccount(accounts, accountId);
  const nextUsername = normalizeUsername(username ?? existingAccount?.username ?? displayName);
  const nextDisplayName = normalizeDisplayName(displayName ?? existingAccount?.displayName ?? nextUsername);

  const usernameOwner = findAccountByUsername(accounts, nextUsername);
  if (usernameOwner && usernameOwner.accountId !== existingAccount?.accountId) {
    throw accountError(409, "Username is already taken");
  }

  const account = existingAccount
    ? {
        ...existingAccount,
        username: nextUsername,
        displayName: nextDisplayName
      }
    : {
        accountId: normalizeAccountId(accountId) ?? generateAccountId(),
        username: nextUsername,
        displayName: nextDisplayName,
        createdAt: new Date().toISOString()
      };

  return account;
}

export function getAccount(accounts, accountId) {
  const normalizedAccountId = normalizeAccountId(accountId);
  return normalizedAccountId ? accounts.get(normalizedAccountId) ?? null : null;
}

export function sanitizeAccount(account) {
  if (!account) return null;

  return {
    accountId: account.accountId,
    username: account.username,
    displayName: account.displayName,
    createdAt: account.createdAt
  };
}

export function normalizeAccountId(accountId) {
  const id = String(accountId ?? "").trim();
  return id ? id.slice(0, 80) : null;
}

function findAccountByUsername(accounts, username) {
  const normalizedUsername = normalizeUsername(username);

  for (const account of accounts.values()) {
    if (account.username.toLowerCase() === normalizedUsername.toLowerCase()) {
      return account;
    }
  }

  return null;
}

function normalizeUsername(username) {
  const value = String(username ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);

  if (!USERNAME_PATTERN.test(value)) {
    throw accountError(400, "Choose a username with 3-24 letters, numbers, or underscores");
  }

  return value;
}

function normalizeDisplayName(displayName) {
  const name = String(displayName ?? "").trim();
  if (!name) {
    throw accountError(400, "Enter a display name");
  }

  return name.slice(0, 32);
}

function generateAccountId() {
  return `${ACCOUNT_ID_PREFIX}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function accountError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
