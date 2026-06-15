const DEFAULT_PORT = 5175;
const DEFAULT_LOCAL_HOST = "127.0.0.1";

export function resolveServerEnvConfig(env = globalThis.process?.env ?? {}) {
  const port = parsePort(env.PORT ?? env.SPADES_SERVER_PORT ?? DEFAULT_PORT);
  const renderApiUrl = renderPublicApiUrl(env);
  const publicApiUrl = normalizeUrl(env.SPADES_PUBLIC_API_URL ?? env.PUBLIC_API_URL)
    ?? renderApiUrl
    ?? `http://${DEFAULT_LOCAL_HOST}:${port}`;
  const publicWebSocketUrl = normalizeUrl(env.SPADES_PUBLIC_WS_URL ?? env.PUBLIC_WS_URL)
    ?? httpToWebSocketUrl(publicApiUrl);

  return {
    port,
    bindHost: env.SPADES_BIND_HOST ?? env.HOST ?? "0.0.0.0",
    publicApiUrl,
    publicWebSocketUrl,
    localApiUrl: `http://${DEFAULT_LOCAL_HOST}:${port}`,
    localWebSocketUrl: `ws://${DEFAULT_LOCAL_HOST}:${port}/ws`,
    missing: []
  };
}

export function resolveClientEnvConfig({
  env = globalThis.process?.env ?? {},
  location = globalThis.location
} = {}) {
  const port = parsePort(env.PORT ?? env.SPADES_SERVER_PORT ?? DEFAULT_PORT);
  const sameOriginApiUrl = location?.origin ? normalizeUrl(location.origin) : null;
  const localApiUrl = `http://${DEFAULT_LOCAL_HOST}:${port}`;
  const publicApiUrl = normalizeUrl(env.SPADES_PUBLIC_API_URL ?? env.PUBLIC_API_URL)
    ?? sameOriginApiUrl
    ?? localApiUrl;
  const publicWebSocketUrl = normalizeUrl(env.SPADES_PUBLIC_WS_URL ?? env.PUBLIC_WS_URL)
    ?? (location?.origin ? locationToWebSocketUrl(location) : null)
    ?? `ws://${DEFAULT_LOCAL_HOST}:${port}/ws`;

  return {
    port,
    bindHost: env.SPADES_BIND_HOST ?? env.HOST ?? DEFAULT_LOCAL_HOST,
    publicApiUrl,
    publicWebSocketUrl,
    localApiUrl,
    localWebSocketUrl: `ws://${DEFAULT_LOCAL_HOST}:${port}/ws`,
    missing: requiredHostedConfigWarnings({ env, location })
  };
}

export function requireHostedClientConfig(config) {
  if (config.missing?.length) {
    throw new Error(`Missing hosted Spades config: ${config.missing.join(", ")}`);
  }
  return config;
}

export function configSummary(config) {
  return {
    port: config.port,
    bindHost: config.bindHost,
    publicApiUrl: config.publicApiUrl,
    publicWebSocketUrl: config.publicWebSocketUrl,
    localApiUrl: config.localApiUrl,
    localWebSocketUrl: config.localWebSocketUrl,
    missing: [...(config.missing ?? [])]
  };
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid Spades server port: ${value}`);
  }
  return port;
}

function normalizeUrl(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.replace(/\/$/, "");
}

function renderPublicApiUrl(env) {
  const renderExternalUrl = normalizeUrl(env.RENDER_EXTERNAL_URL);
  if (renderExternalUrl) return renderExternalUrl;
  const renderHostname = String(env.RENDER_EXTERNAL_HOSTNAME ?? "").trim();
  return renderHostname ? `https://${renderHostname}` : null;
}

function httpToWebSocketUrl(apiUrl) {
  const url = new URL(apiUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function locationToWebSocketUrl(location) {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/ws`;
}

function requiredHostedConfigWarnings({ env, location }) {
  if (location?.origin) return [];
  const missing = [];
  if (!env.SPADES_PUBLIC_API_URL && !env.PUBLIC_API_URL) missing.push("SPADES_PUBLIC_API_URL");
  if (!env.SPADES_PUBLIC_WS_URL && !env.PUBLIC_WS_URL) missing.push("SPADES_PUBLIC_WS_URL");
  return missing;
}
