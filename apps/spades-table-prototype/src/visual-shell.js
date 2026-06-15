export function buildVisualShellModel(status) {
  if (!status) {
    return {
      roomCode: "none",
      phase: "none",
      viewerSeat: "none",
      currentTurn: "none",
      bidStatus: "Bid next: none",
      playableStatus: "Playable: 0",
      action: "No active room",
      handCards: [],
      currentTrick: "none",
      lastTrick: "none",
      scoreRows: [],
      bidBagRows: []
    };
  }

  const playableIds = new Set(status.playableCardStatus?.cardIds ?? []);
  const handCards = (status.hand ?? [])
    .map((card) => {
      const id = cardIdFor(card);
      const playable = playableIds.has(id);
      return {
        id,
        label: id,
        rank: card.rank,
        suit: card.suit,
        playable,
        ariaLabel: `${playable ? "Play" : "Unavailable"} ${card.rank} of ${card.suit}`,
        stateLabel: playable ? "Playable" : "Blocked"
      };
    })
    .sort(compareHandCards);

  return {
    roomCode: status.roomCode,
    phase: status.phase,
    viewerSeat: status.viewerSeat,
    currentTurn: status.currentTurn ?? "none",
    bidStatus: `Bid next: ${status.biddingStatus?.nextBidder ?? "none"}`,
    playableStatus: `Playable: ${status.playableCardStatus?.count ?? 0}`,
    action: formatActionStatus(status),
    handCards,
    currentTrick: formatTrick(status.currentTrick),
    lastTrick: status.lastTrick
      ? `${formatTrick(status.lastTrick.plays)} | winner ${status.lastTrick.winner}`
      : "none",
    scoreRows: ["player1", "player2"].map((seat) => ({
      seat,
      score: status.score[seat],
      tricks: status.tricksTaken[seat]
    })),
    bidBagRows: ["player1", "player2"].map((seat) => ({
      seat,
      bid: status.bids[seat],
      bags: status.bags[seat],
      ready: Boolean(status.playerReady[seat])
    }))
  };
}

export function buildVisualQaReport(status, {
  errorMessage = "",
  lastSuccessfulAction = "none",
  fixturePreset = "none",
  matchHistoryCount = 0,
  transportMode = "direct",
  localPlayerId = "unknown",
  displayName = "Player",
  seatBinding = "none",
  reconnectStatus = "unknown"
} = {}) {
  const model = buildVisualShellModel(status);
  const hasStatus = Boolean(status);
  const hiddenDetail = hiddenHandDetail(status);
  const contextMessages = [
    qaCheck("selected viewer", hasStatus, model.viewerSeat),
    qaCheck("hidden-hand status", hiddenHandProtected(status), hiddenDetail),
    qaCheck("phase", hasStatus && model.phase !== "none", model.phase),
    qaCheck("transport mode", Boolean(transportMode), transportMode),
    qaCheck("local player id", Boolean(localPlayerId), localPlayerId),
    qaCheck("display name", Boolean(displayName), displayName),
    qaCheck("seat binding", Boolean(seatBinding), seatBinding),
    qaCheck("reconnect status", Boolean(reconnectStatus), reconnectStatus),
    qaCheck("last successful action", lastSuccessfulAction !== "none", lastSuccessfulAction),
    qaCheck("fixture preset", fixturePreset !== "none", fixturePreset),
    qaCheck("match/history status", hasStatus, formatMatchHistoryStatus(status, matchHistoryCount))
  ];
  const checks = [
    qaCheck("current viewer seat", hasStatus && ["player1", "player2", "spectator"].includes(model.viewerSeat), model.viewerSeat),
    qaCheck("hidden hand protection", hiddenHandProtected(status), hiddenDetail),
    qaCheck("current phase", hasStatus && model.phase !== "none", model.phase),
    qaCheck("current turn", hasStatus && Boolean(model.currentTurn), model.currentTurn),
    qaCheck("playable card count", hasStatus && Number.isInteger(status.playableCardStatus?.count), model.playableStatus),
    qaCheck("current trick", hasStatus && typeof model.currentTrick === "string", model.currentTrick),
    qaCheck("last trick", hasStatus && typeof model.lastTrick === "string", model.lastTrick),
    qaCheck("score/bag/bid summary", model.scoreRows.length === 2 && model.bidBagRows.length === 2, formatSummaryCheck(model))
  ];

  const edgeMessages = buildEdgeMessages(status, errorMessage);

  return {
    overallPass: checks.every((check) => check.pass) && edgeMessages.every((message) => message.pass),
    contextMessages,
    checks,
    edgeMessages
  };
}

