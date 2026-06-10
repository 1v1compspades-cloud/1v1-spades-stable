import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const appRoot = new URL("../", import.meta.url);
const adminKey = "Zxcvfdsaqwer1287!";

test("home screen has the main routes and actions", async () => {
  const html = await readText("home.html");
  const publicActions = html.match(/<section class="home-action-panel"[\s\S]*?<\/section>/)?.[0] ?? "";

  assert.match(html, /<title>1v1 Euchre<\/title>/);
  assert.match(html, /class="master-shell home-shell"/);
  assert.match(html, /data-info-button/);
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

test("shared info panel has Euchre help pages and Discord action", async () => {
  const infoClient = await readText("src/info-panel.js");
  const homeClient = await readText("src/home-client.js");
  const roomClient = await readText("src/room-client.js");
  const css = await readText("src/styles.css");

  assert.match(infoClient, /DISCORD_INVITE_URL = "https:\/\/discord\.gg\/YOUR_INVITE"/);
  assert.match(infoClient, /About 1v1 Euchre Freeplay/);
  assert.match(infoClient, /How to Play/);
  assert.match(infoClient, /Euchre Rules/);
  assert.match(infoClient, /Scoring/);
  assert.match(infoClient, /Lobby \/ Invite Help/);
  assert.match(infoClient, /Discord \/ Community/);
  assert.match(infoClient, /Join the Discord/);
  assert.match(infoClient, /event\.key === "Escape"/);
  assert.match(infoClient, /event\.target === overlay/);
  assert.match(homeClient, /setupInfoPanel\(\)/);
  assert.match(roomClient, /setupInfoPanel\(\)/);
  assert.match(css, /\.info-overlay/);
  assert.match(css, /\.info-panel-drawer/);
  assert.match(css, /\.info-tabs/);
});

test("tournament screen has create, join, lobby, and bracket sections", async () => {
  const html = await readText("tournament.html");

  assert.match(html, /Create Tournament/);
  assert.match(html, /Join Tournament/);
  assert.match(html, /Host Controls/);
  assert.match(html, /Verify Host/);
  assert.match(html, /32 players/);
  assert.match(html, /64 players/);
  assert.match(html, /Keep the private key off-screen/);
  assert.match(html, /id="adminKeyInput" type="password"/);
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
  assert.match(html, /Join as Opponent/);
  assert.match(html, /id="readyButton"/);
  assert.match(html, /id="readyStatus"/);
  assert.match(html, /id="pregamePanel"/);
  assert.match(html, /Match Settings/);
  assert.match(html, /Race To/);
  assert.doesNotMatch(html, /id="pregameTargetScore">10<\/strong>/);
  assert.match(html, /Stick the Dealer/);
  assert.match(html, /Hidden Hands/);
  assert.match(html, />Host<\/span>/);
  assert.match(html, />Opponent<\/span>/);
  assert.doesNotMatch(html, /Player 1/);
  assert.doesNotMatch(html, /Player 2/);
  assert.doesNotMatch(html, /id="roomTable"/);
  assert.doesNotMatch(html, /Your Hand/);
  assert.doesNotMatch(html, /Kitty \/ Upcard/);
  assert.doesNotMatch(html, /Current Trick/);
  assert.doesNotMatch(html, /Completed Tricks/);
  assert.doesNotMatch(html, /Opponent Hand/);
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
  assert.doesNotMatch(html, /id="pregameTargetScore">10<\/strong>/);
  assert.match(html, />Host<\/span>/);
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
  assert.doesNotMatch(html, /id="pregameTargetScore">10<\/strong>/);
  assert.doesNotMatch(html, /id="targetScore">10<\/strong>/);
  assert.match(html, /id="player1ScoreLabel">You/);
  assert.match(html, /id="player2ScoreLabel">Opponent/);
  assert.match(html, /Your Hand/);
  assert.match(html, /Kitty \/ Upcard/);
  assert.match(html, /Current Trick/);
  assert.match(html, /Completed Tricks/);
  assert.match(html, /Opponent/);
  assert.match(html, /No cards dealt/);
  assert.doesNotMatch(html, /Player 1/);
  assert.doesNotMatch(html, /Player 2/);
  assert.match(client, /const gamePagePhases = \["playing", "hand_score", "next_round_countdown", "match_complete"\]/);
  assert.match(client, /function isGamePagePhase\(phase\)/);
  assert.match(client, /isRoomPage && isGamePagePhase\(phase\)/);
  assert.match(client, /\.\/game\.html\?room=\$\{roomCode\}/);
  assert.match(client, /isGamePage && !isGamePagePhase\(phase\)/);
  assert.match(client, /\.\/room\.html\?room=\$\{roomCode\}/);
});

test("mobile trump actions render in a main action bar", async () => {
  const html = await readText("game.html");
  const client = await readText("src/room-client.js");
  const css = await readText("src/styles.css");
  const statusIndex = html.indexOf('id="roomStatus"');
  const trumpPanelIndex = html.indexOf('id="trumpPanel"');
  const roomTableIndex = html.indexOf('id="roomTable"');
  const headerMarkup = html.match(/<header class="room-topbar">[\s\S]*?<\/header>/)?.[0] ?? "";

  assert.match(html, /id="trumpPanel" class="trump-action-bar" hidden/);
  assert.match(html, /id="trumpHelp"/);
  assert.match(html, /id="trumpButtons" class="trump-buttons"/);
  assert.match(html, /id="passButton" class="secondary" type="button">Pass<\/button>/);
  assert.equal(statusIndex < trumpPanelIndex, true);
  assert.equal(trumpPanelIndex < roomTableIndex, true);
  assert.doesNotMatch(headerMarkup, /trumpPanel|trumpButtons|passButton/);
  assert.match(client, /Order Up \$\{label\}/);
  assert.match(client, /Keep \$\{label\}/);
  assert.match(client, /Choose \$\{label\}/);
  assert.match(client, /setHidden\(elements\.passButton, !canAct\)/);
  assert.match(client, /if \(!canAct\) return/);
  assert.match(css, /\.trump-action-bar/);
  assert.match(css, /\.trump-action-controls/);
  assert.match(css, /position: sticky/);
  assert.match(css, /min-height: 56px/);
});

test("mobile chrome does not cover trump actions", async () => {
  const css = await readText("src/styles.css");

  assert.match(css, /overflow-x: hidden/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.game-shell[\s\S]*padding-bottom: calc\(110px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\.room-topbar \.online-pill[\s\S]*position: static/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /grid-template-columns: 1fr/);
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
  assert.match(client, /const matchSettings = currentMatchSettings\(\)/);
  assert.match(client, /body: \{[\s\S]*displayName,[\s\S]*matchSettings[\s\S]*\}/);
  assert.match(client, /requestedRaceTo = urlParams\.get\("raceTo"\) \?\? settings\.raceTo \?\? settings\.targetScore/);
  assert.match(client, /const raceTo = roomView\.matchSettings\?\.raceTo \?\? state\.targetScore \?\? 10/);
  assert.match(client, /setText\(elements\.pregameTargetScore, raceTo\)/);
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

test("room client restores stored seat sessions by room code", async () => {
  const client = await readText("src/room-client.js");

  assert.match(client, /roomSeatTokenPrefix = "euchre\.room\."/);
  assert.match(client, /guestPlayerIdKey = "euchre\.guestPlayerId"/);
  assert.match(client, /function roomSeatTokenKey\(roomCode\)/);
  assert.match(client, /function getGuestPlayerId\(\)/);
  assert.match(client, /localStorage\.setItem\(roomSeatTokenKey\(normalizedRoomCode\), seatToken\)/);
  assert.match(client, /localStorage\.setItem\(guestPlayerIdKey, playerId\)/);
  assert.match(client, /localStorage\.getItem\(roomSeatTokenKey\(normalizedRoomCode\)\)/);
  assert.match(client, /roomSessionsKey = "euchreRoomSeatsByRoom"/);
  assert.match(client, /urlRoomCode = urlParams\.get\("room"\)\?\.toUpperCase\(\) \?\? null/);
  assert.match(client, /session = loadSession\(urlRoomCode\)/);
  assert.match(client, /refreshRoom\("Game restored\."\)/);
  assert.match(client, /Session not recognized\. Join as opponent or watch as spectator\./);
  assert.match(client, /function loadLastSession\(\)/);
  assert.match(client, /function loadSessionMap\(\)/);
  assert.match(client, /sessions\[normalizedRoomCode\] = session/);
  assert.match(client, /playerId: getGuestPlayerId\(\)/);
  assert.match(client, /new URLSearchParams\(\{[\s\S]*playerId: getGuestPlayerId\(\)/);
  assert.match(client, /Choose Join as Opponent to take the open seat, or watch as spectator\./);
  assert.doesNotMatch(client, /function autoJoinRoom[\s\S]*body: \{ displayName \}/);
  assert.match(client, /render\(\);\n  if \(status\) setStatus\(status\);/);
});

test("spectator invite opens read-only room view instead of taking Player 2 seat", async () => {
  const client = await readText("src/room-client.js");

  assert.match(client, /urlParams\.get\("view"\) === "spectator"/);
  assert.match(client, /viewRoomAsSpectator\(urlRoomCode, "Spectator View\. Hidden hands stay private\.", \{ useStoredToken: false \}\)/);
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
  assert.match(client, /syncCreateRoomHref\(\)/);
  assert.match(client, /createRoomLink\.href = createRoomUrl\(playerNameInput\.value\.trim\(\)\)/);
  assert.match(client, /url\.searchParams\.set\("action", "create"\)/);
  assert.match(client, /url\.searchParams\.set\("modeId", settings\.modeId\)/);
  assert.match(client, /url\.searchParams\.set\("raceTo", String\(settings\.raceTo\)\)/);
  assert.match(client, /url\.searchParams\.set\("stickTheDealer", String\(settings\.stickTheDealer\)\)/);
  assert.match(client, /homeJoinRoomButton\.addEventListener/);
  assert.match(client, /homeJoinRoomCode\.value\.trim\(\)\.toUpperCase\(\)/);
  assert.match(client, /\.\/room\.html\?room=\$\{encodeURIComponent\(roomCode\)\}&name=\$\{encodeURIComponent\(playerName\)\}/);
  assert.match(client, /Enter a room code/);
});

test("home admin code gate unlocks tournament controls client-side", async () => {
  const client = await readText("src/home-client.js");
  const css = await readText("src/styles.css");

  assert.match(client, /homepageAdminCodeValue = "Zxcvfdsaqwer1287!"/);
  assert.doesNotMatch(client, /homepageAdminCode\.value\.trim\(\)\.toUpperCase\(\)/);
  assert.doesNotMatch(client, /homepageAdminCodeValue = "MEHDI"/);
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
  assert.match(checklist, /private host key/);
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
  assert.match(checklist, /private host key/);
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
  await withTempStateFile(async (stateFile) => {
    const port = 5198;
    const server = await startTestServer(port, stateFile);

    try {
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
      await stopServer(server);
    }
  });
});

test("public room invite route serves room and lets Player 2 join by invite code", async () => {
  await withTempStateFile(async (stateFile) => {
    const port = 5199;
    const server = await startTestServer(port, stateFile);

    try {
      const blankCreate = await requestJson(port, "/api/rooms", {
        method: "POST",
        body: { displayName: "   " }
      });
      assert.equal(blankCreate.statusCode, 400);
      assert.equal(blankCreate.body.error, "Enter your name to continue.");

      const created = await requestJson(port, "/api/rooms", {
        method: "POST",
        body: { displayName: "Alice", playerId: "alice-player" }
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

      const duplicateOpenSeat = await requestJson(port, `/api/rooms/${roomCode}/join`, {
        method: "POST",
        body: { displayName: "alice", playerId: "other-player" }
      });
      assert.equal(duplicateOpenSeat.statusCode, 409);
      assert.match(duplicateOpenSeat.body.error, /already seated/);

      const duplicatePlayerId = await requestJson(port, `/api/rooms/${roomCode}/join`, {
        method: "POST",
        body: { displayName: "Charlie", playerId: "alice-player" }
      });
      assert.equal(duplicatePlayerId.statusCode, 409);
      assert.match(duplicatePlayerId.body.error, /already seated/);

      const joined = await requestJson(port, `/api/rooms/${roomCode}/join`, {
        method: "POST",
        body: { displayName: "Bob", playerId: "bob-player" }
      });

      assert.equal(joined.statusCode, 200);
      assert.equal(joined.body.seat, "player2");
      assert.equal(joined.body.room.viewerSeat, "player2");
      assert.equal(joined.body.room.players.player2, true);
      assert.equal(joined.body.room.playerNames.player2, "Bob");
      assert.equal(joined.body.room.coinFlipWinner, null);
      assert.equal(joined.body.room.gameState.phase, "pregame_settings");

      const spectatorReady = await requestJson(port, `/api/rooms/${roomCode}/actions`, {
        method: "POST",
        body: { seatToken: "spectator-token", playerId: "spectator-player", type: "ready" }
      });
      assert.equal(spectatorReady.statusCode, 403);
      assert.match(spectatorReady.body.error, /Join this room before taking a player action/);
    } finally {
      await stopServer(server);
    }
  });
});

test("room creation stores and exposes selected Race To values", async () => {
  await withTempStateFile(async (stateFile) => {
    const port = 5205;
    const server = await startTestServer(port, stateFile);

    try {
      const raceToFive = await requestJson(port, "/api/rooms", {
        method: "POST",
        body: {
          displayName: "Alice",
          matchSettings: {
            modeId: "communityCompetitive",
            raceTo: 5,
            stickTheDealer: true
          }
        }
      });

      assert.equal(raceToFive.statusCode, 201);
      assert.equal(raceToFive.body.room.matchSettings.raceTo, 5);
      assert.equal(raceToFive.body.room.gameState.targetScore, 5);

      const loadedFive = await requestJson(port, `/api/rooms/${raceToFive.body.room.roomCode}`);
      assert.equal(loadedFive.statusCode, 200);
      assert.equal(loadedFive.body.room.matchSettings.raceTo, 5);
      assert.equal(loadedFive.body.room.gameState.targetScore, 5);

      const raceToTen = await requestJson(port, "/api/rooms", {
        method: "POST",
        body: {
          displayName: "Bob",
          matchSettings: {
            modeId: "communityCompetitive",
            raceTo: 10,
            stickTheDealer: true
          }
        }
      });

      assert.equal(raceToTen.statusCode, 201);
      assert.equal(raceToTen.body.room.matchSettings.raceTo, 10);
      assert.equal(raceToTen.body.room.gameState.targetScore, 10);

      const loadedTen = await requestJson(port, `/api/rooms/${raceToTen.body.room.roomCode}`);
      assert.equal(loadedTen.statusCode, 200);
      assert.equal(loadedTen.body.room.matchSettings.raceTo, 10);
      assert.equal(loadedTen.body.room.gameState.targetScore, 10);
    } finally {
      await stopServer(server);
    }
  });
});

test("generated tournament match rooms inherit Race To 5", async () => {
  await withTempStateFile(async (stateFile) => {
    const port = 5206;
    const server = await startTestServer(port, stateFile);

    try {
      const created = await requestJson(port, "/api/tournaments", {
        method: "POST",
        body: {
          bracketSize: 4,
          matchSettings: {
            modeId: "tournamentMode",
            raceTo: 5,
            stickTheDealer: true
          }
        }
      });
      const tournamentCode = created.body.tournament.tournamentCode;

      for (const displayName of ["A", "B", "C", "D"]) {
        const joined = await requestJson(port, `/api/tournaments/${tournamentCode}/join`, {
          method: "POST",
          body: { displayName }
        });
        assert.equal(joined.statusCode, 200);
      }

      const started = await requestJson(port, `/api/tournaments/${tournamentCode}/admin/start`, {
        method: "POST",
        body: { adminKey }
      });
      const firstRoundMatch = started.body.tournament.bracket.rounds[0].matches[0];
      const firstRoundRoom = await requestJson(port, `/api/rooms/${firstRoundMatch.roomCode}`);

      assert.equal(firstRoundRoom.statusCode, 200);
      assert.equal(firstRoundRoom.body.room.matchSettings.raceTo, 5);
      assert.equal(firstRoundRoom.body.room.gameState.targetScore, 5);
    } finally {
      await stopServer(server);
    }
  });
});

test("persistence reload keeps active room state", async () => {
  await withTempStateFile(async (stateFile) => {
    const port = 5200;
    let server = await startTestServer(port, stateFile);
    let roomCode;
    let seatToken;
    let guestToken;

    try {
      const created = await requestJson(port, "/api/rooms", {
        method: "POST",
        body: { displayName: "Alice", playerId: "alice-player" }
      });
      roomCode = created.body.room.roomCode;
      seatToken = created.body.seatToken;

      const joined = await requestJson(port, `/api/rooms/${roomCode}/join`, {
        method: "POST",
        body: { displayName: "Bob", playerId: "bob-player" }
      });
      guestToken = joined.body.seatToken;
      assert.equal(joined.body.room.players.player2, true);
    } finally {
      await stopServer(server);
    }

    server = await startTestServer(port, stateFile);
    try {
      const loaded = await requestJson(port, `/api/rooms/${roomCode}?seatToken=${encodeURIComponent(seatToken)}&playerId=alice-player`);
      assert.equal(loaded.statusCode, 200);
      assert.equal(loaded.body.room.roomCode, roomCode);
      assert.equal(loaded.body.room.viewerSeat, "player1");
      assert.equal(loaded.body.room.players.player1, true);
      assert.equal(loaded.body.room.players.player2, true);
      assert.equal(loaded.body.room.playerNames.player1, "Alice");
      assert.equal(loaded.body.room.playerNames.player2, "Bob");

      const guestLoaded = await requestJson(port, `/api/rooms/${roomCode}?seatToken=${encodeURIComponent(guestToken)}&playerId=bob-player`);
      assert.equal(guestLoaded.statusCode, 200);
      assert.equal(guestLoaded.body.room.viewerSeat, "player2");

      const hostTokenOnlyReconnect = await requestJson(port, `/api/rooms/${roomCode}/join`, {
        method: "POST",
        body: { seatToken, playerId: "alice-player" }
      });
      assert.equal(hostTokenOnlyReconnect.statusCode, 200);
      assert.equal(hostTokenOnlyReconnect.body.seat, "player1");
      assert.equal(hostTokenOnlyReconnect.body.room.viewerSeat, "player1");
      assert.equal(hostTokenOnlyReconnect.body.room.players.player2, true);

      const hostReconnect = await requestJson(port, `/api/rooms/${roomCode}/join`, {
        method: "POST",
        body: { seatToken, playerId: "alice-player", displayName: "Alice Again" }
      });
      assert.equal(hostReconnect.statusCode, 200);
      assert.equal(hostReconnect.body.seat, "player1");
      assert.equal(hostReconnect.body.room.viewerSeat, "player1");
      assert.equal(hostReconnect.body.room.playerNames.player1, "Alice");

      const guestReconnect = await requestJson(port, `/api/rooms/${roomCode}/join`, {
        method: "POST",
        body: { seatToken: guestToken, playerId: "bob-player", displayName: "Bob Again" }
      });
      assert.equal(guestReconnect.statusCode, 200);
      assert.equal(guestReconnect.body.seat, "player2");
      assert.equal(guestReconnect.body.room.viewerSeat, "player2");
      assert.equal(guestReconnect.body.room.playerNames.player2, "Bob");

      const duplicateNameJoin = await requestJson(port, `/api/rooms/${roomCode}/join`, {
        method: "POST",
        body: { displayName: "Alice" }
      });
      assert.equal(duplicateNameJoin.statusCode, 409);
      assert.match(duplicateNameJoin.body.error, /two seated players/);

      const blankNewJoin = await requestJson(port, `/api/rooms/${roomCode}/join`, {
        method: "POST",
        body: { displayName: "   " }
      });
      assert.equal(blankNewJoin.statusCode, 400);
      assert.equal(blankNewJoin.body.error, "Enter your name to continue.");

      const seatSteal = await requestJson(port, `/api/rooms/${roomCode}/join`, {
        method: "POST",
        body: { seatToken: "third-token", playerId: "third-player", displayName: "Seat Stealer" }
      });
      assert.equal(seatSteal.statusCode, 409);
      assert.match(seatSteal.body.error, /two seated players/);

      const spectator = await requestJson(port, `/api/rooms/${roomCode}?seatToken=third-token&playerId=third-player`);
      assert.equal(spectator.statusCode, 200);
      assert.equal(spectator.body.room.viewerSeat, "spectator");
      assert.equal("hands" in spectator.body.room.gameState, false);
      assert.deepEqual(spectator.body.room.gameState.viewerHand, []);
      assert.deepEqual(spectator.body.room.gameState.playableCards, []);
    } finally {
      await stopServer(server);
    }
  });
});

test("persistence reload keeps tournament bracket and winner advancement", async () => {
  await withTempStateFile(async (stateFile) => {
    const port = 5201;
    let server = await startTestServer(port, stateFile);
    let tournamentCode;
    let roundOneWinnerId;

    try {
      const created = await requestJson(port, "/api/tournaments", {
        method: "POST",
        body: { bracketSize: 4 }
      });
      tournamentCode = created.body.tournament.tournamentCode;

      for (const displayName of ["A", "B", "C", "D"]) {
        const joined = await requestJson(port, `/api/tournaments/${tournamentCode}/join`, {
          method: "POST",
          body: { displayName }
        });
        assert.equal(joined.statusCode, 200);
      }

      const started = await requestJson(port, `/api/tournaments/${tournamentCode}/admin/start`, {
        method: "POST",
        body: { adminKey }
      });
      const match = started.body.tournament.bracket.rounds[0].matches[0];
      roundOneWinnerId = match.player1.id;
      assert.equal(started.body.tournament.bracket.rounds[0].matches.length, 2);
    } finally {
      await stopServer(server);
    }

    server = await startTestServer(port, stateFile);
    try {
      const loaded = await requestJson(port, `/api/tournaments/${tournamentCode}`);
      assert.equal(loaded.statusCode, 200);
      assert.equal(loaded.body.tournament.bracket.rounds.length, 2);
      assert.equal(loaded.body.tournament.bracket.rounds[0].matches[0].status, "active");

      const reported = await requestJson(port, `/api/tournaments/${tournamentCode}/admin/matches/r1m1/winner`, {
        method: "POST",
        body: {
          adminKey,
          round: 1,
          winnerId: roundOneWinnerId,
          source: "admin_mark_winner"
        }
      });
      assert.equal(reported.body.tournament.bracket.rounds[1].matches[0].player1.id, roundOneWinnerId);
    } finally {
      await stopServer(server);
    }

    server = await startTestServer(port, stateFile);
    let championId;
    try {
      const reloaded = await requestJson(port, `/api/tournaments/${tournamentCode}`);
      assert.equal(reloaded.statusCode, 200);
      assert.equal(reloaded.body.tournament.bracket.rounds[1].matches[0].player1.id, roundOneWinnerId);
      assert.equal(reloaded.body.tournament.resultLog[0].matchId, "r1m1");

      const secondMatch = reloaded.body.tournament.bracket.rounds[0].matches[1];
      const secondWinnerId = secondMatch.player1.id;
      const secondReported = await requestJson(port, `/api/tournaments/${tournamentCode}/admin/matches/r1m2/winner`, {
        method: "POST",
        body: {
          adminKey,
          round: 1,
          winnerId: secondWinnerId,
          source: "admin_mark_winner"
        }
      });
      const finalMatch = secondReported.body.tournament.bracket.rounds[1].matches[0];
      championId = finalMatch.player1.id;

      const finalReported = await requestJson(port, `/api/tournaments/${tournamentCode}/admin/matches/r2m1/winner`, {
        method: "POST",
        body: {
          adminKey,
          round: 2,
          winnerId: championId,
          source: "admin_mark_winner"
        }
      });
      assert.equal(finalReported.body.tournament.status, "complete");
    } finally {
      await stopServer(server);
    }

    server = await startTestServer(port, stateFile);
    try {
      const championReloaded = await requestJson(port, `/api/tournaments/${tournamentCode}`);
      assert.equal(championReloaded.statusCode, 200);
      assert.equal(championReloaded.body.tournament.status, "complete");
      assert.equal(championReloaded.body.tournament.winner.id, championId);
      assert.equal(championReloaded.body.tournament.resultLog.length, 3);
    } finally {
      await stopServer(server);
    }
  });
});

test("persistence reload keeps a 64-player tournament bracket", async () => {
  await withTempStateFile(async (stateFile) => {
    const port = 5202;
    let server = await startTestServer(port, stateFile);
    let tournamentCode;

    try {
      const created = await requestJson(port, "/api/tournaments", {
        method: "POST",
        body: { bracketSize: 64 }
      });
      tournamentCode = created.body.tournament.tournamentCode;

      for (let index = 1; index <= 64; index += 1) {
        const joined = await requestJson(port, `/api/tournaments/${tournamentCode}/join`, {
          method: "POST",
          body: { displayName: `Player ${index}` }
        });
        assert.equal(joined.statusCode, 200);
      }

      const started = await requestJson(port, `/api/tournaments/${tournamentCode}/admin/start`, {
        method: "POST",
        body: { adminKey }
      });
      assert.equal(started.body.tournament.bracket.rounds[0].matches.length, 32);
    } finally {
      await stopServer(server);
    }

    server = await startTestServer(port, stateFile);
    try {
      const loaded = await requestJson(port, `/api/tournaments/${tournamentCode}`);
      assert.equal(loaded.statusCode, 200);
      assert.equal(loaded.body.tournament.bracketSize, 64);
      assert.deepEqual(loaded.body.tournament.bracket.rounds.map((round) => round.matches.length), [32, 16, 8, 4, 2, 1]);
      assert.equal(loaded.body.tournament.bracket.rounds[0].matches.every((match) => match.status === "active"), true);
      assert.equal("admin" in loaded.body.tournament, false);
    } finally {
      await stopServer(server);
    }
  });
});

test("persistence reload keeps hidden hands protected", async () => {
  await withTempStateFile(async (stateFile) => {
    const port = 5203;
    let server = await startTestServer(port, stateFile);
    let roomCode;
    let hostToken;
    let guestToken;

    try {
      const created = await requestJson(port, "/api/rooms", {
        method: "POST",
        body: { displayName: "Alice" }
      });
      roomCode = created.body.room.roomCode;
      hostToken = created.body.seatToken;

      const joined = await requestJson(port, `/api/rooms/${roomCode}/join`, {
        method: "POST",
        body: { displayName: "Bob" }
      });
      guestToken = joined.body.seatToken;

      await requestJson(port, `/api/rooms/${roomCode}/actions`, {
        method: "POST",
        body: { seatToken: hostToken, type: "ready" }
      });
      const ready = await requestJson(port, `/api/rooms/${roomCode}/actions`, {
        method: "POST",
        body: { seatToken: guestToken, type: "ready" }
      });
      await delayUntilCountdownEnds(ready.body.room.countdownEndsAt);

      const coin = await requestJson(port, `/api/rooms/${roomCode}?seatToken=${encodeURIComponent(hostToken)}`);
      const winnerToken = coin.body.room.coinFlipWinner === "player1" ? hostToken : guestToken;
      const started = await requestJson(port, `/api/rooms/${roomCode}/actions`, {
        method: "POST",
        body: {
          seatToken: winnerToken,
          type: "chooseStartingPosition",
          position: "dealer"
        }
      });
      assert.equal(started.body.room.gameState.handCounts.player1, 5);
    } finally {
      await stopServer(server);
    }

    server = await startTestServer(port, stateFile);
    try {
      const spectator = await requestJson(port, `/api/rooms/${roomCode}`);
      assert.equal(spectator.statusCode, 200);
      assert.equal(spectator.body.room.viewerSeat, "spectator");
      assert.equal("hands" in spectator.body.room.gameState, false);
      assert.deepEqual(spectator.body.room.gameState.viewerHand, []);
      assert.deepEqual(spectator.body.room.gameState.playableCards, []);
      assert.equal(spectator.body.room.gameState.handCounts.player1, 5);
      assert.equal(spectator.body.room.gameState.handCounts.player2, 5);
    } finally {
      await stopServer(server);
    }
  });
});

test("corrupt persistence file does not crash server", async () => {
  await withTempStateFile(async (stateFile) => {
    await writeFile(stateFile, "{not valid json", "utf8");
    const port = 5204;
    const server = await startTestServer(port, stateFile);

    try {
      const health = await requestJson(port, "/healthz");
      assert.equal(health.statusCode, 200);

      const created = await requestJson(port, "/api/rooms", {
        method: "POST",
        body: { displayName: "Alice" }
      });
      assert.equal(created.statusCode, 201);
      assert.equal(created.body.room.players.player1, true);
    } finally {
      await stopServer(server);
    }
  });
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

async function withTempStateFile(callback) {
  const dir = await mkdtemp(join(tmpdir(), "euchre-state-"));
  const stateFile = join(dir, "state.json");

  try {
    return await callback(stateFile);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function startTestServer(port, stateFile) {
  const server = spawn(process.execPath, ["server.js"], {
    cwd: new URL(".", appRoot),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      NODE_ENV: "production",
      EUCHRE_STATE_FILE: stateFile
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  await waitForServer(server, port);
  return server;
}

function stopServer(server) {
  if (!server || server.exitCode !== null || server.signalCode) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    server.once("exit", done);
    server.kill();
    setTimeout(done, 500);
  });
}

function delayUntilCountdownEnds(countdownEndsAt) {
  const delayMs = Math.max(0, Date.parse(countdownEndsAt) - Date.now() + 80);
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
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
