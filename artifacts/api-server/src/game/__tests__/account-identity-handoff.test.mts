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
  assert.equal(joined.state.players[0]?.profileUsername, "HostProfile");
  assert.equal(joined.state.players[1]?.profileUsername, "GuestProfile");
});
