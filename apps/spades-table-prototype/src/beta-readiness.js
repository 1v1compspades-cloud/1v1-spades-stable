export const MANUAL_BETA_FLOWS = Object.freeze([
  {
    id: "create-room-with-friend",
    label: "Create room with friend",
    steps: ["Create Room", "Share room code", "Friend joins", "Both players ready"]
  },
  {
    id: "join-room-with-code",
    label: "Join room with code",
    steps: ["Enter room code", "Join Room", "Confirm assigned seat", "Ready when both players are present"]
  },
  {
    id: "quick-match",
    label: "Quick Match",
    steps: ["Switch to Real Local Server", "Join Quick Match", "Wait for second tester", "Confirm matched room"]
  },
  {
    id: "reconnect",
    label: "Reconnect",
    steps: ["Disconnect or refresh", "Restore Active Room", "Confirm same seat and hidden-hand safety"]
  },
  {
    id: "leave-room",
    label: "Leave room",
    steps: ["Leave Active Room", "Confirm session clears", "Rejoin only through room code or restore flow"]
  },
  {
    id: "full-hand",
    label: "Full hand",
    steps: ["Ready both players", "Bid both players", "Play all tricks", "Review hand summary"]
  },
  {
    id: "full-match",
    label: "Full match",
    steps: ["Play hands until match_complete", "Record completed match", "Review stats/history panels"]
  },
  {
    id: "new-match",
    label: "New match",
    steps: ["Complete match", "Reset to New Match", "Confirm players remain and scores reset"]
  }
]);

export function buildBetaSafetyChecklist({
  status = null,
  transportMode = "direct",
  serverStatus = "local-only",
  webSocketStatus = "not-used",
  playerId = "unknown",
  lastAction = "none",
  lastError = ""
} = {}) {
  return [
    checklistItem("server status", Boolean(serverStatus), serverStatus),
    checklistItem("WebSocket status", Boolean(webSocketStatus), webSocketStatus),
    checklistItem("transport mode", Boolean(transportMode), transportMode),
    checklistItem("current room", Boolean(status?.roomCode), status?.roomCode ?? "none"),
    checklistItem("current player id", Boolean(playerId), playerId),
    checklistItem("current seat", Boolean(status?.viewerSeat), status?.viewerSeat ?? "none"),
    checklistItem("hidden-hand safe", hiddenHandSafe(status), hiddenHandDetail(status)),
    checklistItem("last action", lastAction !== "none", lastAction),
    checklistItem("last error", !lastError, lastError ? friendlyTesterError(lastError) : "none")
  ];
}

export function listManualBetaFlows() {
  return MANUAL_BETA_FLOWS.map((flow) => ({
    ...flow,
    steps: [...flow.steps]
  }));
}

export function friendlyTesterError(message) {
  const text = String(message ?? "").trim();
  if (!text) return "";
  if (/connection.*lost|socket.*closed|network.*fail|ECONN|fetch failed|WebSocket.*required|disconnected|timed out waiting|not connected/i.test(text)) {
    return "Connection lost. Check that the local server is running, then reconnect.";
  }
  if (/reconnect|restore|No active room/i.test(text)) {
    return "Reconnecting did not find an active room. Create or join a room again.";
  }
  if (/join.*failed|Room code.*required|invalid room code|missing room code/i.test(text)) {
    return "Join failed. Check the room code, then try Join Room again.";
  }
  if (/Room not found|not found for snapshot|No room found/i.test(text)) {
    return "Room not found. Check the room code and try again.";
  }
  if (/room full|spectator/i.test(text)) {
    return "Room is full. You are viewing as a spectator and cannot take player actions.";
  }
  if (/already seated|already.*room/i.test(text)) {
    return "This player is already seated in the room. Reconnect with the same local identity.";
  }
  if (/not this player's turn|bid turn|wrong player|Stale action expected .* turn/i.test(text)) {
    return "Wrong turn. Wait for the highlighted current player before acting.";
  }
  if (/Stale action expected .* phase|must be in .* phase/i.test(text)) {
    return "That action is no longer valid for this phase. Use the current room controls.";
  }
  if (/0 through 13|invalid bid|Bid request requires/i.test(text)) {
    return "Invalid bid. Enter a whole number from 0 through 13.";
  }
  if (/Illegal Spades play|not in the current player's hand|invalid card|card id/i.test(text)) {
    return "Invalid card. Choose one of the playable card buttons or visible card IDs.";
  }
  if (/Join this room before taking a player action|Player action identity|blocked/i.test(text)) {
    return "Spectator blocked. Join as player1 or player2 before taking that action.";
  }
  return text;
}

export function hiddenHandSafe(status) {
  if (!status) return false;
  if (status.viewerSeat === "spectator") return (status.hand ?? []).length === 0;
  if (["player1", "player2"].includes(status.viewerSeat)) {
    return (status.hand ?? []).length === (status.hiddenHandCounts?.[status.viewerSeat] ?? (status.hand ?? []).length);
  }
  return false;
}

function hiddenHandDetail(status) {
  if (!status) return "No active sanitized room view";
  const handCount = status.hand?.length ?? 0;
  const hidden = status.hiddenHandCounts
    ? `${status.hiddenHandCounts.player1}-${status.hiddenHandCounts.player2}`
    : "unknown";
  return `${status.viewerSeat} hand ${handCount}; hidden ${hidden}`;
}

function checklistItem(name, pass, detail) {
  return {
    name,
    pass: Boolean(pass),
    detail: String(detail ?? "")
  };
}
