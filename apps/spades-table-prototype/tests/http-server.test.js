import test from "node:test";
import assert from "node:assert/strict";
import { createSpadesHttpServer } from "../src/http-server.js";
import { sanitizeRoomForViewer } from "../src/room-state.js";

test("HTTP server serves hosted UI shell and keeps API routes separate", async () => {
  const fixture = await startHttpFixture();

  try {
    const home = await fixture.getText("/");
    const css = await fixture.getText("/src/styles.css");
    const client = await fixture.getText("/src/home-client.js");
    const spadesCore = await fixture.getText("/packages/spades-core/src/index.js");
    const spadesDeck = await fixture.getText("/packages/spades-core/src/deck.js");
    const shellCore = await fixture.getText("/packages/game-shell-core/src/index.js");
    const roomLifecycle = await fixture.getText("/packages/game-shell-core/src/room-lifecycle.js");
    const missingApi = await fixture.get("/api/not-found", { expectedStatus: 404 });
    const health = await fixture.get("/health");

    assert.match(home.body, /<title>Spades Master Prototype<\/title>/);
    assert.match(home.body, /id="tester-entry-panel"/);
    assert.match(home.contentType, /text\/html/);
    assert.match(css.body, /\.app-shell/);
    assert.match(css.contentType, /text\/css/);
    assert.match(client.body, /createSpadesAppController/);
    assert.match(client.contentType, /javascript/);
    assert.match(spadesCore.body, /DEFAULT_MATCH_SETTINGS/);
    assert.match(spadesCore.contentType, /javascript/);
    assert.match(spadesDeck.body, /createDeck/);
    assert.match(spadesDeck.contentType, /javascript/);
    assert.match(shellCore.body, /room-lifecycle\.js/);
    assert.match(shellCore.contentType, /javascript/);
    assert.match(roomLifecycle.body, /createTwoPlayerRoomLifecycle/);
    assert.match(roomLifecycle.contentType, /javascript/);
    assert.equal(missingApi.ok, false);
    assert.match(missingApi.error.message, /route not found/i);
    assert.equal(health.ok, true);
  } finally {
    await fixture.close();
  }
});

test("HTTP server exposes health and sanitized create join ready bid responses", async () => {
  const fixture = await startHttpFixture();

  try {
    const health = await fixture.get("/health");
    assert.deepEqual(health, {
      ok: true,
      service: "spades-table-prototype",
      transport: "http-local",
      websocket: "enabled",
      publicApiUrl: null,
      publicWebSocketUrl: null
    });

    const created = await fixture.post("/api/rooms", {
      roomCode: "HTTP01",
      displayName: "Host",
      identity: hostIdentity(),
      requestId: "create-http"
    });
    const joined = await fixture.post("/api/rooms/HTTP01/join", {
      displayName: "Guest",
      identity: guestIdentity(),
      requestId: "join-http"
    });
    const spectator = await fixture.post("/api/rooms/HTTP01/join", {
      displayName: "Viewer",
      identity: spectatorIdentity(),
      requestId: "spectator-http"
    });
    const hostReady = await fixture.post("/api/rooms/HTTP01/ready", {
      identity: hostIdentity(),
      actionId: "HTTP01:player1:ready:1"
    });
    const guestReady = await fixture.post("/api/rooms/HTTP01/ready", {
      identity: guestIdentity(),
      actionId: "HTTP01:player2:ready:1"
    });
    const bid = await fixture.post("/api/rooms/HTTP01/bid", {
      identity: hostIdentity(),
      bid: 4,
      actionId: "HTTP01:player1:bid:1"
    });

    assert.equal(created.ok, true);
    assert.equal(created.view.viewerSeat, "player1");
    assert.equal(joined.view.viewerSeat, "player2");
    assert.equal(spectator.view.viewerSeat, "spectator");
    assert.deepEqual(spectator.view.hand, []);
    assert.equal(hostReady.actionId, "HTTP01:player1:ready:1");
    assert.equal(guestReady.view.phase, "bidding");
    assert.equal(guestReady.view.hand.length, 13);
    assert.deepEqual(guestReady.spectatorView.hand, []);
    assert.equal(bid.actionId, "HTTP01:player1:bid:1");
    assert.deepEqual(bid.view.bids, { player1: "locked", player2: null });
    assert.deepEqual(bid.spectatorView.hand, []);
    assertNoSpectatorLeak(bid);
  } finally {
    await fixture.close();
  }
});

