import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const testDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(testDir, "..");

test("basic shell exposes create join ready leave and status targets", () => {
  const html = readFileSync(resolve(appDir, "index.html"), "utf8");

  assert.match(html, /id="create-room"/);
  assert.match(html, /id="join-code"/);
  assert.match(html, /id="join-room"/);
  assert.match(html, /id="restore-room"/);
  assert.match(html, /id="clear-room"/);
  assert.match(html, /id="room-status"/);
  assert.match(html, /id="bid-status"/);
  assert.match(html, /id="bid-input"/);
  assert.match(html, /id="submit-bid"/);
  assert.match(html, /id="submit-nil"/);
  assert.match(html, /id="shell-error"/);
  assert.match(html, /id="manual-setup"/);
  assert.match(html, /id="manual-ready"/);
  assert.match(html, /id="manual-bid"/);
  assert.match(html, /id="manual-trick"/);
  assert.match(html, /id="manual-status"/);
  assert.match(html, /id="hand-status"/);
  assert.match(html, /id="playable-status"/);
  assert.match(html, /id="trick-status"/);
  assert.match(html, /id="play-card-id"/);
  assert.match(html, /id="submit-play-card"/);
  assert.match(html, /id="ready-player"/);
  assert.match(html, /id="leave-room"/);
  assert.doesNotMatch(html, /card-table|leaderboard|tournament/i);
});

test("home client wires the shell through the local app controller", () => {
  const client = readFileSync(resolve(appDir, "src/home-client.js"), "utf8");

  assert.match(client, /createSpadesAppController/);
  assert.match(client, /controller\.createRoom/);
  assert.match(client, /controller\.joinRoom/);
  assert.match(client, /controller\.restoreActiveRoom/);
  assert.match(client, /controller\.readyPlayer/);
  assert.match(client, /controller\.leaveRoom/);
  assert.match(client, /controller\.submitBid/);
  assert.match(client, /controller\.submitPlayCardById/);
  assert.match(client, /createTwoSeatManualHarness/);
  assert.match(client, /showError/);
  assert.match(client, /clearError/);
  assert.match(client, /biddingStatus/);
  assert.doesNotMatch(client, /card-table|WebSocket|fetch|leaderboard|tournament/i);
  assert.doesNotMatch(client, /WebSocket|fetch|leaderboard|tournament/i);
});
