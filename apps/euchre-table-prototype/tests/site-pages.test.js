import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const appRoot = new URL("../", import.meta.url);
const adminKey = "Zxcvfdsaqwer1287!";
const freePlayDisclaimer = "1v1 Euchre is free-play only. There are no cash games, wagers, buy-ins, deposits, payouts, or paid prize pools.";

test("home screen has the main routes and actions", async () => {
  const html = await readText("home.html");
  const client = await readText("src/home-client.js");
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
  assert.match(publicActions, /Find Quick Match/);
  assert.match(publicActions, /Cancel Queue/);
  assert.match(publicActions, /id="leaveCurrentRoomButton"/);
  assert.match(publicActions, /Leave current room/);
  assert.match(publicActions, /Profile/);
  assert.match(publicActions, /Leaderboard/);
  assert.match(publicActions, /Tournament History/);
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
  assert.match(client, /clearSavedActiveRoom\(localStorage, savedRoom\.roomCode\)/);
  assert.match(client, /loadSavedActiveRoom\(\)/);
  assert.match(client, /roomHasStarted\(room\)/);
  assert.match(client, /window\.history\.replaceState\(null, "", "\.\/home\.html"\)/);
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
  assert.match(infoClient, /Leaderboard/);
  assert.match(infoClient, /View Leaderboard/);
  assert.match(infoClient, /Tournament History/);
  assert.match(infoClient, /View Tournament History/);
  assert.match(infoClient, /Discord \/ Community/);
  assert.match(infoClient, /Join the Discord/);
  assert.match(infoClient, new RegExp(escapeRegExp(freePlayDisclaimer)));
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
  assert.match(html, new RegExp(escapeRegExp(freePlayDisclaimer)));
  assert.match(html, /Support/);
  assert.match(html, /hidden hands stay private/);
  assert.match(css, /\.shell:not\(\.master-shell\) \.rules-panel/);
  assert.match(css, /\.shell:not\(\.master-shell\) \.rules-list/);
  assert.match(css, /color: var\(--ink\)/);
});

test("profile screen supports lightweight account upgrade", async () => {
  const html = await readText("profile.html");
  const client = await readText("src/profile-client.js");

  assert.match(html, /Profile - 1v1 Euchre/);
  assert.match(html, /id="profileForm"/);
  assert.match(html, /id="profileDisplayName"/);
  assert.match(html, /id="profileUsername"/);
  assert.match(html, /id="leaveCurrentRoomButton"/);
  assert.match(html, /Leave current room/);
  assert.match(html, /Save Profile/);
  assert.match(html, /Tournament History/);
  assert.match(client, /accountProfileKey = "euchre\.accountProfile"/);
  assert.match(client, /\/api\/accounts\/upgrade/);
  assert.match(client, /\/api\/profile\?accountId=/);
  assert.match(client, /playerId: getGuestPlayerId\(\)/);
  assert.match(client, /clearSavedActiveRoom\(localStorage, savedRoom\.roomCode\)/);
  assert.match(client, /window\.location\.href = "\.\/home\.html"/);
});

test("leaderboard screen renders public standings table", async () => {
  const html = await readText("leaderboard.html");
  const client = await readText("src/leaderboard-client.js");
  const css = await readText("src/styles.css");

  assert.match(html, /Leaderboard - 1v1 Euchre/);
  assert.match(html, /id="leaderboardRows"/);
  assert.match(html, /Rank/);
  assert.match(html, /Display name/);
  assert.match(html, /Wins/);
  assert.match(html, /Losses/);
  assert.match(html, /Matches played/);
  assert.match(html, /Win %/);
  assert.match(html, /Tournament wins/);
  assert.match(client, /\/api\/leaderboard/);
  assert.match(client, /textContent/);
  assert.match(css, /\.leaderboard-table/);
});

test("tournament history screen renders public tournament summaries", async () => {
  const html = await readText("tournament-history.html");
  const client = await readText("src/tournament-history-client.js");

  assert.match(html, /Tournament History - 1v1 Euchre/);
  assert.match(html, /Past Tournaments/);
  assert.match(html, /id="tournamentHistoryRows"/);
  assert.match(html, /Tournament code/);
  assert.match(html, /Bracket size/);
  assert.match(html, /Champion/);
  assert.match(html, /Runner-up/);
  assert.match(html, /Completed/);
  assert.match(html, /Matches/);
  assert.match(html, /Rounds/);
  assert.match(client, /\/api\/tournament-history/);
  assert.match(client, /textContent/);
});