test("HTTP endpoints preserve duplicate and stale action protection", async () => {
  const fixture = await startHttpFixture();

  try {
    await readyRoom(fixture, "HTTP02");
    const first = await fixture.post("/api/rooms/HTTP02/bid", {
      identity: hostIdentity(),
      bid: 5,
      actionId: "HTTP02:player1:bid:7"
    });
    const duplicate = await fixture.post("/api/rooms/HTTP02/bid", {
      identity: hostIdentity(),
      bid: 6,
      actionId: "HTTP02:player1:bid:7"
    });
    const guestBid = await fixture.post("/api/rooms/HTTP02/bid", {
      identity: guestIdentity(),
      bid: 3,
      actionId: "HTTP02:player2:bid:1"
    });
    const stale = await fixture.post("/api/rooms/HTTP02/bid", {
      identity: hostIdentity(),
      bid: 2,
      actionId: "HTTP02:player1:bid:8"
    }, { expectedStatus: 409 });

    assert.equal(first.ok, true);
    assert.equal(duplicate.ok, true);
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.view.appliedActionCount, first.view.appliedActionCount);
    assert.equal(guestBid.view.phase, "playing");
    assert.equal(stale.ok, false);
    assert.match(stale.error.message, /Stale action expected bidding phase/);
    assert.deepEqual(stale.spectatorView.hand, []);
  } finally {
    await fixture.close();
  }
});

test("HTTP play-card endpoint returns sanitized JSON and blocks hidden hand leaks", async () => {
  const fixture = await startHttpFixture();

  try {
    await playingRoom(fixture, "HTTP03");
    const room = fixture.repository.get("HTTP03");
    const leader = room.currentTurn;
    const identity = identityForSeat(leader);
    const cardId = sanitizedView(fixture, "HTTP03", leader).playableCardStatus.cardIds[0];
    const played = await fixture.post("/api/rooms/HTTP03/play-card", {
      identity,
      cardId,
      actionId: `HTTP03:${leader}:playCard:1`
    });

    assert.equal(played.ok, true);
    assert.equal(played.view.viewerSeat, leader);
    assert.equal(played.view.hiddenHandCounts[leader], 12);
    assert.deepEqual(played.spectatorView.hand, []);
    assert.equal(played.spectatorView.currentTrick.length, 1);
    assertNoOpponentLeak(played.view);
  } finally {
    await fixture.close();
  }
});

test("HTTP leave next-hand and new-match endpoints return sanitized responses", async () => {
  const fixture = await startHttpFixture();

  try {
    await playingRoom(fixture, "HTTP04", {
      deck: player1WinsEveryTrickDeck(),
      matchSettings: { targetScore: 500 }
    });
    await completeHandThroughHttp(fixture, "HTTP04");
    assert.equal(fixture.repository.get("HTTP04").phase, "hand_complete");

    const next = await fixture.post("/api/rooms/HTTP04/next-hand", {
      identity: hostIdentity(),
      actionId: "HTTP04:player1:nextHand:1"
    });

    assert.equal(next.ok, true);
    assert.equal(next.view.phase, "bidding");
    assert.deepEqual(next.spectatorView.hand, []);

    await playingRoom(fixture, "HTTP05", {
      deck: player1WinsEveryTrickDeck(),
      matchSettings: { targetScore: 40 }
    });
    await completeHandThroughHttp(fixture, "HTTP05");
    assert.equal(fixture.repository.get("HTTP05").phase, "match_complete");

    const newMatch = await fixture.post("/api/rooms/HTTP05/new-match", {
      identity: hostIdentity(),
      actionId: "HTTP05:player1:newMatch:1"
    });
    const left = await fixture.post("/api/rooms/HTTP05/leave", {
      identity: hostIdentity(),
      actionId: "HTTP05:player1:leaveRoom:1"
    });

    assert.equal(newMatch.ok, true);
    assert.equal(newMatch.view.phase, "waiting");
    assert.deepEqual(newMatch.spectatorView.hand, []);
    assert.equal(left.ok, true);
    assert.equal(left.session, null);
    assert.equal(left.view.viewerSeat, "spectator");
  } finally {
    await fixture.close();
  }
});

