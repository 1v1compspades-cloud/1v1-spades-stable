import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

function readAccountPrivacyScaffold(): string {
  return readFileSync(
    fileURLToPath(new URL("../v11-account-privacy.ts", import.meta.url)),
    "utf8",
  );
}

function readV11AccountSchema(): string {
  return readFileSync(
    fileURLToPath(
      new URL("../../../../../lib/db/src/schema/v11-accounts.ts", import.meta.url),
    ),
    "utf8",
  );
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

  assert.equal(enabled("1"), true);
  assert.equal(enabled("true"), true);
  assert.equal(enabled("yes"), true);
  assert.equal(enabled("0"), false);
  assert.equal(enabled(undefined), false);

  const flagSource = readFileSync(
    fileURLToPath(new URL("../v11-flags.ts", import.meta.url)),
    "utf8",
  );
  assert.match(flagSource, /value === "1"/);
  assert.match(flagSource, /value === "true"/);
  assert.match(flagSource, /value === "yes"/);
});

test("v1.1 username planning uses stable normalization examples", () => {
  assert.equal(normalizeUsername(" Shaw_1 "), "shaw_1");
  assert.equal(normalizeUsername("Two Words"), "two_words");
  assert.equal(normalizeUsername("MiXeD_Case"), "mixed_case");
});

test("v1.1 account scaffold records deletion and privacy requirements", () => {
  const source = readAccountPrivacyScaffold();

  assert.match(source, /guest-play-default/);
  assert.match(source, /in-app-account-deletion/);
  assert.match(source, /delete-associated-personal-data/);
  assert.match(source, /support-email-visible/);
  assert.match(source, /historical-guest-results-unclaimed/);
});

test("v1.1 historical guest identity policy remains blocked for review", () => {
  const source = readAccountPrivacyScaffold();

  assert.match(source, /id: "historical-guest-results-unclaimed"[\s\S]*status: "blocked"/);
});

test("v1.1 account schema includes deletion and anonymization planning fields", () => {
  const source = readV11AccountSchema();

  assert.match(source, /v11AccountsTable/);
  assert.match(source, /deletionRequestedAt/);
  assert.match(source, /deletedAt/);
  assert.match(source, /emailHash/);
  assert.match(source, /metadata/);
});

test("v1.1 username schema stays separate from historical match result names", () => {
  const source = readV11AccountSchema();

  assert.match(source, /v11UsernamesTable/);
  assert.match(source, /normalizedUsername/);
  assert.match(source, /displayUsername/);
  assert.match(source, /pre-account match name is not claimable identity/);
});

test("v1.1 account API contract stays disabled by default", () => {
  const routeSource = readFileSync(
    fileURLToPath(new URL("../../routes/v11.ts", import.meta.url)),
    "utf8",
  );

  assert.match(routeSource, /\/accounts\/status/);
  assert.match(routeSource, /\/accounts\/delete/);
  assert.match(routeSource, /V11_ACCOUNTS_ENABLED/);
  assert.match(routeSource, /status\(503\)\.json\(disabledPayload/);
  assert.match(routeSource, /status\(501\)\.json/);
});
