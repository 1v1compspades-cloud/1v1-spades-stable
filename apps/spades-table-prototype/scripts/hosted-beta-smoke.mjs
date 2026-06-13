import WebSocket from "ws";
import { resolveClientEnvConfig } from "../src/env-config.js";
import { createSpadesServerClient } from "../src/server-client.js";
import {
  assertHostedBetaSmokePassed,
  runHostedBetaSmokeTest
} from "../src/hosted-beta-smoke.js";

const config = resolveSmokeConfig();

try {
  const result = await runHostedBetaSmokeTest({
    baseUrl: config.baseUrl,
    fetchImpl: fetch,
    createClient(playerId, seatToken) {
      return createSpadesServerClient({
        baseUrl: config.baseUrl,
        wsUrl: config.wsUrl,
        fetchImpl: fetch,
        WebSocketImpl: WebSocket,
        playerId,
        seatToken
      });
    }
  });

  assertHostedBetaSmokePassed(result);
  console.log("Spades hosted beta smoke test passed");
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error("Spades hosted beta smoke test failed");
  console.error(error?.message ?? error);
  process.exitCode = 1;
}

function resolveSmokeConfig() {
  const baseUrl = process.argv[2]
    ?? process.env.SPADES_PUBLIC_API_URL
    ?? process.env.PUBLIC_API_URL
    ?? resolveClientEnvConfig().publicApiUrl;
  const wsUrl = process.env.SPADES_PUBLIC_WS_URL
    ?? process.env.PUBLIC_WS_URL
    ?? toWebSocketUrl(baseUrl);

  if (!baseUrl) {
    throw new Error("Missing hosted smoke API URL. Pass one as an argument or set SPADES_PUBLIC_API_URL.");
  }
  if (!wsUrl) {
    throw new Error("Missing hosted smoke WebSocket URL. Set SPADES_PUBLIC_WS_URL.");
  }

  return { baseUrl: trimTrailingSlash(baseUrl), wsUrl };
}

function toWebSocketUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function trimTrailingSlash(value) {
  return value.replace(/\/$/, "");
}
