export async function runHostedBetaSmokeTest({
  fetchImpl,
  createClient,
  baseUrl
} = {}) {
  if (!fetchImpl) throw new Error("Hosted beta smoke test requires fetchImpl");
  if (!createClient) throw new Error("Hosted beta smoke test requires createClient");
  if (!baseUrl) throw new Error("Hosted beta smoke test requires baseUrl");

  const health = await requestJson(fetchImpl, `${baseUrl}/health`);
  const host = createClient("smoke-host", "smoke-seat-host");
  const guest = createClient("smoke-guest", "smoke-seat-guest");
  const spectator = createClient("smoke-viewer", "smoke-seat-viewer");

  const created = await host.createRoom({ roomCode: "SMOKE01", displayName: "Smoke Host" });
  const joined = await guest.joinRoom({ roomCode: "SMOKE01", displayName: "Smoke Guest" });
  await spectator.joinRoom({ roomCode: "SMOKE01", displayName: "Smoke Viewer" });
  await host.readyPlayer({ actionId: "SMOKE01:player1:ready:1" });
  await guest.readyPlayer({ actionId: "SMOKE01:player2:ready:1" });
  const reconnected = await host.reconnect();

  const queueHost = createClient("smoke-q-host", "smoke-q-seat-host");
  const queueGuest = createClient("smoke-q-guest", "smoke-q-seat-guest");
  const waiting = await queueHost.joinQuickMatch({ displayName: "Queue Host", actionId: "smoke-q-host" });
  const matched = await queueGuest.joinQuickMatch({ displayName: "Queue Guest", actionId: "smoke-q-guest" });

  return {
    healthOk: health.ok === true,
    createRoomOk: created.ok === true && created.view?.viewerSeat === "player1",
    joinRoomOk: joined.ok === true && joined.view?.viewerSeat === "player2",
    webSocketConnected: host.connectionStatus === "connected" && guest.connectionStatus === "connected",
    reconnectOk: reconnected.connected === true && host.status?.viewerSeat === "player1",
    quickMatchOk: waiting.queue?.state === "waiting"
      && matched.queue?.state === "matched"
      && matched.view?.viewerSeat === "player2",
    hiddenHandSafe: spectator.status?.viewerSeat === "spectator"
      && Array.isArray(spectator.status.hand)
      && spectator.status.hand.length === 0
      && host.status?.hand?.length === 13
      && guest.status?.hand?.length === 13
  };
}

export function assertHostedBetaSmokePassed(result) {
  const failed = Object.entries(result)
    .filter(([, passed]) => passed !== true)
    .map(([name]) => name);
  if (failed.length) {
    throw new Error(`Hosted beta smoke test failed: ${failed.join(", ")}`);
  }
  return true;
}

async function requestJson(fetchImpl, url) {
  const response = await fetchImpl(url);
  return response.json();
}