test("HTTP Quick Match pairs players and handles duplicate and leave queue", async () => {
  const fixture = await startHttpFixture();

  try {
    const first = await fixture.post("/api/quick-match/join", {
      displayName: "Host",
      identity: hostIdentity(),
      actionId: "queue-host"
    });
    const duplicate = await fixture.post("/api/quick-match/join", {
      displayName: "Host",
      identity: hostIdentity(),
      actionId: "queue-host"
    });
    const left = await fixture.post("/api/quick-match/leave", {
      identity: hostIdentity(),
      actionId: "leave-host"
    });
    const rejoined = await fixture.post("/api/quick-match/join", {
      displayName: "Host",
      identity: hostIdentity(),
      actionId: "queue-host-2"
    });
    const matched = await fixture.post("/api/quick-match/join", {
      displayName: "Guest",
      identity: guestIdentity(),
      actionId: "queue-guest"
    });

    assert.equal(first.queue.state, "waiting");
    assert.equal(duplicate.duplicate, true);
    assert.equal(left.queue.state, "left");
    assert.equal(rejoined.queue.state, "waiting");
    assert.equal(matched.queue.state, "matched");
    assert.equal(matched.view.viewerSeat, "player2");
    assert.equal(matched.session.seat, "player2");
    assert.deepEqual(matched.spectatorView.hand, []);
    assert.equal(fixture.repository.get(matched.match.roomCode).players.player1.playerId, "host");
    assert.equal(fixture.repository.get(matched.match.roomCode).players.player2.playerId, "guest");
  } finally {
    await fixture.close();
  }
});

test("HTTP account and leaderboard preview endpoints record completed free-play matches once", async () => {
  const fixture = await startHttpFixture();

  try {
    await playingRoom(fixture, "HTTP06", {
      deck: player1WinsEveryTrickDeck(),
      matchSettings: { targetScore: 40 }
    });
    const finalAction = await completeHandThroughHttp(fixture, "HTTP06");
    assert.equal(fixture.repository.get("HTTP06").phase, "match_complete");

    const hostStats = await fixture.get("/api/accounts/host/stats");
    const guestStats = await fixture.get("/api/accounts/guest/stats");
    const leaderboard = await fixture.get("/api/leaderboards/local?limit=5");

    assert.equal(hostStats.ok, true);
    assert.equal(hostStats.freePlayOnly, true);
    assert.equal(hostStats.stats.playerId, "host");
    assert.equal(hostStats.stats.gamesPlayed, 1);
    assert.equal(hostStats.stats.wins, 1);
    assert.equal(guestStats.stats.losses, 1);
    assert.equal(leaderboard.ok, true);
    assert.equal(leaderboard.scope, "server-preview");
    assert.deepEqual(leaderboard.leaderboard.map((row) => row.playerId), ["host", "guest"]);
    assertNoPrivateStatsLeak(hostStats);
    assertNoPrivateStatsLeak(leaderboard);

    await fixture.post("/api/rooms/HTTP06/play-card", {
      identity: identityForSeat(finalAction.seat),
      cardId: finalAction.cardId,
      actionId: finalAction.actionId
    });
    const afterDuplicate = await fixture.get("/api/accounts/host/stats");
    assert.equal(afterDuplicate.stats.gamesPlayed, 1);
  } finally {
    await fixture.close();
  }
});

