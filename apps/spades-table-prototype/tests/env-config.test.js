import test from "node:test";
import assert from "node:assert/strict";
import {
  configSummary,
  requireHostedClientConfig,
  resolveClientEnvConfig,
  resolveServerEnvConfig
} from "../src/env-config.js";

test("server env config resolves hosted urls and local fallbacks", () => {
  const config = resolveServerEnvConfig({
    PORT: "8080",
    SPADES_PUBLIC_API_URL: "https://spades.example.com/",
    SPADES_PUBLIC_WS_URL: "wss://spades.example.com/ws"
  });

  assert.deepEqual(configSummary(config), {
    port: 8080,
    bindHost: "0.0.0.0",
    publicApiUrl: "https://spades.example.com",
    publicWebSocketUrl: "wss://spades.example.com/ws",
    localApiUrl: "http://127.0.0.1:8080",
    localWebSocketUrl: "ws://127.0.0.1:8080/ws",
    missing: []
  });
});

test("client env config uses same-origin hosted urls when browser location exists", () => {
  const config = resolveClientEnvConfig({
    env: {},
    location: {
      origin: "https://spades-beta.example.com",
      protocol: "https:",
      host: "spades-beta.example.com"
    }
  });

  assert.equal(config.publicApiUrl, "https://spades-beta.example.com");
  assert.equal(config.publicWebSocketUrl, "wss://spades-beta.example.com/ws");
  assert.deepEqual(config.missing, []);
});

test("server env config uses Render public hostname when explicit URLs are missing", () => {
  const config = resolveServerEnvConfig({
    PORT: "10000",
    RENDER_EXTERNAL_HOSTNAME: "1v1spades.com"
  });

  assert.equal(config.publicApiUrl, "https://1v1spades.com");
  assert.equal(config.publicWebSocketUrl, "wss://1v1spades.com/ws");
  assert.equal(config.localApiUrl, "http://127.0.0.1:10000");
});

test("client env config reports missing hosted urls without location fallback", () => {
  const config = resolveClientEnvConfig({
    env: { PORT: "5175" },
    location: null
  });

  assert.deepEqual(config.missing, ["SPADES_PUBLIC_API_URL", "SPADES_PUBLIC_WS_URL"]);
  assert.throws(() => requireHostedClientConfig(config), /Missing hosted Spades config/);
});

test("env config rejects invalid ports with clear errors", () => {
  assert.throws(() => resolveServerEnvConfig({ PORT: "nope" }), /Invalid Spades server port/);
});
