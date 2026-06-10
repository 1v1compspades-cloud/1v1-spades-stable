const ACCOUNT_ID_PREFIX = "acct";
const USERNAME_PATTERN = /^[a-z0-9_ ]{3,24}$/;

export function createOrUpgradeAccount(accounts, { accountId, username, displayName } = {}) {
  const existingAccount = getAccount(accounts, accountId);
  const nextUsername = normalizeUsername(username ?? existingAccount?.username ?? displayName);
  const nextDisplayName = normalizeDisplayName(displayName ?? existingAccount?.displayName ?? nextUsername);

  const usernameOwner = findAccountByUsername(accounts, nextUsername);
  if (usernameOwner && usernameOwner.accountId !== existingAccount?.accountId) {
    return usernameOwner;
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

export function findAccountByIdentityName(accounts, value) {
  const normalizedValue = normalizeIdentityName(value);
  if (!normalizedValue) return null;

  for (const account of accounts.values()) {
    const names = accountIdentityNames(account);
    if (names.includes(normalizedValue)) {
      return account;
    }
  }

  return null;
}

export function accountIdentityNames(account) {
  if (!account) return [];

  return [
    normalizeIdentityName(account.username),
    normalizeIdentityName(account.displayName)
  ].filter(Boolean);
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

export function normalizeIdentityName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function findAccountByUsername(accounts, username) {
  let normalizedUsername;
  try {
    normalizedUsername = normalizeUsername(username);
  } catch {
    return null;
  }

  for (const account of accounts.values()) {
    try {
      if (normalizeUsername(account.username) === normalizedUsername) {
        return account;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function normalizeUsername(username) {
  const value = String(username ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
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
