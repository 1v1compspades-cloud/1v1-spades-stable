import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, access } from "node:fs/promises";
import http from "node:http";

const appRoot = new URL("../", import.meta.url);

test("home screen has the main routes and actions", async () => {
  const html = await readText("home.html");
  const publicActions = html.match(/<section class="home-action-panel"[\s\S]*?<\/section>/)?.[0] ?? "";

  assert.match(html, /<title>1v1 Euchre<\/title>/);
  assert.match(html, /class="master-shell home-shell"/);
  assert.match(html, /<h1>1v1 Euchre<\/h1>/);
  assert.match(html, /Season 0 Preview/);
  assert.match(publicActions, /Create Room/);
  assert.match(publicActions, /href="\.\/room\.html\?action=create"/);
  assert.match(publicActions, /Join Match/);
  assert.match(publicActions, /id="homeJoinRoomCode"/);
  assert.match(publicActions, /id="homeJoinRoomButton"/);
  assert.match(publicActions, /Quick Match/);
  assert.match(publicActions, /Rules/);
  assert.doesNotMatch(publicActions, /Create Tournament/);
  assert.match(html, /Your Name/);
  assert.match(html, /Match mode/);
  assert.match(html, /Quick Match: one head-to-head game/);
  assert.match(html, /Match target/);
  assert.match(html, /Stick the Dealer is on/);
  assert.match(html, /Hidden hands are enforced/);
  assert.match(html, /id="homepageAdminCode"/);
  assert.match(html, /id="homepageAdminControls" class="homepage-admin-controls" hidden/);
  assert.match(html, /class="home-admin-panel"/);
  assert.match(html, /Create Tournament/);
  assert.match(html, /Tournament settings/);
  assert.match(html, /Host tournament tools/);
});

test("tournament screen has create, join, lobby, and bracket sections", async () => {
  const html = await readText("tournament.html");

  assert.match(html, /Create Tournament/);
  assert.match(html, /Join Tournament/);
  assert.match(html, /Host Controls/);
  assert.match(html, /Verify Host/);
  assert.match(html, /Save it, keep it private/);
  assert.match(html, /Players only need the public tournament link\/code/);
  assert.match(html, /Start Tournament/);
  assert.match(html, /Reset Lobby/);
  assert.match(html, /Bracket size/);
  assert.match(html, /Lobby/);
  assert.match(html, /Bracket/);
  assert.match(html, /Spectator-safe/);
});

test("rules screen includes the core Euchre rule copy", async () => {
  const html = await readText("rules.html");
  const css = await readText("src/styles.css");

  assert.match(html, /24-card deck/);
  assert.match(html, /right bower/);
  assert.match(html, /left bower/);
  assert.match(html, /counts as trump/);
  assert.match(html, /led immediately/);
  assert.match(html, /coin flip determines choice/);
  assert.match(html, /first dealer or first non-dealer/);
  assert.match(html, /Dealer rotates every hand thereafter/);
  assert.match(html, /must follow/);
  assert.match(html, /First to 10/);
  assert.match(html, /Stick the Dealer is ON/);
  assert.match(html, /Fair Play/);
  assert.match(html, /Support/);
  assert.match(html, /hidden hands stay private/);
  assert.match(css, /\.shell:not\(\.master-shell\) \.rules-panel/);
  assert.match(css, /\.shell:not\(\.master-shell\) \.rules-list/);
  assert.match(css, /color: var\(--ink\)/);
});

