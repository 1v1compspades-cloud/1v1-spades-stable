import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, access } from "node:fs/promises";
import http from "node:http";

const appRoot = new URL("../", import.meta.url);

test("home screen has the main routes and actions", async () => {
  const html = await readText("home.html");

  assert.match(html, /1V1 Euchre Free Play/);
  assert.match(html, /Create Room/);
  assert.match(html, /Join Room/);
  assert.match(html, /Quick Match/);
  assert.match(html, /Create Tournament/);
  assert.match(html, /Rules/);
  assert.match(html, /Free-play only/);
  assert.match(html, /No cash games\. No deposits\. No wallets\. No paid entries\./);
  assert.match(html, /Free-play competitive 1v1 Euchre/);
  assert.match(html, /Fair Play/);
  assert.match(html, /Discord\/community link placeholder/);
  assert.match(html, /Spectator views are read-only/);
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

  assert.match(html, /24-card deck/);
  assert.match(html, /right bower/);
  assert.match(html, /left bower/);
  assert.match(html, /counts as trump/);
  assert.match(html, /led immediately/);
  assert.match(html, /must follow/);
  assert.match(html, /First to 10/);
  assert.match(html, /Stick the Dealer is ON/);
  assert.match(html, /Fair Play/);
  assert.match(html, /Support/);
  assert.match(html, /hidden hands stay private/);
});

test("room screen exposes create, join, share, and spectator labels", async () => {
  const html = await readText("room.html");

  assert.match(html, /Create Room/);
  assert.match(html, /Join Room/);
  assert.match(html, /Copy Code/);
  assert.match(html, /Room Link/);
  assert.match(html, /Spectator view is read-only/);
});

test("Quick Match is wired as a placeholder", async () => {
  const client = await readText("src/home-client.js");

  assert.match(client, /\/api\/quick-match/);
  assert.match(client, /Quick Match coming next/);
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
});

test("server health check and root route work", async () => {
  const port = 5198;
  const server = spawn(process.execPath, ["server.js"], {
    cwd: new URL(".", appRoot),
    env: {
      ...process.env,
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
    assert.match(home.body, /1V1 Euchre Free Play/);
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
      if (output.includes(`port ${port}`)) {
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

function requestJson(port, path) {
  return requestText(port, path).then((result) => ({
    ...result,
    body: JSON.parse(result.body)
  }));
}

function requestText(port, path) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path,
      method: "GET"
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
    request.end();
  });
}
