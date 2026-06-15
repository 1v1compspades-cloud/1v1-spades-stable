import WebSocket from "ws";
import { resolveClientEnvConfig } from "../src/env-config.js";
import { createSpadesServerClient } from "../src/server-client.js";
import {
  assertHostedBetaSmokePassed,
  runHostedBetaSmokeTest
} from "../src/hosted-beta-smoke.js";

const config = validateSmokeConfig(resolveSmokeConfig());
const clients = [];

try {
  console.log(`Smoke target API: ${config.baseUrl}`);
  console.log(`Smoke target WebSocket: ${config.wsUrl}`);

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
      clients.push(client);
      return client;
    }
  });

  assertHostedBetaSmokePassed(result);
  console.log("Spades hosted beta smoke test passed");
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error("Spades hosted beta smoke test failed");
  console.error(error?.message ?? error);
  process.exitCode = 1;
} finally {
  for (const client of clients) {
    client.disconnect();
  }
  process.exit(process.exitCode ?? 0);
}

function resolveSmokeConfig() {
  const baseUrl = process.argv[2]
    ?? process.env.SPADES_PUBLIC_API_URL
    ?? process.env.PUBLIC_API_URL
    ?? resolveClientEnvConfig().publicApiUrl;
  let wsUrl = process.env.SPADES_PUBLIC_WS_URL
    ?? process.env.PUBLIC_WS_URL
    ?? "";

  if (!baseUrl) {
    throw new Error("Missing hosted smoke API URL. Pass one as an argument or set SPADES_PUBLIC_API_URL.");
  }

  if (!wsUrl) {
    wsUrl = toWebSocketUrl(baseUrl);
  }

  if (!wsUrl) {
    throw new Error("Missing hosted smoke WebSocket URL. Set SPADES_PUBLIC_WS_URL.");
  }

  return { baseUrl: trimTrailingSlash(baseUrl), wsUrl };
}

function validateSmokeConfig(config) {
  const apiUrl = parseUrl(config.baseUrl, "API URL");
  const wsUrl = parseUrl(config.wsUrl, "WebSocket URL");

  if (!["http:", "https:"].includes(apiUrl.protocol)) {
    throw new Error("API URL must use http or https. Set SPADES_PUBLIC_API_URL to the hosted API origin.");
  }
  if (!["ws:", "wss:"].includes(wsUrl.protocol)) {
    throw new Error("WebSocket URL must use ws or wss. Set SPADES_PUBLIC_WS_URL to the hosted /ws endpoint.");
  }
  if (apiUrl.protocol === "https:" && wsUrl.protocol !== "wss:") {
    throw new Error("Hosted HTTPS API requires WSS. Use wss:// for SPADES_PUBLIC_WS_URL.");
  }

  return {
    baseUrl: trimTrailingSlash(apiUrl.toString()),
    wsUrl: wsUrl.toString()
  };
}

function parseUrl(value, label) {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL.`);
  }
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