test("one-player room lobby exposes invite controls without start sequence or create/join controls", async () => {
  const html = await readText("room.html");
  const css = await readText("src/styles.css");

  assert.doesNotMatch(html, /Create Room/);
  assert.doesNotMatch(html, /Join Room/);
  assert.doesNotMatch(html, /Be Dealer/);
  assert.doesNotMatch(html, /Be Non-Dealer/);
  assert.doesNotMatch(html, /Coin Flip/);
  assert.match(html, /id="activeRoomControls" class="master-panel lobby-panel"/);
  assert.match(html, /Room Code/);
  assert.match(html, /class="room-code-display"/);
  assert.match(html, /Copy Invite Link/);
  assert.match(html, /Copy Spectator Link/);
  assert.match(html, /Open Invite Link/);
  assert.match(html, /Invite Link/);
  assert.match(html, /Join as Player 2/);
  assert.match(html, /id="readyButton"/);
  assert.match(html, /id="readyStatus"/);
  assert.match(html, /id="pregamePanel"/);
  assert.match(html, /Match Settings/);
  assert.match(html, /Race To/);
  assert.match(html, /Stick the Dealer/);
  assert.match(html, /Hidden Hands/);
  assert.match(html, /Player 1 · Host/);
  assert.match(html, /Player 2/);
  assert.doesNotMatch(html, /id="roomTable"/);
  assert.doesNotMatch(html, /Your Hand/);
  assert.doesNotMatch(html, /Kitty \/ Upcard/);
  assert.doesNotMatch(html, /Current Trick/);
  assert.doesNotMatch(html, /Completed Tricks/);
  assert.doesNotMatch(html, /Opponent/);
  assert.doesNotMatch(html, /No cards dealt/);
  assert.match(html, /id="coinFlipWinner"/);
  assert.match(html, /id="startingPosition"/);
  assert.match(html, /id="currentDealer"/);
  assert.match(html, /class="coin-modal"/);
  assert.match(css, /\[hidden\]\s*\{[\s\S]*display: none !important/);
  assert.match(css, /\[hidden\]\s*\{[\s\S]*pointer-events: none !important/);
  assert.equal((html.match(/id="createRoomButton"/g) ?? []).length, 0);
  assert.equal((html.match(/id="joinRoomButton"/g) ?? []).length, 0);
  assert.equal((html.match(/id="joinRoomCode"/g) ?? []).length, 0);
});

test("pre-match lobby keeps gameplay interface hidden", async () => {
  const html = await readText("room.html");
  const client = await readText("src/room-client.js");

  assert.doesNotMatch(html, /id="roomTable"/);
  assert.doesNotMatch(html, /id="scoreband"/);
  assert.doesNotMatch(html, /No cards dealt/);
  assert.match(html, /id="pregamePanel" class="match-settings-panel"/);
  assert.match(html, /Player 1 · Host/);
  assert.match(html, /Waiting for player/);
  assert.match(html, /id="readyStatus"/);
  assert.match(client, /setHidden\(elements\.roomTable, !gameInterfaceActive\)/);
  assert.match(client, /setHidden\(elements\.scoreband, !gameInterfaceActive\)/);
  assert.match(client, /const gameInterfaceActive = isGamePage && isGamePagePhase\(state\.phase\)/);
});

test("game screen owns gameplay interface and is guarded until start", async () => {
  const html = await readText("game.html");
  const client = await readText("src/room-client.js");

  assert.match(html, /id="scoreband" class="scoreband" aria-label="Match score" hidden/);
  assert.match(html, /id="roomTable" class="table-grid room-table" hidden/);
  assert.match(html, /Your Hand/);
  assert.match(html, /Kitty \/ Upcard/);
  assert.match(html, /Current Trick/);
  assert.match(html, /Completed Tricks/);
  assert.match(html, /Opponent/);
  assert.match(html, /No cards dealt/);
  assert.match(client, /const gamePagePhases = \["playing", "hand_score", "next_round_countdown", "match_complete"\]/);
  assert.match(client, /function isGamePagePhase\(phase\)/);
  assert.match(client, /isRoomPage && isGamePagePhase\(phase\)/);
  assert.match(client, /\.\/game\.html\?room=\$\{roomCode\}/);
  assert.match(client, /isGamePage && !isGamePagePhase\(phase\)/);
  assert.match(client, /\.\/room\.html\?room=\$\{roomCode\}/);
});

test("active room screen hides lobby create and join controls", async () => {
  const client = await readText("src/room-client.js");

  assert.match(client, /urlParams\.get\("action"\) === "create"/);
  assert.match(client, /createRoomFromUi/);
  assert.match(client, /activeRoomControls: document\.querySelector\("#activeRoomControls"\)/);
  assert.match(client, /setHidden\(elements\.activeRoomControls, false\)/);
  assert.match(client, /setHidden\(elements\.invitePanel, false\)/);
  assert.doesNotMatch(client, /createRoomButton/);
  assert.doesNotMatch(client, /joinRoomButton/);
  assert.doesNotMatch(client, /joinRoomCode/);
  assert.match(client, /copySpectatorLinkButton/);
  assert.match(client, /spectatorLinkFor/);
  assert.match(client, /joinAsPlayer2Button/);
  assert.match(client, /joinNameInput/);
  assert.match(client, /body: \{ displayName \}/);
  assert.match(client, /Trump: \$\{suitName\(activeTrumpSuit\(state\)\)\}/);
  assert.match(client, /openInviteLinkButton/);
});

test("invite links use the public room route without the app subdirectory", async () => {
  const client = await readText("src/room-client.js");

  assert.match(client, /new URL\("\/room\.html", window\.location\.origin\)/);
  assert.match(client, /url\.search = `\?room=\$\{encodeURIComponent\(roomCode\)\}`/);
  assert.match(client, /url\.searchParams\.set\("view", "spectator"\)/);
  assert.match(client, /window\.open\(roomLinkFor\(roomView\.roomCode\), "_blank", "noopener"\)/);
  assert.doesNotMatch(client, /roomLinkFor[\s\S]*\/apps\/euchre-table-prototype/);
});

test("spectator invite opens read-only room view instead of taking Player 2 seat", async () => {
  const client = await readText("src/room-client.js");

  assert.match(client, /urlParams\.get\("view"\) === "spectator"/);
  assert.match(client, /viewRoomAsSpectator\(urlRoomCode\.toUpperCase\(\)\)/);
  assert.match(client, /Spectator View\. Hidden hands stay private\./);
});

test("seated pregame players see Ready and spectators do not", async () => {
  const html = await readText("room.html");
  const client = await readText("src/room-client.js");

  assert.match(html, /id="readyButton" type="button" disabled>Ready Up<\/button>/);
  assert.match(client, /\["waiting_for_players", "pregame_settings", "ready_countdown"\]\.includes\(state\.phase\)/);
  assert.match(client, /viewerSeat !== "spectator"/);
  assert.match(client, /setHidden\(elements\.readyButton, !canReady\)/);
  assert.match(client, /element\.style\.display = "none"/);
  assert.match(client, /element\.style\.pointerEvents = "none"/);
  assert.match(client, /element\.style\.removeProperty\("display"\)/);
  assert.match(client, /element\.style\.removeProperty\("pointer-events"\)/);
  assert.match(client, /elements\.readyButton\.onclick = canReady \? handleReadyClick : null/);
  assert.match(client, /elements\.readyButton\.style\.pointerEvents = canReady \? "auto" : ""/);
  assert.match(client, /elements\.readyButton\.textContent = viewerReady \? "Ready \(Tap to Cancel\)" : "Ready Up"/);
  assert.match(client, /type: viewerReady \? "unready" : "ready"/);
});

test("dealer choice buttons are coin-flip only and hide after selection", async () => {
  const client = await readText("src/room-client.js");

  assert.match(client, /function shouldShowStartSequence/);
  assert.match(client, /playerCount === 2/);
  assert.match(client, /\["coin_flip", "dealer_choice"\]\.includes\(state\.phase\)/);
  assert.match(client, /state\.actionPhase === "dealer_choice"/);
  assert.match(client, /view\.playerReady\?\.player1 === true/);
  assert.match(client, /view\.playerReady\?\.player2 === true/);
  assert.match(client, /elements\.coinFlipPanel\.replaceChildren\(\)/);
  assert.match(client, /dealerButton\.textContent = "Be Dealer"/);
  assert.match(client, /nonDealerButton\.textContent = "Be Non-Dealer"/);
});

test("Quick Match is wired as a placeholder", async () => {
  const client = await readText("src/home-client.js");

  assert.match(client, /\/api\/quick-match/);
  assert.match(client, /Quick Match coming next/);
});

test("home join room button opens room by code", async () => {
  const client = await readText("src/home-client.js");

  assert.match(client, /createRoomLink\.addEventListener/);
  assert.match(client, /requiredPlayerName\(\)/);
  assert.match(client, /Enter your name to continue\./);
  assert.match(client, /action=create&name=\$\{encodeURIComponent\(playerName\)\}/);
  assert.match(client, /homeJoinRoomButton\.addEventListener/);
  assert.match(client, /homeJoinRoomCode\.value\.trim\(\)\.toUpperCase\(\)/);
  assert.match(client, /\.\/room\.html\?room=\$\{encodeURIComponent\(roomCode\)\}&name=\$\{encodeURIComponent\(playerName\)\}/);
  assert.match(client, /Enter a room code/);
});

test("home admin code gate unlocks tournament controls client-side", async () => {
  const client = await readText("src/home-client.js");
  const css = await readText("src/styles.css");

  assert.match(client, /homepageAdminCodeValue = "MEHDI"/);
  assert.match(client, /homepageAdminControls\.hidden = false/);
  assert.match(client, /Admin tournament controls unlocked/);
  assert.match(client, /Admin code not recognized/);
  assert.match(css, /\.home-admin-panel/);
  assert.match(css, /max-width: 128px/);
});

test("deployment notes document launch commands and entrypoint", async () => {
  await access(new URL("DEPLOYMENT_NOTES.md", appRoot));
  const notes = await readText("DEPLOYMENT_NOTES.md");

  assert.match(notes, /Recommended target: \*\*Render Web Service\*\*/);
  assert.match(notes, /npm start/);
  assert.match(notes, /NODE_ENV=production npm start/);
  assert.match(notes, /npm run start:production/);
  assert.match(notes, /npm test/);
  assert.match(notes, /PORT/);
  assert.match(notes, /Defaults to `5174`/);
  assert.match(notes, /server\.js/);
  assert.match(notes, /\/healthz/);
  assert.match(notes, /1v1-euchre-freeplay/);
  assert.match(notes, /1v1euchre\.com/);
  assert.match(notes, /A record, ALIAS, ANAME, or CNAME-flattened record/);
  assert.match(notes, /HTTPS without a certificate warning/);
  assert.match(notes, /DNS Notes/);
  assert.match(notes, /Rollback Note/);
  assert.match(notes, /Post-Deploy Test Checklist/);
});

test("tester launch checklist covers room, tournament, spectator, and mobile checks", async () => {
  await access(new URL("TESTER_LAUNCH_CHECKLIST.md", appRoot));
  const checklist = await readText("TESTER_LAUNCH_CHECKLIST.md");

  assert.match(checklist, /Create a room/);
  assert.match(checklist, /Join as Player 2 from a second browser\/device/);
  assert.match(checklist, /left bower counts as trump/);
  assert.match(checklist, /Create a tournament/);
  assert.match(checklist, /Save the private host key/);
  assert.match(checklist, /Confirm champion display appears/);
  assert.match(checklist, /hidden hands stay private/);
  assert.match(checklist, /no horizontal page overflow/);
  assert.match(checklist, /No cash games\. No deposits\. No wallets\. No paid entries\./);
});

test("production launch checklist covers live domain safety checks", async () => {
  await access(new URL("PRODUCTION_LAUNCH_CHECKLIST.md", appRoot));
  const checklist = await readText("PRODUCTION_LAUNCH_CHECKLIST.md");

  assert.match(checklist, /https:\/\/1v1euchre\.com/);
  assert.match(checklist, /\/healthz/);
  assert.match(checklist, /Create a room/);
  assert.match(checklist, /Join the room from another browser\/device/);
  assert.match(checklist, /Save the private host key/);
  assert.match(checklist, /not shown to players/);
  assert.match(checklist, /Join 4 players/);
  assert.match(checklist, /champion screen appears/);
  assert.match(checklist, /spectators cannot see hidden hands/);
  assert.match(checklist, /No cash games\. No deposits\. No wallets\. No paid entries\./);
  assert.match(checklist, /mobile layout works/);
});

test("tester announcement draft is Discord-safe and asks for bug screenshots", async () => {
  await access(new URL("TESTER_ANNOUNCEMENT_DRAFT.md", appRoot));
  const announcement = await readText("TESTER_ANNOUNCEMENT_DRAFT.md");

  assert.match(announcement, /1V1 Euchre Free Play/);
  assert.match(announcement, /https:\/\/1v1euchre\.com/);
  assert.match(announcement, /free-play only/);
  assert.match(announcement, /No cash games\. No deposits\. No wallets\. No paid entries\./);
  assert.match(announcement, /screenshot or screen recording/);
});

test("client copy includes clear launch error handling messages", async () => {
  const roomClient = await readText("src/room-client.js");
  const tournamentClient = await readText("src/tournament-client.js");
  const tournamentState = await readText("src/tournament-state.js");

  assert.match(roomClient, /Join this room before taking a player action/);
  assert.match(roomClient, /Create a room or enter a room code to continue/);
  assert.match(tournamentClient, /Enter the private host key/);
  assert.match(tournamentClient, /Check the tournament code and try again/);
  assert.match(tournamentState, /Tournament has already started/);
  assert.match(tournamentState, /Match result is already recorded/);
});

test("package scripts include local and production start commands", async () => {
  const manifest = JSON.parse(await readText("package.json"));
  const server = await readText("server.js");

  assert.equal(manifest.scripts.start, "node server.js");
  assert.equal(manifest.scripts["start:production"], "NODE_ENV=production node server.js");
  assert.match(manifest.scripts.test, /node --test/);
  assert.match(server, /process\.env\.PORT \?\? "5174"/);
  assert.match(server, /"\/game\.html": "\/apps\/euchre-table-prototype\/game\.html"/);
});

test("server health check and root route work", async () => {
  const port = 5198;
  const server = spawn(process.execPath, ["server.js"], {
    cwd: new URL(".", appRoot),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      NODE_ENV: "production"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(server, port);
    const health = await requestJson(port, "/healthz");
    assert.equal(health.statusCode, 200);
    assert.deepEqual(health.body, {
      ok: true,
      app: "1v1-euchre-freeplay"
    });

    const root = await requestText(port, "/");
    assert.equal(root.statusCode, 302);
    assert.equal(root.headers.location, "/apps/euchre-table-prototype/home.html");

    const home = await requestText(port, "/apps/euchre-table-prototype/home.html");
    assert.equal(home.statusCode, 200);
    assert.match(home.body, /<title>1v1 Euchre<\/title>/);

    const game = await requestText(port, "/game.html");
    assert.equal(game.statusCode, 200);
    assert.match(game.body, /id="roomTable"/);

    const publicCss = await requestText(port, "/src/styles.css");
    assert.equal(publicCss.statusCode, 200);
    assert.match(publicCss.body, /\[hidden\]/);

    const publicRoomClient = await requestText(port, "/src/room-client.js");
    assert.equal(publicRoomClient.statusCode, 200);
    assert.match(publicRoomClient.body, /handleReadyClick/);
  } finally {
    server.kill();
  }
});

test("public room invite route serves room and lets Player 2 join by invite code", async () => {
  const port = 5199;
  const server = spawn(process.execPath, ["server.js"], {
    cwd: new URL(".", appRoot),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      NODE_ENV: "production"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(server, port);
    const blankCreate = await requestJson(port, "/api/rooms", {
      method: "POST",
      body: { displayName: "   " }
    });
    assert.equal(blankCreate.statusCode, 400);
    assert.equal(blankCreate.body.error, "Enter your name to continue.");

    const created = await requestJson(port, "/api/rooms", {
      method: "POST",
      body: { displayName: "Alice" }
    });
    const roomCode = created.body.room.roomCode;
    const invitePath = `/room.html?room=${encodeURIComponent(roomCode)}`;

    assert.equal(created.statusCode, 201);
    assert.equal(created.body.room.players.player1, true);
    assert.equal(created.body.room.players.player2, false);
    assert.equal(created.body.room.playerNames.player1, "Alice");
    assert.equal(created.body.room.coinFlipWinner, null);
    assert.equal(invitePath.includes("/apps/euchre-table-prototype"), false);

    const invitePage = await requestText(port, invitePath);
    assert.equal(invitePage.statusCode, 200);
    assert.match(invitePage.body, /master-shell room-shell/);
    assert.match(invitePage.body, /room-code-display/);

    const blankJoin = await requestJson(port, `/api/rooms/${roomCode}/join`, {
      method: "POST",
      body: { displayName: "" }
    });
    assert.equal(blankJoin.statusCode, 400);
    assert.equal(blankJoin.body.error, "Enter your name to continue.");

    const joined = await requestJson(port, `/api/rooms/${roomCode}/join`, {
      method: "POST",
      body: { displayName: "Bob" }
    });

    assert.equal(joined.statusCode, 200);
    assert.equal(joined.body.seat, "player2");
    assert.equal(joined.body.room.viewerSeat, "player2");
    assert.equal(joined.body.room.players.player2, true);
    assert.equal(joined.body.room.playerNames.player2, "Bob");
    assert.equal(joined.body.room.coinFlipWinner, null);
    assert.equal(joined.body.room.gameState.phase, "pregame_settings");
  } finally {
    server.kill();
  }
});

test("app-facing files avoid restricted commerce wording except approved disclaimers", async () => {
  const files = [
    "home.html",
    "rules.html",
    "room.html",
    "tournament.html",
    "DEPLOYMENT_NOTES.md",
    "TESTER_LAUNCH_CHECKLIST.md",
    "PRODUCTION_LAUNCH_CHECKLIST.md",
    "TESTER_ANNOUNCEMENT_DRAFT.md",
    "src/home-client.js",
    "src/room-client.js",
    "src/tournament-client.js"
  ];
  const restricted = [
    ["cash game"].join(""),
    ["real ", "money"].join(""),
    ["dep", "osit"].join(""),
    ["withdraw", "al"].join(""),
    ["wal", "let"].join(""),
    ["pr", "ize"].join(""),
    ["gam", "bling"].join(""),
    ["b", "et"].join(""),
    ["wa", "ger"].join("")
  ];
  const allowedDisclaimers = [
    "No cash games.",
    "No deposits.",
    "No wallets.",
    "No paid entries."
  ];

  for (const file of files) {
    let text = await readText(file);
    for (const allowed of allowedDisclaimers) {
      text = text.replaceAll(allowed, "");
    }
    for (const term of restricted) {
      assert.equal(text.toLowerCase().includes(term), false, `${file} contains restricted wording`);
    }
  }
});

test("user-facing pages do not contain local-only links", async () => {
  const files = [
    "home.html",
    "rules.html",
    "room.html",
    "tournament.html"
  ];
  const localOnly = [
    "localhost",
    "127.0.0.1",
    "file://",
    "/Users/"
  ];

  for (const file of files) {
    const text = await readText(file);
    for (const term of localOnly) {
      assert.equal(text.includes(term), false, `${file} contains local-only link text`);
    }
  }
});

async function readText(path) {
  return readFile(new URL(path, appRoot), "utf8");
}

function waitForServer(server, port) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Server did not start. Output: ${output}`));
    }, 3000);

    server.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes(`:${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });

    server.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });

    server.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    server.on("exit", (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`Server exited with ${code}. Output: ${output}`));
      }
    });
  });
}

function requestJson(port, path, options) {
  return requestText(port, path, options).then((result) => ({
    ...result,
    body: JSON.parse(result.body)
  }));
}

function requestText(port, path, { method = "GET", body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers: payload
        ? {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload)
          }
        : undefined
    }, (response) => {
      let body = "";
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          body
        });
      });
    });

    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
}
