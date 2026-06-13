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
  await submitSmokeBids({ host, guest, roomCode: "SMOKE01" });
  const oneTrick = await playSmokeTrick({ host, guest, roomCode: "SMOKE01", sequenceStart: 1 });
  const completedHand = await completeSmokeHand({ host, guest, roomCode: "SMOKE01", sequenceStart: 3 });
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
    playOneTrickOk: oneTrick.completed === true && oneTrick.lastTrickWinner !== null,
    completeHandOk: completedHand.phase === "hand_complete" || completedHand.phase === "match_complete",
    reconnectOk: reconnected.connected === true && host.status?.viewerSeat === "player1",
    quickMatchOk: waiting.queue?.state === "waiting"
      && matched.queue?.state === "matched"
      && matched.view?.viewerSeat === "player2",
    hiddenHandSafe: spectator.status?.viewerSeat === "spectator"
      && Array.isArray(spectator.status.hand)
      && spectator.status.hand.length === 0
      && Array.isArray(host.status?.hand)
      && Array.isArray(guest.status?.hand)
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

async function submitSmokeBids({ host, guest, roomCode }) {
  const bids = { player1: 4, player2: 3 };
  let status = host.status;
  for (let sequence = 1; sequence <= 2; sequence += 1) {
    const seat = status.biddingStatus.nextBidder;
    const client = clientForSeat({ host, guest, seat });
    const response = await client.submitBid({
      bid: bids[seat],
      actionId: `${roomCode}:${seat}:bid:${sequence}`
    });
    status = response.view;
  }
}

async function playSmokeTrick({ host, guest, roomCode, sequenceStart }) {
  let result = null;
  let status = host.status;
  for (let offset = 0; offset < 2; offset += 1) {
    const seat = status.currentTurn;
    const client = clientForSeat({ host, guest, seat });
    const cardId = client.status.playableCardStatus.cardIds[0];
    result = await client.submitPlayCardById({
      cardId,
      actionId: `${roomCode}:${seat}:playCard:${sequenceStart + offset}`
    });
    status = result.view;
  }
  return {
    completed: result?.view?.lastTrick?.plays?.length === 2,
    lastTrickWinner: result?.view?.lastTrick?.winner ?? null
  };
}

async function completeSmokeHand({ host, guest, roomCode, sequenceStart }) {
  let sequence = sequenceStart;
  let guard = 0;
  let status = host.status;
  while (status?.phase === "playing" && guard < 26) {
    const seat = status.currentTurn;
    const client = clientForSeat({ host, guest, seat });
    const cardId = client.status.playableCardStatus.cardIds[0];
    const response = await client.submitPlayCardById({
      cardId,
      actionId: `${roomCode}:${seat}:playCard:${sequence}`
    });
    status = response.view;
    sequence += 1;
    guard += 1;
  }
  return {
    phase: status?.phase,
    guard
  };
}

function clientForSeat({ host, guest, seat }) {
  if (seat === "player1") return host;
  if (seat === "player2") return guest;
  throw new Error(`Smoke test expected player turn, got ${seat}`);
}
