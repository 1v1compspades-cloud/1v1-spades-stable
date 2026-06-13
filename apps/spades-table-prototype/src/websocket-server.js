import { WebSocketServer } from "ws";
import { sanitizeRoomForViewer } from "./room-state.js";

const OPEN_SOCKET = 1;

export function attachSpadesWebSocketServer({
  httpServer,
  boundary,
  path = "/ws"
} = {}) {
  if (!httpServer) {
    throw new Error("HTTP server is required for Spades WebSocket support");
  }
  if (!boundary) {
    throw new Error("Spades server boundary is required for WebSocket support");
  }

  const wss = new WebSocketServer({ server: httpServer, path });
  const clients = new Map();
  const subscriptions = new Map();
  let nextClientNumber = 1;

  wss.on("connection", (socket) => {
    const clientId = `ws-${nextClientNumber}`;
    nextClientNumber += 1;
    const client = {
      clientId,
      socket,
      identity: {},
      subscribedRooms: new Set()
    };
    clients.set(clientId, client);
    send(socket, {
      type: "connected",
      clientId
    });

    socket.on("message", (rawMessage) => {
      const message = parseMessage(rawMessage);
      if (!message.ok) {
        send(socket, errorEvent(null, message.error.message));
        return;
      }

      handleClientMessage(client, message.value);
    });

    socket.on("close", () => {
      for (const roomCode of client.subscribedRooms) {
        subscriptions.get(roomCode)?.delete(clientId);
      }
      clients.delete(clientId);
    });
  });

  function handleClientMessage(client, message) {
    if (message.type === "identify") {
      client.identity = normalizeIdentity({
        ...client.identity,
        ...(message.identity ?? {})
      });
      send(client.socket, {
        type: "identified",
        clientId: client.clientId,
        identity: client.identity
      });
      return;
    }

    if (message.type === "subscribe") {
      client.identity = normalizeIdentity({
        ...client.identity,
        ...(message.identity ?? {})
      });
      subscribeClient(client, message.roomCode);
      sendSnapshot(client, message.roomCode);
      return;
    }

    if (message.type === "subscribeQueue") {
      client.identity = normalizeIdentity({
        ...client.identity,
        ...(message.identity ?? {})
      });
      client.subscribedRooms.add("__queue__");
      const roomSubscribers = subscriptions.get("__queue__") ?? new Set();
      roomSubscribers.add(client.clientId);
      subscriptions.set("__queue__", roomSubscribers);
      send(client.socket, {
        type: "queueStatus",
        queue: {
          state: "subscribed",
          waitingCount: 0
        }
      });
      return;
    }

    if (message.type === "action") {
      const request = {
        ...(message.request ?? {}),
        identity: normalizeIdentity({
          ...client.identity,
          ...(message.request?.identity ?? {})
        })
      };
      const response = boundary.handle(request);
      send(client.socket, socketResponseEvent(response));

      const roomCode = response.view?.roomCode ?? response.spectatorView?.roomCode ?? request.roomCode;
      if (response.ok && roomCode) {
        broadcastRoom(roomCode, {
          sourceClientId: client.clientId,
          requestId: response.requestId,
          responseType: response.type,
          actionId: response.actionId,
          duplicate: response.duplicate
        });
      }
      return;
    }

    if (message.type === "reconnect") {
      client.identity = normalizeIdentity({
        ...client.identity,
        ...(message.identity ?? {})
      });
      for (const roomCode of client.subscribedRooms) {
        sendSnapshot(client, roomCode);
      }
      return;
    }

    send(client.socket, errorEvent(message.requestId, `Unsupported WebSocket message type: ${message.type}`));
  }

  function subscribeClient(client, roomCode) {
    const normalizedRoomCode = String(roomCode ?? "").trim();
    if (!normalizedRoomCode) {
      send(client.socket, errorEvent(null, "Room code is required for subscription"));
      return;
    }

    const roomSubscribers = subscriptions.get(normalizedRoomCode) ?? new Set();
    roomSubscribers.add(client.clientId);
    subscriptions.set(normalizedRoomCode, roomSubscribers);
    client.subscribedRooms.add(normalizedRoomCode);
  }

  function sendSnapshot(client, roomCode) {
    const room = boundary.repository.get(roomCode);
    if (!room) {
      send(client.socket, errorEvent(null, "Room not found for snapshot"));
      return null;
    }

    const event = roomUpdateEvent(room, client.identity, {
      eventType: "roomSnapshot",
      responseType: "snapshot",
      actionId: null,
      duplicate: false
    });
    send(client.socket, event);
    return event;
  }

  function broadcastRoom(roomCode, context = {}) {
    const room = boundary.repository.get(roomCode);
    if (!room) return [];

    return [...(subscriptions.get(roomCode) ?? [])].flatMap((clientId) => {
      const client = clients.get(clientId);
      if (!client || client.socket.readyState !== OPEN_SOCKET) return [];

      const event = roomUpdateEvent(room, client.identity, context);
      send(client.socket, event);
      return [event];
    });
  }

  function broadcastQueue(payload = {}) {
    return [...(subscriptions.get("__queue__") ?? [])].flatMap((clientId) => {
      const client = clients.get(clientId);
      if (!client || client.socket.readyState !== OPEN_SOCKET) return [];
      const event = {
        type: "queueStatus",
        queue: payload.queue,
        match: matchForClient(payload.match, client.identity),
        view: viewForClient(payload.match, client.identity),
        spectatorView: payload.spectatorView ?? null
      };
      send(client.socket, event);
      return [event];
    });
  }

  return {
    wss,
    clients,
    subscriptions,
    broadcastRoom,
    broadcastQueue,
    close() {
      return new Promise((resolve) => wss.close(resolve));
    }
  };
}

