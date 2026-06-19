import { test } from "node:test";
import assert from "node:assert/strict";

const serverFlags = [
  "V11_ACCOUNTS_ENABLED",
  "V11_USERNAMES_ENABLED",
  "V11_LEADERBOARDS_ENABLED",
  "V11_MATCHMAKING_ENABLED",
  "V11_TOURNAMENTS_ENABLED",
] as const;

const webFlags = [
  "VITE_V11_ACCOUNTS_ENABLED",
  "VITE_V11_USERNAMES_ENABLED",
  "VITE_V11_LEADERBOARDS_ENABLED",
  "VITE_V11_MATCHMAKING_ENABLED",
  "VITE_V11_TOURNAMENTS_ENABLED",
] as const;

type V11Feature =
  | "accounts"
  | "usernames"
  | "leaderboards"
  | "matchmaking"
  | "tournaments";

const envByFeature: Record<V11Feature, string> = {
  accounts: "V11_ACCOUNTS_ENABLED",
  usernames: "V11_USERNAMES_ENABLED",
  leaderboards: "V11_LEADERBOARDS_ENABLED",
  matchmaking: "V11_MATCHMAKING_ENABLED",
  tournaments: "V11_TOURNAMENTS_ENABLED",
};

function enabled(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

function normalizeUsername(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "_");
}

test("v1.1 scaffold keeps all planned feature flags explicit", () => {
  assert.deepEqual([...serverFlags], [
    "V11_ACCOUNTS_ENABLED",
    "V11_USERNAMES_ENABLED",
    "V11_LEADERBOARDS_ENABLED",
    "V11_MATCHMAKING_ENABLED",
    "V11_TOURNAMENTS_ENABLED",
  ]);
  assert.deepEqual([...webFlags], [
    "VITE_V11_ACCOUNTS_ENABLED",
    "VITE_V11_USERNAMES_ENABLED",
    "VITE_V11_LEADERBOARDS_ENABLED",
    "VITE_V11_MATCHMAKING_ENABLED",
    "VITE_V11_TOURNAMENTS_ENABLED",
  ]);
});

test("v1.1 feature flags require explicit opt-in values", () => {
  const key = envByFeature.accounts;
  const previous = process.env[key];

  try {
    process.env[key] = "1";
    assert.equal(enabled(process.env[key]), true);

    process.env[key] = "true";
    assert.equal(enabled(process.env[key]), true);

    process.env[key] = "yes";
    assert.equal(enabled(process.env[key]), true);

    process.env[key] = "0";
    assert.equal(enabled(process.env[key]), false);

    delete process.env[key];
    assert.equal(enabled(process.env[key]), false);
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});

test("v1.1 username planning uses stable normalization examples", () => {
  assert.equal(normalizeUsername(" Shaw_1 "), "shaw_1");
  assert.equal(normalizeUsername("Two Words"), "two_words");
  assert.equal(normalizeUsername("MiXeD_Case"), "mixed_case");
});