async function startHttpFixture() {
  const { app, repository, accountStatsStore } = createSpadesHttpServer();
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  return {
    repository,
    accountStatsStore,
    get(path, options) {
      return requestJson(`${baseUrl}${path}`, undefined, options);
    },
    async getText(path, { expectedStatus = 200 } = {}) {
      const response = await fetch(`${baseUrl}${path}`);
      const body = await response.text();
      assert.equal(response.status, expectedStatus, body);
      return {
        body,
        contentType: response.headers.get("content-type") ?? ""
      };
    },
    post(path, body, options) {
      return requestJson(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(body)
      }, options);
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  };
}

async function requestJson(url, init, { expectedStatus = 200 } = {}) {
  const response = await fetch(url, init);
  const json = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(json));
  return json;
}

async function readyRoom(fixture, roomCode, options = {}) {
  await fixture.post("/api/rooms", {
    roomCode,
    identity: hostIdentity(),
    matchSettings: options.matchSettings,
    deck: options.deck
  });
  await fixture.post(`/api/rooms/${roomCode}/join`, {
    identity: guestIdentity()
  });
  await fixture.post(`/api/rooms/${roomCode}/ready`, {
    identity: hostIdentity(),
    actionId: `${roomCode}:player1:ready:1`
  });
  await fixture.post(`/api/rooms/${roomCode}/ready`, {
    identity: guestIdentity(),
    actionId: `${roomCode}:player2:ready:1`
  });
}

async function playingRoom(fixture, roomCode, options = {}) {
  await readyRoom(fixture, roomCode, options);
  await fixture.post(`/api/rooms/${roomCode}/bid`, {
    identity: hostIdentity(),
    bid: 4,
    actionId: `${roomCode}:player1:bid:1`
  });
  await fixture.post(`/api/rooms/${roomCode}/bid`, {
    identity: guestIdentity(),
    bid: 3,
    actionId: `${roomCode}:player2:bid:1`
  });
}

async function completeHandThroughHttp(fixture, roomCode) {
  let sequence = 1;
  let lastAction = null;
  while (fixture.repository.get(roomCode).phase === "playing") {
    const seat = fixture.repository.get(roomCode).currentTurn;
    const cardId = sanitizedView(fixture, roomCode, seat).playableCardStatus.cardIds[0];
    const actionId = `${roomCode}:${seat}:playCard:${sequence}`;
    await fixture.post(`/api/rooms/${roomCode}/play-card`, {
      identity: identityForSeat(seat),
      cardId,
      actionId
    });
    lastAction = { seat, cardId, actionId };
    sequence += 1;
  }
  return lastAction;
}

function sanitizedView(fixture, roomCode, seat) {
  return sanitizeRoomForViewer(fixture.repository.get(roomCode), identityForSeat(seat));
}

function hostIdentity() {
  return { playerId: "host", seatToken: "seat-host" };
}

function guestIdentity() {
  return { playerId: "guest", seatToken: "seat-guest" };
}

function spectatorIdentity() {
  return { playerId: "viewer", seatToken: "seat-viewer" };
}

function identityForSeat(seat) {
  return seat === "player1" ? hostIdentity() : guestIdentity();
}

function assertNoSpectatorLeak(payload) {
  assert.deepEqual(payload.spectatorView.hand, []);
  assert.equal(payload.spectatorView.viewerSeat, "spectator");
}

function assertNoOpponentLeak(view) {
  const viewerCount = view.hiddenHandCounts[view.viewerSeat];
  const opponent = view.viewerSeat === "player1" ? "player2" : "player1";
  assert.equal(view.hand.length, viewerCount);
  assert.notEqual(view.hiddenHandCounts[opponent], undefined);
}

function assertNoPrivateStatsLeak(payload) {
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /seat-host|seat-guest|seatToken|hand|cardIds|currentTrick/);
}

function player1WinsEveryTrickDeck() {
  return [
    ...cards("spades", ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"]),
    ...cards("clubs", ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"]),
    ...cards("hearts", ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]),
    ...cards("diamonds", ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"])
  ];
}

function cards(suit, ranks) {
  return ranks.map((rank) => ({ rank, suit }));
}