export function buildEdgeMessages(status, errorMessage = "") {
  const message = String(errorMessage ?? "");
  const messages = [];

  if (message) {
    messages.push(edgeMessage("last action", false, classifyActionError(message)));
  }
  if (!status) {
    messages.push(edgeMessage("reconnect/restore state", false, "No active sanitized room view"));
    return messages;
  }
  if (status.viewerSeat === "spectator") {
    messages.push(edgeMessage("room full/spectator", true, "Spectator view active; no private hand visible"));
  }
  if (status.phase === "match_complete") {
    messages.push(edgeMessage("match complete", true, `Winner ${status.winner ?? "pending"}`));
  }
  if (status.phase === "hand_complete") {
    messages.push(edgeMessage("hand complete", true, "Next hand controls are available"));
  }
  if (status.phase === "playing" && !status.currentPlayerStatus?.canAct) {
    messages.push(edgeMessage("stale turn", true, `Waiting for ${status.currentTurn}`));
  }

  return messages.length ? messages : [
    edgeMessage("edge states", true, "No edge-state warnings")
  ];
}

export function cardIdFor(card) {
  return `${card.rank}-${card.suit}`;
}

const rankDisplayOrder = new Map([
  ["A", 0],
  ["K", 1],
  ["Q", 2],
  ["J", 3],
  ["10", 4],
  ["9", 5],
  ["8", 6],
  ["7", 7],
  ["6", 8],
  ["5", 9],
  ["4", 10],
  ["3", 11],
  ["2", 12]
]);

const suitDisplayOrder = new Map([
  ["spades", 0],
  ["hearts", 1],
  ["diamonds", 2],
  ["clubs", 3]
]);

function compareHandCards(left, right) {
  const rankDiff = (rankDisplayOrder.get(left.rank) ?? 99) - (rankDisplayOrder.get(right.rank) ?? 99);
  if (rankDiff !== 0) return rankDiff;
  return (suitDisplayOrder.get(left.suit) ?? 99) - (suitDisplayOrder.get(right.suit) ?? 99);
}

function formatTrick(plays = []) {
  if (!plays.length) return "none";
  return plays.map((play) => `${play.player}:${cardIdFor(play.card)}`).join(", ");
}

function formatActionStatus(status) {
  if (status.phase === "waiting") {
    return `Ready: ${status.playerReady.player1 ? "P1 yes" : "P1 no"} / ${status.playerReady.player2 ? "P2 yes" : "P2 no"}`;
  }
  if (status.phase === "bidding") {
    return `Bid needed from ${status.biddingStatus.nextBidder ?? "none"}`;
  }
  if (status.phase === "playing") {
    return status.currentPlayerStatus.canAct
      ? "Play one highlighted card"
      : `Waiting for ${status.currentTurn}`;
  }
  if (status.phase === "hand_complete") {
    return "Hand complete: review summary or start next hand";
  }
  if (status.phase === "match_complete") {
    return "Match complete: record history or reset";
  }
  return "No action";
}

function qaCheck(name, pass, detail) {
  return {
    name,
    pass: Boolean(pass),
    detail: String(detail ?? "")
  };
}

function edgeMessage(name, pass, message) {
  return {
    name,
    pass: Boolean(pass),
    message
  };
}

function hiddenHandProtected(status) {
  if (!status) return false;
  if (status.viewerSeat === "spectator") return status.hand.length === 0;
  if (["player1", "player2"].includes(status.viewerSeat)) {
    return status.hand.length === (status.hiddenHandCounts?.[status.viewerSeat] ?? status.hand.length);
  }
  return false;
}

function hiddenHandDetail(status) {
  if (!status) return "No view";
  return `${status.viewerSeat} hand ${status.hand.length}; hidden ${status.hiddenHandCounts.player1}-${status.hiddenHandCounts.player2}`;
}

function formatSummaryCheck(model) {
  return [
    ...model.scoreRows.map((row) => `${row.seat} score ${row.score} tricks ${row.tricks}`),
    ...model.bidBagRows.map((row) => `${row.seat} bid ${row.bid ?? "none"} bags ${row.bags}`)
  ].join(" | ");
}

function formatMatchHistoryStatus(status, historyCount) {
  if (!status) return `no active match | history ${historyCount}`;
  return `${status.phase} | winner ${status.matchWinner ?? status.winner ?? "none"} | history ${historyCount}`;
}

function classifyActionError(message) {
  if (/Stale action expected .* turn|not this player's turn|bid turn/i.test(message)) return `Stale turn or wrong player action: ${message}`;
  if (/Stale action expected .* phase|Room must be in .* phase/i.test(message)) return `Stale phase: ${message}`;
  if (/0 through 13|invalid bid/i.test(message)) return `Invalid bid: ${message}`;
  if (/Illegal Spades play|not in the current player's hand|card/i.test(message)) return `Invalid card play: ${message}`;
  if (/spectator|Join this room|room full|already seated/i.test(message)) return `Room full/spectator: ${message}`;
  if (/match_complete|match complete|completed matches/i.test(message)) return `Match complete: ${message}`;
  if (/No active room|restore|reconnect/i.test(message)) return `Reconnect/restore state: ${message}`;
  return message;
}
