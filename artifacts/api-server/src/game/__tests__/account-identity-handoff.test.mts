import { test } from "node:test";
import assert from "node:assert/strict";
import { createRoom, joinRoom } from "../engine.ts";

test("guest create and join still work without account identity", () => {
  const room = createRoom("Guest Host", "sock-guest-host");
  const joined = joinRoom(room.roomCode, "Guest Two", "sock-guest-two");

  assert.equal(joined.playerIndex, 1);
  assert.equal(joined.state.players[0]?.name, "Guest Host");
  assert.equal(joined.state.players[1]?.name, "Guest Two");
  assert.equal(joined.state.players[0]?.accountId ?? null, null);
  assert.equal(joined.state.players[1]?.accountId ?? null, null);
  assert.equal(joined.state.players[0]?.rankedIdentityValidated, false);
  assert.equal(joined.state.players[1]?.rankedIdentityValidated, false);
  assert.equal(joined.state.matchKind, "casual");
  assert.equal(joined.state.leaderboardEligible, false);
});

test("account identity attaches to seated players when provided", () => {
  const room = createRoom(
    "Account Host",
    "sock-account-host",
    250,
    undefined,
    "quick",
    undefined,
    "HostProfile",
    { accountId: "acct-host", accountUsername: "HostUser" },
  );
  const joined = joinRoom(
    room.roomCode,
    "Account Guest",
    "sock-account-guest",
    "GuestProfile",
    { accountId: "acct-guest", accountUsername: "GuestUser" },
  );

  assert.equal(joined.state.players[0]?.accountId, "acct-host");
  assert.equal(joined.state.players[0]?.accountUsername, "HostUser");
  assert.equal(joined.state.players[1]?.accountId, "acct-guest");
  assert.equal(joined.state.players[1]?.accountUsername, "GuestUser");
  assert.equal(joined.state.players[0]?.rankedIdentityValidated, false);
  assert.equal(joined.state.players[1]?.rankedIdentityValidated, false);
  assert.equal(joined.state.players[0]?.profileUsername, "HostProfile");
  assert.equal(joined.state.players[1]?.profileUsername, "GuestProfile");
});

test("ranked metadata is opt-in and does not affect seating", () => {
  const room = createRoom(
    "Ranked Host",
    "sock-ranked-host",
    250,
    "Find Match",
    "quick",
    undefined,
    "RankedHost",
    { accountId: "acct-ranked-host", accountUsername: "RankedHost", validatedRanked: true },
    { matchKind: "ranked", leaderboardEligible: true },
  );

  const joined = joinRoom(
    room.roomCode,
    "Ranked Guest",
    "sock-ranked-guest",
    "RankedGuest",
    { accountId: "acct-ranked-guest", accountUsername: "RankedGuest", validatedRanked: true },
  );

  assert.equal(joined.playerIndex, 1);
  assert.equal(joined.state.mode, "quick");
  assert.equal(joined.state.matchKind, "ranked");
  assert.equal(joined.state.leaderboardEligible, true);
  assert.equal(joined.state.players[0]?.accountId, "acct-ranked-host");
  assert.equal(joined.state.players[1]?.accountId, "acct-ranked-guest");
  assert.equal(joined.state.players[0]?.rankedIdentityValidated, true);
  assert.equal(joined.state.players[1]?.rankedIdentityValidated, true);
});