function matchForClient(match, identity) {
  if (!match) return null;
  const player1 = match.player1?.identity?.playerId === identity.playerId;
  const player2 = match.player2?.identity?.playerId === identity.playerId;
  return {
    roomCode: match.roomCode,
    seat: player1 ? "player1" : (player2 ? "player2" : "spectator")
  };
}

function viewForClient(match, identity) {
  if (!match) return null;
  if (match.player1?.identity?.playerId === identity.playerId) return match.player1.response.view;
  if (match.player2?.identity?.playerId === identity.playerId) return match.player2.response.view;
  return match.spectatorView;
}

function roomUpdateEvent(room, identity, {
  eventType = "roomUpdate",
  sourceClientId = null,
  requestId = null,
  responseType = null,
  actionId = null,
  duplicate = false
} = {}) {
  return {
    type: eventType,
    roomCode: room.roomCode,
    sourceClientId,
    requestId,
    responseType,
    actionId,
    duplicate,
    view: sanitizeRoomForViewer(room, identity)
  };
}

function socketResponseEvent(response) {
  return {
    type: "actionResponse",
    requestId: response.requestId,
    responseType: response.type,
    actionId: response.actionId,
    duplicate: response.duplicate,
    ok: response.ok,
    statusCode: response.statusCode,
    error: response.error,
    view: response.view,
    spectatorView: response.spectatorView
  };
}

function errorEvent(requestId, message) {
  return {
    type: "error",
    requestId,
    ok: false,
    error: {
      message
    }
  };
}

function parseMessage(rawMessage) {
  try {
    return {
      ok: true,
      value: JSON.parse(String(rawMessage))
    };
  } catch {
    return {
      ok: false,
      error: {
        message: "WebSocket message must be valid JSON"
      }
    };
  }
}

function send(socket, message) {
  if (socket.readyState === OPEN_SOCKET) {
    socket.send(JSON.stringify(message));
  }
}

function normalizeIdentity(identity = {}) {
  return {
    playerId: String(identity.playerId ?? "").trim(),
    seatToken: String(identity.seatToken ?? "").trim() || undefined
  };
}