test("one-player room lobby exposes invite controls without start sequence or create/join controls", async () => {
  const html = await readText("room.html");
  const client = await readText("src/room-client.js");
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
  assert.match(client, /renderLobbySeat\(elements\.player1Slot/);
  assert.match(client, /renderLobbySeat\(elements\.player2Slot/);
  assert.match(client, /slot-player-name/);
  assert.match(client, /slot-ready-state/);
  assert.match(client, /Ready" : "Not Ready"/);
  assert.match(css, /\.slot-player-name/);
  assert.match(css, /\.slot-ready-state/);
  assert.match(css, /\.slot-ready-state\.ready/);
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

  assert.match(html, /class="master-shell game-shell game-screen"/);
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
  assert.match(client, /gameShell: document\.querySelector\("\.game-shell"\)/);
  assert.match(client, /updateGameLayoutState\(gameInterfaceActive, state\)/);
  assert.match(client, /document\.body\.classList\.toggle\("room-active", active\)/);
  assert.match(client, /isRoomPage && isGamePagePhase\(phase\)/);
  assert.match(client, /\.\/game\.html\?room=\$\{roomCode\}/);
  assert.match(client, /isGamePage && !isGamePagePhase\(phase\)/);
  assert.match(client, /\.\/room\.html\?room=\$\{roomCode\}/);
});

test("kitty upcard uses branded card stack with consistent Jack highlight", async () => {
  const client = await readText("src/room-client.js");
  const css = await readText("src/styles.css");

  assert.match(client, /elements\.upcard\.className = hasKittyStack \? `upcard kitty-stack\$\{trumpSuit \? " has-trump" : ""\}` : "upcard empty"/);
  assert.match(client, /renderUpcard\(state\.upcard, trumpSuit\)/);
  assert.match(client, /function renderUpcard\(card, trumpSuit = null\)/);
  assert.match(client, /kitty-trump-badge/);
  assert.match(client, /Trump is \$\{suitName\(trumpSuit\)\}/);
  assert.match(client, /suitSymbol\(trumpSuit\)/);
  assert.match(client, /kitty-card-back kitty-card-back-bottom/);
  assert.match(client, /kitty-card-back kitty-card-back-top/);
  assert.match(client, /cardClassNames\(card, \["upcard-card"\]\)/);
  assert.match(client, /card\.rank === "J" \? "face-jack" : "rank-card"/);
  assert.match(client, /rank-large/);
  assert.match(client, /suit-large/);
  assert.match(client, /const centerMarkup = `<span class="rank-large">\$\{card\.rank\}<\/span><span class="suit suit-large">\$\{symbol\}<\/span>`/);
  assert.doesNotMatch(client, /jack-art|jack-portrait|jack-mini-rank|jack-band|jack-suit-bottom/);
  assert.match(client, /card-corner card-corner-top[\s\S]*rank[\s\S]*suit/);
  assert.match(client, /card-corner card-corner-bottom[\s\S]*rank[\s\S]*suit/);
  assert.match(client, /isRed\(card\.suit\) \? "red" : "black"/);
  assert.match(css, /\.upcard-card/);
  assert.match(css, /\.kitty-card-back/);
  assert.match(css, /\.kitty-trump-badge/);
  assert.match(css, /\.kitty-trump-badge\.red[\s\S]*color: #b32925/);
  assert.match(css, /\.kitty-trump-badge[\s\S]*pointer-events: none/);
  assert.match(css, /\.card-back::after[\s\S]*content: "1v1"/);
  assert.match(css, /\.card\.black[\s\S]*color: var\(--ink\)/);
  assert.match(css, /\.card\.red[\s\S]*color: #b32925/);
  assert.match(css, /\.face-jack[\s\S]*border-color: var\(--gold\)/);
  assert.match(css, /\.face-jack[\s\S]*rgba\(239, 183, 42, 0\.24\)/);
  assert.match(css, /\.face-jack \.card-face-inner::before[\s\S]*rgba\(239, 183, 42, 0\.22\)/);
  assert.doesNotMatch(css, /jack-portrait|jack-mini-rank|jack-band|jack-suit-bottom/);
  assert.match(css, /\.card-corner[\s\S]*z-index: 2/);
  assert.match(css, /\.suit-large[\s\S]*font-size: clamp/);
  assert.match(css, /\.game-screen\.room-active \.upcard-card[\s\S]*min-height: 96px/);
  assert.match(css, /\.game-screen\.room-active \.kitty-trump-badge[\s\S]*min-height: 22px/);
});

test("mobile active game layout keeps play areas compact and reachable", async () => {
  const html = await readText("game.html");
  const client = await readText("src/room-client.js");
  const css = await readText("src/styles.css");

  assert.match(html, /id="lastTrickArea"[\s\S]*Last Trick/);
  assert.match(html, /id="lastTrickMeta"[\s\S]*Winning Card/);
  assert.match(client, /lastTrickArea: document\.querySelector\("#lastTrickArea"\)/);
  assert.match(client, /function renderLastTrick\(state\)/);
  assert.match(client, /state\.lastTrick/);
  assert.match(client, /winningCard/);
  assert.match(client, /winningSeat/);
  assert.match(client, /winning-card-badge/);
  assert.doesNotMatch(client, /lastCompletedTrick|showingLastTrick|visiblePlays/);
  assert.match(css, /body\.room-active[\s\S]*min-height: 100dvh/);
  assert.match(css, /\.game-screen\.room-active[\s\S]*min-height: 100dvh/);
  assert.match(css, /\.game-screen\.room-active[\s\S]*padding: 8px 0 calc\(10px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /grid-template-areas:[\s\S]*"opponent"[\s\S]*"center"[\s\S]*"player"/);
  assert.match(css, /\.game-screen\.room-active \.room-table > \.player-panel:first-child[\s\S]*position: sticky/);
  assert.match(css, /bottom: calc\(4px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\.game-screen\.room-active \.room-table > \.center-panel[\s\S]*"upcard trick"[\s\S]*"last-trick last-trick"/);
  assert.match(css, /\.game-screen\.room-active \.room-table > \.center-panel[\s\S]*min-height: 284px/);
  assert.match(css, /\.game-screen\.room-active \.history[\s\S]*display: none/);
  assert.match(css, /\.last-trick-area/);
  assert.match(css, /\.last-trick-heading/);
  assert.match(css, /\.last-trick-card/);
  assert.match(css, /\.last-trick-card\.winning-card/);
  assert.match(css, /\.winning-card-badge/);
  assert.match(css, /\.trick-card-player/);
  assert.match(css, /\.game-screen\.room-active \.current-trick,[\s\S]*\.game-screen\.room-active \.last-trick[\s\S]*min-height: 102px/);
  assert.match(css, /\.game-screen\.room-active \.current-trick \.card,[\s\S]*\.game-screen\.room-active \.current-trick \.play-slot,[\s\S]*\.game-screen\.room-active \.last-trick \.card[\s\S]*min-height: 102px/);
  assert.match(css, /\.game-screen\.room-active \.trump-action-bar[\s\S]*position: sticky/);
  assert.match(css, /\.game-screen\.room-active \.trump-action-bar button[\s\S]*min-height: 46px/);
  assert.match(css, /\.game-screen\.room-active \.hand[\s\S]*repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.game-screen\.room-active \.card-backs \.card[\s\S]*width: 22px/);
  assert.match(css, /\.card:disabled[\s\S]*color: var\(--ink\)/);
  assert.match(css, /\.card\.red:disabled[\s\S]*color: #b32925/);
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

test("mobile lobby keeps room controls compact and ready action reachable", async () => {
  const css = await readText("src/styles.css");

  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /\.room-shell \.lobby-panel[\s\S]*gap: 16px/);
  assert.match(css, /\.room-code-display[\s\S]*font-size: clamp\(2\.35rem, 16vw, 3\.35rem\)/);
  assert.match(css, /\.room-shell \.share-actions button[\s\S]*min-height: 50px/);
  assert.match(css, /\.room-shell \.invite-panel[\s\S]*order: 3/);
  assert.match(css, /\.room-shell #readyButton[\s\S]*order: 2/);
  assert.match(css, /\.room-shell \.players-section[\s\S]*order: 4/);
  assert.match(css, /\.room-shell \.match-settings-panel[\s\S]*order: 5/);
  assert.match(css, /\.room-topbar \.online-pill::after[\s\S]*content: "Online"/);
  assert.match(css, /\.room-shell \.player-slot strong[\s\S]*font-size: clamp\(1\.5rem, 9vw, 2rem\)/);
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
  const helper = await readText("src/local-room-session.js");

  assert.match(helper, /roomSeatTokenPrefix = "euchre\.room\."/);
  assert.match(client, /guestPlayerIdKey = "euchre\.guestPlayerId"/);
  assert.match(helper, /function roomSeatTokenKey\(roomCode\)/);
  assert.match(client, /function getGuestPlayerId\(\)/);
  assert.match(client, /localStorage\.setItem\(roomSeatTokenKey\(normalizedRoomCode\), seatToken\)/);
  assert.match(client, /localStorage\.setItem\(guestPlayerIdKey, playerId\)/);
  assert.match(client, /localStorage\.getItem\(roomSeatTokenKey\(normalizedRoomCode\)\)/);
  assert.match(helper, /roomSessionsKey = "euchreRoomSeatsByRoom"/);
  assert.match(client, /accountProfileKey = "euchre\.accountProfile"/);
  assert.match(client, /urlRoomCode = urlParams\.get\("room"\)\?\.toUpperCase\(\) \?\? null/);
  assert.match(client, /session = loadSession\(urlRoomCode\)/);
  assert.match(client, /refreshRoom\("Game restored\."\)/);
  assert.match(client, /Session not recognized\. Join as opponent or watch as spectator\./);
  assert.match(client, /function loadLastSession\(\)/);
  assert.match(client, /function loadSessionMap\(\)/);
  assert.match(client, /sessions\[normalizedRoomCode\] = session/);
  assert.match(client, /function currentIdentityPayload\(\)/);
  assert.match(client, /playerId: getGuestPlayerId\(\)/);
  assert.match(client, /accountId: getAccountId\(\)/);
  assert.match(client, /new URLSearchParams\(currentIdentityPayload\(\)\)/);
  assert.match(client, /if \(result\.seatToken && result\.room\.viewerSeat !== "spectator"\)/);
  assert.match(client, /setSession\(result\.room\.roomCode, result\.seatToken\)/);
  assert.match(client, /clearSavedActiveRoom\(localStorage, roomCode\)/);
  assert.match(client, /showJoinFallback = viewerSeat === "spectator" && roomView\.alreadySeated !== true && !roomView\.players\.player2/);
  assert.match(client, /function joinNameAlreadySeated\(displayName\)/);
  assert.match(client, /This account or name is already seated in this room\./);
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

test("Quick Match is wired to queue, cancel, and matched room redirect", async () => {
  const client = await readText("src/home-client.js");

  assert.match(client, /\/api\/quick-match/);
  assert.match(client, /\/api\/quick-match\/cancel/);
  assert.match(client, /quickMatchQueueKey = "euchre\.quickMatchQueue"/);
  assert.match(client, /fallbackGuestPlayerId = null/);
  assert.match(client, /fallbackQuickMatchQueue = null/);
  assert.match(client, /Searching for a \$\{quickMatchRaceLabel\(queue\)\} Quick Match\. Both players must choose the same Match target\./);
  assert.match(client, /function readLocalStorage/);
  assert.match(client, /function writeLocalStorage/);
  assert.match(client, /function removeLocalStorage/);
  assert.match(client, /readLocalStorage\(guestPlayerIdKey\) \?\? fallbackGuestPlayerId/);
  assert.match(client, /cancelQuickMatchButton/);
  assert.match(client, /startQuickMatchPolling/);
  assert.match(client, /window\.location\.href = `\.\/room\.html\?room=\$\{encodeURIComponent\(result\.matchedRoomCode\)\}`/);
  assert.doesNotMatch(client, /Quick Match coming next/);
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
  assert.match(checklist, new RegExp(escapeRegExp(freePlayDisclaimer)));
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
  assert.match(checklist, new RegExp(escapeRegExp(freePlayDisclaimer)));
  assert.match(checklist, /mobile layout works/);
});

test("tester announcement draft is Discord-safe and asks for bug screenshots", async () => {
  await access(new URL("TESTER_ANNOUNCEMENT_DRAFT.md", appRoot));
  const announcement = await readText("TESTER_ANNOUNCEMENT_DRAFT.md");

  assert.match(announcement, /1V1 Euchre Free Play/);
  assert.match(announcement, /https:\/\/1v1euchre\.com/);
  assert.match(announcement, new RegExp(escapeRegExp(freePlayDisclaimer)));
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

      const profile = await requestText(port, "/profile.html");
      assert.equal(profile.statusCode, 200);
      assert.match(profile.body, /id="profileForm"/);

      const leaderboard = await requestText(port, "/leaderboard.html");
      assert.equal(leaderboard.statusCode, 200);
      assert.match(leaderboard.body, /id="leaderboardRows"/);

      const history = await requestText(port, "/tournament-history.html");
      assert.equal(history.statusCode, 200);
      assert.match(history.body, /id="tournamentHistoryRows"/);

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

test("account profiles upgrade guests and protect room seats", async () => {
  await withTempStateFile(async (stateFile) => {
    const port = 5207;
    let server = await startTestServer(port, stateFile);
    let accountId;
    let roomCode;
    let hostToken;

    try {
      const guestRoom = await requestJson(port, "/api/rooms", {
        method: "POST",
        body: { displayName: "Guest Alice", playerId: "guest-alice" }
      });
      assert.equal(guestRoom.statusCode, 201);
      assert.equal(guestRoom.body.room.playerNames.player1, "Guest Alice");

      const upgraded = await requestJson(port, "/api/accounts/upgrade", {
        method: "POST",
        body: {
          playerId: "guest-alice",
          username: "1v1",
          displayName: "Mehdi Zerrad"
        }
      });
      assert.equal(upgraded.statusCode, 201);
      assert.equal(upgraded.body.account.username, "1v1");
      assert.equal(upgraded.body.account.displayName, "Mehdi Zerrad");
      assert.ok(upgraded.body.account.createdAt);
      accountId = upgraded.body.account.accountId;

      const duplicateUsernameRestore = await requestJson(port, "/api/accounts/upgrade", {
        method: "POST",
        body: {
          username: "  1V1  ",
          displayName: "Different Device Name"
        }
      });
      assert.equal(duplicateUsernameRestore.statusCode, 201);
      assert.equal(duplicateUsernameRestore.body.account.accountId, accountId);
      assert.equal(duplicateUsernameRestore.body.account.username, "1v1");
      assert.equal(duplicateUsernameRestore.body.account.displayName, "Mehdi Zerrad");

      const profile = await requestJson(port, `/api/profile?accountId=${encodeURIComponent(accountId)}`);
      assert.equal(profile.statusCode, 200);
      assert.deepEqual(profile.body.account, upgraded.body.account);

      const accountRoom = await requestJson(port, "/api/rooms", {
        method: "POST",
        body: {
          displayName: "Local Override",
          playerId: "account-device",
          accountId
        }
      });
      assert.equal(accountRoom.statusCode, 201);
      assert.equal(accountRoom.body.room.viewerSeat, "player1");
      assert.equal(accountRoom.body.room.playerNames.player1, "Mehdi Zerrad");
      roomCode = accountRoom.body.room.roomCode;
      hostToken = accountRoom.body.seatToken;

      const registeredUsernameCreate = await requestJson(port, "/api/rooms", {
        method: "POST",
        body: {
          displayName: "1v1",
          playerId: "guest-using-registered-username"
        }
      });
      assert.equal(registeredUsernameCreate.statusCode, 409);
      assert.equal(registeredUsernameCreate.body.code, "registered_username");
      assert.equal(registeredUsernameCreate.body.error, "That username is already registered. Log in to use it.");

      const accountReconnect = await requestJson(port, `/api/rooms/${roomCode}?accountId=${encodeURIComponent(accountId)}`);
      assert.equal(accountReconnect.statusCode, 200);
      assert.equal(accountReconnect.body.viewerSeat, "player1");
      assert.equal(accountReconnect.body.alreadySeated, true);
      assert.equal(accountReconnect.body.restoredBy, "accountId");
      assert.equal(accountReconnect.body.seatToken, hostToken);
      assert.equal(accountReconnect.body.room.viewerSeat, "player1");

      const duplicateAccountJoin = await requestJson(port, `/api/rooms/${roomCode}/join`, {
        method: "POST",
        body: {
          displayName: "Another Mehdi",
          playerId: "second-device",
          accountId
        }
      });
      assert.equal(duplicateAccountJoin.statusCode, 409);
      assert.match(duplicateAccountJoin.body.error, /account is already seated/);
      assert.equal(duplicateAccountJoin.body.code, "duplicate_seat");

      const duplicateUsernameJoin = await requestJson(port, `/api/rooms/${roomCode}/join`, {
        method: "POST",
        body: {
          displayName: "  1V1  ",
          playerId: "second-device-username"
        }
      });
      assert.equal(duplicateUsernameJoin.statusCode, 409);
      assert.equal(duplicateUsernameJoin.body.code, "registered_username");
      assert.equal(duplicateUsernameJoin.body.error, "That username is already registered. Log in to use it.");

      const duplicateDisplayNameJoin = await requestJson(port, `/api/rooms/${roomCode}/join`, {
        method: "POST",
        body: {
          displayName: " mehdi   zerrad ",
          playerId: "second-device-display-name"
        }
      });
      assert.equal(duplicateDisplayNameJoin.statusCode, 409);
      assert.equal(duplicateDisplayNameJoin.body.code, "duplicate_name_or_account");
      assert.equal(duplicateDisplayNameJoin.body.error, "This account or name is already seated in this room.");

      const guestJoin = await requestJson(port, `/api/rooms/${roomCode}/join`, {
        method: "POST",
        body: {
          displayName: "Guest Bob",
          playerId: "guest-bob"
        }
      });
      assert.equal(guestJoin.statusCode, 200);
      assert.equal(guestJoin.body.seat, "player2");
      assert.equal(guestJoin.body.room.playerNames.player2, "Guest Bob");

      const updatedProfile = await requestJson(port, "/api/accounts/upgrade", {
        method: "POST",
        body: {
          accountId,
          username: "1v1",
          displayName: "Mehdi Updated"
        }
      });
      assert.equal(updatedProfile.statusCode, 201);
      assert.equal(updatedProfile.body.account.accountId, accountId);
      assert.equal(updatedProfile.body.account.displayName, "Mehdi Updated");
    } finally {
      await stopServer(server);
    }

    server = await startTestServer(port, stateFile);
    try {
      const reloadedProfile = await requestJson(port, `/api/accounts/${encodeURIComponent(accountId)}`);
      assert.equal(reloadedProfile.statusCode, 200);
      assert.equal(reloadedProfile.body.account.displayName, "Mehdi Updated");
      assert.equal(reloadedProfile.body.account.username, "1v1");
    } finally {
      await stopServer(server);
    }
  });
});

test("quick match API persists waiting entries and creates matched rooms", async () => {
  await withTempStateFile(async (stateFile) => {
    const port = 5209;
    let server = await startTestServer(port, stateFile);
    let accountId;
    let firstQueueId;

    try {
      const account = await requestJson(port, "/api/accounts/upgrade", {
        method: "POST",
        body: {
          username: "queue_alice",
          displayName: "Queue Alice"
        }
      });
      accountId = account.body.account.accountId;

      const first = await requestJson(port, "/api/quick-match", {
        method: "POST",
        body: {
          displayName: "Queue Alice",
          playerId: "alice-device",
          accountId,
          matchSettings: {
            modeId: "communityCompetitive",
            raceTo: 5,
            stickTheDealer: true
          }
        }
      });
      assert.equal(first.statusCode, 202);
      assert.equal(first.body.queue.status, "waiting");
      assert.equal(first.body.matched, false);
      firstQueueId = first.body.queue.queueId;

      const debugQueue = await requestJson(port, "/api/debug/quick-match");
      assert.equal(debugQueue.statusCode, 200);
      assert.equal(debugQueue.body.queue.length, 1);
      assert.equal(debugQueue.body.queue[0].queueId, firstQueueId);
      assert.equal(debugQueue.body.queue[0].status, "waiting");
      assert.equal(debugQueue.body.queue[0].raceTo, 5);
      assert.equal(debugQueue.body.queue[0].hasAccountId, true);
      assert.equal(debugQueue.body.queue[0].normalizedDisplayName, "queue alice");
      assert.equal(debugQueue.body.queue[0].matchedRoomCode, null);
      assert.equal("playerId" in debugQueue.body.queue[0], false);
      assert.equal("accountId" in debugQueue.body.queue[0], false);
      const debugJson = JSON.stringify(debugQueue.body);
      assert.equal(debugJson.includes("\"playerId\""), false);
      assert.equal(debugJson.includes("\"accountId\""), false);
      assert.equal(debugJson.includes("seatToken"), false);
      assert.equal(debugJson.includes("adminKey"), false);
      assert.equal(debugJson.includes("hiddenHands"), false);
    } finally {
      await stopServer(server);
    }

    server = await startTestServer(port, stateFile);
    try {
      const refreshed = await requestJson(port, "/api/quick-match", {
        method: "POST",
        body: {
          displayName: "Queue Alice Again",
          playerId: "alice-device",
          accountId,
          matchSettings: {
            modeId: "communityCompetitive",
            raceTo: 5,
            stickTheDealer: true
          }
        }
      });
      assert.equal(refreshed.statusCode, 202);
      assert.equal(refreshed.body.queue.queueId, firstQueueId);
      assert.equal(refreshed.body.queue.status, "waiting");

      const duplicateGuestQueue = await requestJson(port, "/api/quick-match", {
        method: "POST",
        body: {
          displayName: " QUEUE_ALICE ",
          playerId: "queue-imposter-device",
          matchSettings: {
            modeId: "communityCompetitive",
            raceTo: 5,
            stickTheDealer: true
          }
        }
      });
      assert.equal(duplicateGuestQueue.statusCode, 409);
      assert.equal(duplicateGuestQueue.body.code, "registered_username");
      assert.equal(duplicateGuestQueue.body.error, "That username is already registered. Log in to use it.");

      const raceToTen = await requestJson(port, "/api/quick-match", {
        method: "POST",
        body: {
          displayName: "Race Ten",
          playerId: "race-ten-device",
          matchSettings: {
            modeId: "communityCompetitive",
            raceTo: 10,
            stickTheDealer: true
          }
        }
      });
      assert.equal(raceToTen.statusCode, 202);
      assert.equal(raceToTen.body.queue.status, "waiting");
      assert.equal(raceToTen.body.matched, false);

      const matched = await requestJson(port, "/api/quick-match", {
        method: "POST",
        body: {
          displayName: "Queue Bob",
          playerId: "bob-device",
          matchSettings: {
            modeId: "communityCompetitive",
            raceTo: 5,
            stickTheDealer: true
          }
        }
      });
      assert.equal(matched.statusCode, 200);
      assert.equal(matched.body.matched, true);
      assert.equal(matched.body.queue.status, "matched");
      assert.ok(matched.body.matchedRoomCode);
      assert.equal(matched.body.room.viewerSeat, "player2");
      assert.equal(matched.body.room.playerNames.player1, "Queue Alice");
      assert.equal(matched.body.room.playerNames.player2, "Queue Bob");
      assert.equal(matched.body.room.matchSettings.raceTo, 5);

      const hostRestore = await requestJson(port, `/api/rooms/${matched.body.matchedRoomCode}?accountId=${encodeURIComponent(accountId)}`);
      assert.equal(hostRestore.statusCode, 200);
      assert.equal(hostRestore.body.viewerSeat, "player1");
      assert.equal(hostRestore.body.restoredBy, "accountId");

      const guestRestore = await requestJson(port, `/api/rooms/${matched.body.matchedRoomCode}?playerId=bob-device`);
      assert.equal(guestRestore.statusCode, 200);
      assert.equal(guestRestore.body.viewerSeat, "player2");
      assert.equal(guestRestore.body.restoredBy, "playerId");

      const hostReenter = await requestJson(port, "/api/quick-match", {
        method: "POST",
        body: {
          displayName: "Queue Alice",
          playerId: "alice-device",
          accountId,
          matchSettings: {
            modeId: "communityCompetitive",
            raceTo: 5,
            stickTheDealer: true
          }
        }
      });
      assert.equal(hostReenter.statusCode, 200);
      assert.equal(hostReenter.body.queue.queueId, firstQueueId);
      assert.equal(hostReenter.body.matched, true);
      assert.equal(hostReenter.body.matchedRoomCode, matched.body.matchedRoomCode);
      assert.equal(hostReenter.body.room.viewerSeat, "player1");

      const cancelled = await requestJson(port, "/api/quick-match/cancel", {
        method: "POST",
        body: {
          queueId: raceToTen.body.queue.queueId,
          playerId: "race-ten-device"
        }
      });
      assert.equal(cancelled.statusCode, 200);
      assert.equal(cancelled.body.queue.status, "cancelled");

      const privateRoom = await requestJson(port, "/api/rooms", {
        method: "POST",
        body: {
          displayName: "Private Host",
          playerId: "private-host-device",
          matchSettings: {
            modeId: "communityCompetitive",
            raceTo: 5,
            stickTheDealer: true
          }
        }
      });
      assert.equal(privateRoom.statusCode, 201);

      const privateJoin = await requestJson(port, `/api/rooms/${privateRoom.body.room.roomCode}/join`, {
        method: "POST",
        body: {
          displayName: "Private Guest",
          playerId: "private-guest-device"
        }
      });
      assert.equal(privateJoin.statusCode, 200);
      assert.equal(privateJoin.body.room.playerNames.player1, "Private Host");
      assert.equal(privateJoin.body.room.playerNames.player2, "Private Guest");
    } finally {
      await stopServer(server);
    }
  });
});

test("quick match API matches different accounts and account versus guest", async () => {
  await withTempStateFile(async (stateFile) => {
    const port = 5218;
    const server = await startTestServer(port, stateFile);

    try {
      const alice = await requestJson(port, "/api/accounts/upgrade", {
        method: "POST",
        body: {
          username: "qm_alice",
          displayName: "QM Alice"
        }
      });
      const bob = await requestJson(port, "/api/accounts/upgrade", {
        method: "POST",
        body: {
          username: "qm_bob",
          displayName: "QM Bob"
        }
      });

      const aliceQueue = await requestJson(port, "/api/quick-match", {
        method: "POST",
        body: {
          displayName: "QM Alice",
          playerId: "qm-alice-device",
          accountId: alice.body.account.accountId,
          matchSettings: {
            modeId: "communityCompetitive",
            raceTo: 10,
            stickTheDealer: true
          }
        }
      });
      assert.equal(aliceQueue.statusCode, 202);

      const bobMatch = await requestJson(port, "/api/quick-match", {
        method: "POST",
        body: {
          displayName: "QM Bob",
          playerId: "qm-bob-device",
          accountId: bob.body.account.accountId,
          matchSettings: {
            modeId: "communityCompetitive",
            raceTo: 10,
            stickTheDealer: true
          }
        }
      });
      assert.equal(bobMatch.statusCode, 200);
      assert.equal(bobMatch.body.matched, true);
      assert.ok(bobMatch.body.matchedRoomCode);
      assert.equal(bobMatch.body.room.viewerSeat, "player2");

      const alicePoll = await requestJson(port, "/api/quick-match", {
        method: "POST",
        body: {
          displayName: "QM Alice",
          playerId: "qm-alice-device",
          accountId: alice.body.account.accountId,
          matchSettings: {
            modeId: "communityCompetitive",
            raceTo: 10,
            stickTheDealer: true
          }
        }
      });
      assert.equal(alicePoll.statusCode, 200);
      assert.equal(alicePoll.body.matched, true);
      assert.equal(alicePoll.body.matchedRoomCode, bobMatch.body.matchedRoomCode);
      assert.equal(alicePoll.body.room.viewerSeat, "player1");

      const registered = await requestJson(port, "/api/accounts/upgrade", {
        method: "POST",
        body: {
          username: "registered_live",
          displayName: "Registered Live"
        }
      });
      const registeredWaiting = await requestJson(port, "/api/quick-match", {
        method: "POST",
        body: {
          displayName: "Registered Live",
          playerId: "registered-device",
          accountId: registered.body.account.accountId,
          matchSettings: {
            modeId: "communityCompetitive",
            raceTo: 5,
            stickTheDealer: true
          }
        }
      });
      assert.equal(registeredWaiting.statusCode, 202);

      const differentGuest = await requestJson(port, "/api/quick-match", {
        method: "POST",
        body: {
          displayName: "Legit Guest",
          playerId: "legit-guest-device",
          matchSettings: {
            modeId: "communityCompetitive",
            raceTo: 5,
            stickTheDealer: true
          }
        }
      });
      assert.equal(differentGuest.statusCode, 200);
      assert.equal(differentGuest.body.matched, true);
      assert.equal(differentGuest.body.room.playerNames.player1, "Registered Live");
      assert.equal(differentGuest.body.room.playerNames.player2, "Legit Guest");
    } finally {
      await stopServer(server);
    }
  });
});

test("leaderboard API reads persisted stats and hides private identifiers", async () => {
  await withTempStateFile(async (stateFile) => {
    await writeFile(stateFile, JSON.stringify({
      version: 1,
      savedAt: "2026-06-10T00:00:00.000Z",
      rooms: {},
      tournaments: {},
      accounts: {},
      leaderboardStats: {
        "account:account-alice": {
          playerId: "alice-device",
          accountId: "account-alice",
          displayName: "Alice",
          wins: 3,
          losses: 0,
          matchesPlayed: 3,
          pointsFor: 15,
          pointsAgainst: 4,
          tournamentWins: 1,
          updatedAt: "2026-06-10T00:00:00.000Z",
          seatToken: "private-seat-token",
          adminKey: "private-admin-key"
        },
        "guest:bob-device": {
          playerId: "bob-device",
          accountId: null,
          displayName: "Bob",
          wins: 3,
          losses: 2,
          matchesPlayed: 5,
          pointsFor: 23,
          pointsAgainst: 18,
          tournamentWins: 0,
          updatedAt: "2026-06-10T00:00:00.000Z"
        }
      }
    }, null, 2));

    const port = 5208;
    const server = await startTestServer(port, stateFile);

    try {
      const response = await requestJson(port, "/api/leaderboard");
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.body.leaderboard.map((row) => row.displayName), ["Alice", "Bob"]);
      assert.equal(response.body.leaderboard[0].rank, 1);
      assert.equal(response.body.leaderboard[0].wins, 3);
      assert.equal(response.body.leaderboard[0].winPercentage, 100);
      assert.equal(response.body.leaderboard[0].tournamentWins, 1);

      const publicJson = JSON.stringify(response.body);
      assert.doesNotMatch(publicJson, /account-alice/);
      assert.doesNotMatch(publicJson, /alice-device/);
      assert.doesNotMatch(publicJson, /bob-device/);
      assert.doesNotMatch(publicJson, /private-seat-token/);
      assert.doesNotMatch(publicJson, /private-admin-key/);
    } finally {
      await stopServer(server);
    }
  });
});

test("tournament history API sorts public persisted records newest first", async () => {
  await withTempStateFile(async (stateFile) => {
    await writeFile(stateFile, JSON.stringify({
      version: 1,
      savedAt: "2026-06-10T00:00:00.000Z",
      rooms: {},
      tournaments: {},
      accounts: {},
      leaderboardStats: {},
      quickMatchQueue: {},
      tournamentHistory: {
        OLDONE: {
          tournamentCode: "OLDONE",
          bracketSize: 4,
          championDisplayName: "Old Champion",
          runnerUpDisplayName: "Old Runner",
          completedAt: "2026-06-10T10:00:00.000Z",
          createdAt: "2026-06-10T09:00:00.000Z",
          matchCount: 3,
          rounds: 2,
          status: "complete",
          adminKey: "private-admin-key",
          seatToken: "private-seat-token"
        },
        NEWONE: {
          tournamentCode: "NEWONE",
          bracketSize: 8,
          championDisplayName: "New Champion",
          runnerUpDisplayName: "New Runner",
          completedAt: "2026-06-10T11:00:00.000Z",
          createdAt: "2026-06-10T09:30:00.000Z",
          matchCount: 7,
          rounds: 3,
          status: "complete"
        }
      }
    }, null, 2));

    const port = 5210;
    const server = await startTestServer(port, stateFile);

    try {
      const response = await requestJson(port, "/api/tournament-history");
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.body.history.map((record) => record.tournamentCode), ["NEWONE", "OLDONE"]);

      const detail = await requestJson(port, "/api/tournament-history/OLDONE");
      assert.equal(detail.statusCode, 200);
      assert.equal(detail.body.history.championDisplayName, "Old Champion");

      const publicJson = JSON.stringify(response.body);
      assert.doesNotMatch(publicJson, /private-admin-key/);
      assert.doesNotMatch(publicJson, /private-seat-token/);
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
      const restoredByPlayerId = await requestJson(port, `/api/rooms/${roomCode}?playerId=alice-player`);
      assert.equal(restoredByPlayerId.statusCode, 200);
      assert.equal(restoredByPlayerId.body.viewerSeat, "player1");
      assert.equal(restoredByPlayerId.body.alreadySeated, true);
      assert.equal(restoredByPlayerId.body.room.viewerSeat, "player1");
      assert.equal(restoredByPlayerId.body.room.alreadySeated, true);
      assert.equal(restoredByPlayerId.body.seat, "player1");
      assert.equal(restoredByPlayerId.body.seatToken, seatToken);
      assert.equal(restoredByPlayerId.body.restoredBy, "playerId");

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

test("completed tournament creates idempotent history that survives reload", async () => {
  await withTempStateFile(async (stateFile) => {
    const port = 5211;
    let server = await startTestServer(port, stateFile);
    let tournamentCode;
    let championId;

    try {
      const created = await requestJson(port, "/api/tournaments", {
        method: "POST",
        body: { bracketSize: 4 }
      });
      tournamentCode = created.body.tournament.tournamentCode;

      const emptyHistory = await requestJson(port, "/api/tournament-history");
      assert.equal(emptyHistory.statusCode, 200);
      assert.deepEqual(emptyHistory.body.history, []);

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
      const firstWinnerId = started.body.tournament.bracket.rounds[0].matches[0].player1.id;
      const secondWinnerId = started.body.tournament.bracket.rounds[0].matches[1].player1.id;

      await requestJson(port, `/api/tournaments/${tournamentCode}/admin/matches/r1m1/winner`, {
        method: "POST",
        body: { adminKey, round: 1, winnerId: firstWinnerId, source: "admin_mark_winner" }
      });
      const secondReported = await requestJson(port, `/api/tournaments/${tournamentCode}/admin/matches/r1m2/winner`, {
        method: "POST",
        body: { adminKey, round: 1, winnerId: secondWinnerId, source: "admin_mark_winner" }
      });
      const finalMatch = secondReported.body.tournament.bracket.rounds[1].matches[0];
      championId = finalMatch.player1.id;

      const finalReported = await requestJson(port, `/api/tournaments/${tournamentCode}/admin/matches/r2m1/winner`, {
        method: "POST",
        body: { adminKey, round: 2, winnerId: championId, source: "admin_mark_winner" }
      });
      assert.equal(finalReported.body.tournament.status, "complete");

      const duplicateFinal = await requestJson(port, `/api/tournaments/${tournamentCode}/admin/matches/r2m1/winner`, {
        method: "POST",
        body: { adminKey, round: 2, winnerId: championId, source: "admin_mark_winner" }
      });
      assert.equal(duplicateFinal.statusCode, 409);

      const history = await requestJson(port, "/api/tournament-history");
      assert.equal(history.statusCode, 200);
      assert.equal(history.body.history.length, 1);
      assert.equal(history.body.history[0].tournamentCode, tournamentCode);
      assert.equal(history.body.history[0].championDisplayName, "A");
      assert.equal(history.body.history[0].runnerUpDisplayName, "C");
      assert.equal(history.body.history[0].matchCount, 3);
      assert.equal(history.body.history[0].rounds, 2);
      assert.equal(history.body.history[0].status, "complete");

      const exportResponse = await requestJson(port, `/api/tournaments/${tournamentCode}/admin/export`, {
        method: "POST",
        body: { adminKey }
      });
      assert.equal(exportResponse.statusCode, 200);
      assert.equal(exportResponse.body.backup.history.tournamentCode, tournamentCode);

      const publicJson = JSON.stringify(history.body);
      assert.doesNotMatch(publicJson, /Zxcvfdsaqwer1287!/);
      assert.doesNotMatch(publicJson, /seatToken/);
      assert.doesNotMatch(publicJson, /hiddenHands/);
    } finally {
      await stopServer(server);
    }

    server = await startTestServer(port, stateFile);
    try {
      const reloadedHistory = await requestJson(port, "/api/tournament-history");
      assert.equal(reloadedHistory.statusCode, 200);
      assert.equal(reloadedHistory.body.history.length, 1);
      assert.equal(reloadedHistory.body.history[0].tournamentCode, tournamentCode);
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

test("public app files avoid restricted commerce wording except the approved free-play disclaimer", async () => {
  const files = await listPublicTextFiles();
  const restricted = /\b(cash games?|cash|bets?|betting|wagers?|wagering|gamble|gambling|buy-ins?|entry fees?|payouts?|prize pools?|prizes?|deposits?|withdraw|withdrawal|casino|real money|paid tournaments?|paid entries?)\b/i;

  assert.ok(files.includes("home.html"));
  assert.ok(files.includes("rules.html"));
  assert.ok(files.includes("src/info-panel.js"));

  for (const file of files) {
    const rawText = await readText(file);
    const text = rawText.replaceAll(freePlayDisclaimer, "");
    assert.equal(restricted.test(text), false, `${file} contains restricted public wording`);
  }
});

test("user-facing pages do not contain local-only links", async () => {
  const files = [
    "home.html",
    "rules.html",
    "room.html",
    "tournament.html",
    "tournament-history.html"
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

async function listPublicTextFiles(relativeDir = ".") {
  const ignoredDirectories = new Set([".data", "node_modules", "tests"]);
  const allowedExtensions = /\.(css|html|js|json|md)$/;
  const dirUrl = new URL(relativeDir === "." ? "./" : `${relativeDir}/`, appRoot);
  const entries = await readdir(dirUrl, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".well-known") continue;
    const relativePath = relativeDir === "." ? entry.name : `${relativeDir}/${entry.name}`;

    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) continue;
      files.push(...await listPublicTextFiles(relativePath));
      continue;
    }

    if (entry.isFile() && allowedExtensions.test(entry.name)) {
      files.push(relativePath);
    }
  }

  return files;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
