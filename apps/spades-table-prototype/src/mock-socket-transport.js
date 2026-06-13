import { createMockSpadesTransport } from "./server-boundary.js";
import { sanitizeRoomForViewer } from "./room-state.js";

export function createMockSpadesSocketTransport({
  server = createMockSpadesTransport()
} = {}) {
  const clients = new Map();
  const subscriptions = new Map();

  function connect({
    clientId,
    playerId,
    seatToken
  } = {}) {
    const id = String(clientId ?? `client-${clients.size + 1}`).trim();
    const client = createSocketClient({
      clientId: id,
      identity: normalizeIdentity({ playerId, seatToken }),
      server,
      subscriptions,
      broadcastRoom,
      snapshotRoom
    });
    clients.set(id, client);
    return client;
  }

  function broadcastRoom(roomCode, context = {}) {
    const room = server.repository.get(roomCode);
    if (!room) return [];

    return subscribersFor(roomCode)
      .filter((client) => client.connected)
      .map((client) => client.receive(roomUpdateEvent(room, client.identity, context)));
  }

  function snapshotRoom(client, roomCode) {
    const room = server.repository.get(roomCode);
    if (!room || !client.connected) return null;
    return client.receive(roomUpdateEvent(room, client.identity, {
      eventType: "roomSnapshot",
      responseType: "snapshot",
      actionId: null,
      duplicate: false
    }));
  }

  function subscribersFor(roomCode) {
    const ids = subscriptions.get(roomCode) ?? new Set();
    return [...ids].map((clientId) => clients.get(clientId)).filter(Boolean);
  }

  return {
    server,
    repository: server.repository,
    connect,
    broadcastRoom,
    subscriptionsFor(roomCode) {
      return subscribersFor(roomCode);
    }
  };
}

function createSocketClient({
  clientId,
  identity,
  server,
  subscriptions,
  broadcastRoom,
  snapshotRoom
}) {
  const inbox = [];
  const subscribedRooms = new Set();
  let connected = true;
  let currentIdentity = identity;

  const client = {
    clientId,

    get identity() {
      return currentIdentity;
    },

    get connected() {
      return connected;
    },

    send(request = {}) {
      if (!connected) {
        const response = disconnectedResponse(request);
        this.receive(socketResponseEvent(response));
        return response;
      }

      const response = server.handle({
        ...request,
        identity: {
          ...currentIdentity,
          ...(request.identity ?? {})
        }
      });
      this.receive(socketResponseEvent(response));

      const roomCode = response.view?.roomCode ?? response.spectatorView?.roomCode ?? request.roomCode;
      if (response.ok && roomCode) {
        broadcastRoom(roomCode, {
          sourceClientId: clientId,
          requestId: response.requestId,
          responseType: response.type,
          actionId: response.actionId,
          duplicate: response.duplicate
        });
      }

      return response;
    },

    subscribe(roomCode, listener = null) {
      const normalizedRoomCode = String(roomCode ?? "").trim();
      if (!normalizedRoomCode) {
        throw new Error("Room code is required for subscription");
      }
      const roomSubscribers = subscriptions.get(normalizedRoomCode) ?? new Set();
      roomSubscribers.add(clientId);
      subscriptions.set(normalizedRoomCode, roomSubscribers);
      subscribedRooms.add(normalizedRoomCode);

      if (listener) {
        this.onMessage(listener);
      }
      snapshotRoom(this, normalizedRoomCode);

      return () => {
        roomSubscribers.delete(clientId);
        subscribedRooms.delete(normalizedRoomCode);
      };
    },

    disconnect() {
      connected = false;
      return { clientId, connected };
    },

    reconnect(nextIdentity = {}) {
      currentIdentity = normalizeIdentity({
        ...currentIdentity,
        ...nextIdentity
      });
      connected = true;
      for (const roomCode of subscribedRooms) {
        snapshotRoom(this, roomCode);
      }
      return { clientId, connected, identity: currentIdentity };
    },

    receive(event) {
      inbox.push(event);
      for (const listener of listeners) {
        listener(event);
      }
      return event;
    },

    messages() {
      return inbox.map(cloneEvent);
    },

    clearMessages() {
      inbox.length = 0;
    },

    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
  const listeners = new Set();

  return client;
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

function disconnectedResponse(request) {
  return {
    ok: false,
    statusCode: 499,
    requestId: request.requestId ?? null,
    type: request.type ?? null,
    actionId: request.actionId ?? null,
    duplicate: false,
    session: null,
    view: null,
    spectatorView: null,
    error: {
      message: "Socket is disconnected"
    }
  };
}

function normalizeIdentity(identity = {}) {
  return {
    playerId: String(identity.playerId ?? "").trim(),
    seatToken: String(identity.seatToken ?? "").trim() || undefined
  };
}

function cloneEvent(event) {
  return {
    ...event,
    view: event.view ? cloneView(event.view) : event.view,
    spectatorView: event.spectatorView ? cloneView(event.spectatorView) : event.spectatorView,
    error: event.error ? { ...event.error } : event.error
  };
}

function cloneView(view) {
  return {
    ...view,
    hand: [...(view.hand ?? [])],
    hiddenHandCounts: { ...(view.hiddenHandCounts ?? {}) },
    score: { ...(view.score ?? {}) },
    bags: { ...(view.bags ?? {}) },
    bids: { ...(view.bids ?? {}) },
    players: {
      player1: view.players?.player1 ? { ...view.players.player1 } : null,
      player2: view.players?.player2 ? { ...view.players.player2 } : null
    }
  };
}
