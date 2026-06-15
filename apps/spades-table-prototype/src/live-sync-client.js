import { createMockSpadesSocketTransport } from "./mock-socket-transport.js";

export function createSpadesLiveSyncClient({
  socketServer = createMockSpadesSocketTransport(),
  clientId,
  playerId,
  seatToken
} = {}) {
  const socket = socketServer.connect({ clientId, playerId, seatToken });
  const listeners = new Set();
  const actionSequences = new Map();
  let activeSession = null;
  let activeRoomCode = null;
  let currentView = null;
  let unsubscribeRoom = null;
  let lastResponse = null;

  socket.onMessage((event) => {
    if (event.type === "roomUpdate" || event.type === "roomSnapshot") {
      currentView = event.view;
      activeRoomCode = event.roomCode;
      emit({
        type: event.type,
        view: currentView,
        event
      });
    }
  });

  return {
    socket,
    socketServer,

    get session() {
      return activeSession ? { ...activeSession } : null;
    },

    get roomCode() {
      return activeRoomCode;
    },

    get status() {
      return currentView;
    },

    get lastResponse() {
      return lastResponse;
    },

    onStatus(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    createRoom(options = {}) {
      const response = sendAction("createRoom", {
        roomCode: options.roomCode,
        displayName: options.displayName,
        matchSettings: options.matchSettings,
        coinFlipWinner: options.coinFlipWinner,
        deck: options.deck,
        seatToken: options.seatToken
      });
      adoptSessionFromResponse(response);
      return response;
    },

    joinRoom(options = {}) {
      const response = sendAction("joinRoom", {
        roomCode: options.roomCode,
        displayName: options.displayName,
        seatToken: options.seatToken
      });
      adoptSessionFromResponse(response);
      return response;
    },

    readyPlayer(options = {}) {
      return sendAction("ready", {
        roomCode: options.roomCode,
        actionId: options.actionId,
        actionSequence: options.actionSequence
      });
    },

    submitBid({ bid, actionId, actionSequence, roomCode } = {}) {
      return sendAction("bid", {
        roomCode,
        bid,
        actionId,
        actionSequence
      });
    },

    submitPlayCardById({ cardId, actionId, actionSequence, roomCode } = {}) {
      return sendAction("playCard", {
        roomCode,
        cardId,
        actionId,
        actionSequence
      });
    },

    leaveRoom(options = {}) {
      const response = sendAction("leaveRoom", {
        roomCode: options.roomCode,
        actionId: options.actionId,
        actionSequence: options.actionSequence
      });
      if (response.ok) {
        activeSession = null;
        currentView = response.view;
      }
      return response;
    },

    startNextHand(options = {}) {
      return sendAction("nextHand", {
        roomCode: options.roomCode,
        actionId: options.actionId,
        actionSequence: options.actionSequence,
        deck: options.deck
      });
    },

    startNewMatch(options = {}) {
      return sendAction("newMatch", {
        roomCode: options.roomCode,
        actionId: options.actionId,
        actionSequence: options.actionSequence,
        deck: options.deck
      });
    },

    requestRematch(options = {}) {
      return sendAction("rematch", {
        roomCode: options.roomCode,
        actionId: options.actionId,
        actionSequence: options.actionSequence,
        deck: options.deck
      });
    },

    disconnect() {
      return socket.disconnect();
    },

    reconnect() {
      const result = socket.reconnect(activeSession ?? {});
      return {
        ...result,
        status: currentView
      };
    },

    messages() {
      return socket.messages();
    },

    clearMessages() {
      socket.clearMessages();
    }
  };

  function sendAction(type, options = {}) {
    const roomCode = options.roomCode ?? activeRoomCode;
    const requestIdentity = activeSession ? {
      playerId: activeSession.playerId,
      seatToken: activeSession.seatToken
    } : stripUndefined({
      seatToken: options.seatToken
    });
    const request = {
      requestId: options.requestId ?? createRequestId(type),
      type,
      roomCode,
      displayName: options.displayName,
      matchSettings: options.matchSettings,
      coinFlipWinner: options.coinFlipWinner,
      deck: options.deck,
      spectator: options.spectator === true,
      bid: options.bid,
      cardId: options.cardId,
      actionId: options.actionId,
      actionSequence: options.actionSequence,
      identity: requestIdentity
    };

    if (!request.actionId && isPlayerAction(type) && roomCode && currentView?.viewerSeat && currentView.viewerSeat !== "spectator") {
      request.actionId = `${roomCode}:${currentView.viewerSeat}:${type}:${nextSequence(type)}`;
    }

    lastResponse = socket.send(stripUndefined(request));
    if (lastResponse.view) {
      currentView = lastResponse.view;
    }
    return lastResponse;
  }

  function adoptSessionFromResponse(response) {
    if (!response.ok) return;

    if (response.session) {
      activeSession = { ...response.session };
      activeRoomCode = response.session.roomCode;
      socket.reconnect(activeSession);
    } else if (response.view?.roomCode) {
      if (response.view.viewerSeat === "spectator") activeSession = null;
      activeRoomCode = response.view.roomCode;
    }

    if (activeRoomCode) {
      if (unsubscribeRoom) unsubscribeRoom();
      unsubscribeRoom = socket.subscribe(activeRoomCode);
    }
    if (response.view) {
      currentView = response.view;
    }
  }

  function emit(update) {
    for (const listener of listeners) {
      listener(update);
    }
  }

  function nextSequence(type) {
    const current = actionSequences.get(type) ?? 0;
    const next = current + 1;
    actionSequences.set(type, next);
    return next;
  }
}

function createRequestId(type) {
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isPlayerAction(type) {
  return ["ready", "bid", "playCard", "leaveRoom", "nextHand", "newMatch", "rematch"].includes(type);
}

function stripUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
