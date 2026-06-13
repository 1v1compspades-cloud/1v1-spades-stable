export function createSpadesServerClient({
  baseUrl = "http://127.0.0.1:5175",
  wsUrl = "ws://127.0.0.1:5175/ws",
  fetchImpl = globalThis.fetch,
  WebSocketImpl = globalThis.WebSocket,
  playerId,
  seatToken
} = {}) {
  const listeners = new Set();
  const actionSequences = new Map();
  let socket = null;
  let connected = false;
  let activeSession = null;
  let activeRoomCode = null;
  let currentView = null;
  let lastResponse = null;
  let lastError = null;
  let queueStatus = null;
  let pending = [];

  const client = {
    get session() {
      return activeSession ? { ...activeSession } : null;
    },

    get roomCode() {
      return activeRoomCode;
    },

    get status() {
      return currentView;
    },

    get connectionStatus() {
      return connected ? "connected" : "disconnected";
    },

    get error() {
      return lastError;
    },

    get lastResponse() {
      return lastResponse;
    },

    get queueStatus() {
      return queueStatus;
    },

    onStatus(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async connect() {
      await connectSocket();
      return {
        connected,
        status: currentView
      };
    },

    async createRoom(options = {}) {
      const response = await postJson("/api/rooms", {
        roomCode: options.roomCode,
        displayName: options.displayName,
        matchSettings: options.matchSettings,
        coinFlipWinner: options.coinFlipWinner,
        deck: options.deck,
        identity: requestIdentity(options)
      });
      await adoptSessionFromResponse(response);
      return response;
    },

    async joinRoom(options = {}) {
      const response = await postJson(`/api/rooms/${encodeURIComponent(options.roomCode)}/join`, {
        displayName: options.displayName,
        identity: requestIdentity(options)
      });
      await adoptSessionFromResponse(response);
      return response;
    },

    readyPlayer(options = {}) {
      return playerAction("ready", endpointRoomCode(options), options);
    },

    submitBid(options = {}) {
      return playerAction("bid", endpointRoomCode(options), options);
    },

    submitPlayCardById(options = {}) {
      return playerAction("play-card", endpointRoomCode(options), {
        ...options,
        cardId: options.cardId
      });
    },

    async leaveRoom(options = {}) {
      const response = await playerAction("leave", endpointRoomCode(options), options);
      if (response.ok) {
        activeSession = null;
        currentView = response.view;
      }
      return response;
    },

    startNextHand(options = {}) {
      return playerAction("next-hand", endpointRoomCode(options), options);
    },

    startNewMatch(options = {}) {
      return playerAction("new-match", endpointRoomCode(options), options);
    },

    async joinQuickMatch(options = {}) {
      await subscribeQueue();
      const response = await postJson("/api/quick-match/join", {
        displayName: options.displayName,
        actionId: options.actionId,
        identity: requestIdentity(options)
      });
      await adoptQueueResponse(response);
      return response;
    },

    async leaveQuickMatch(options = {}) {
      const response = await postJson("/api/quick-match/leave", {
        actionId: options.actionId,
        identity: requestIdentity(options)
      });
      await adoptQueueResponse(response);
      return response;
    },

    async reconnect() {
      closeSocket();
      await connectSocket();
      if (activeRoomCode) {
        await subscribe(activeRoomCode);
      }
      return {
        connected,
        status: currentView
      };
    },

    disconnect() {
      closeSocket();
      return {
        connected,
        status: currentView
      };
    }
  };

  return client;

  async function playerAction(endpoint, roomCode, options = {}) {
    const response = await postJson(`/api/rooms/${encodeURIComponent(roomCode)}/${endpoint}`, {
      identity: requestIdentity(options),
      bid: options.bid,
      cardId: options.cardId,
      deck: options.deck,
      actionId: options.actionId ?? actionIdFor(endpoint, roomCode),
      actionSequence: options.actionSequence
    });
    lastResponse = response;
    if (response.view) {
      currentView = response.view;
    }
    return response;
  }

  async function postJson(path, body) {
    if (!fetchImpl) {
      throw new Error("fetch is required for Spades server client");
    }

    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(stripUndefined(body))
    });
    const payload = await response.json();
    lastResponse = payload;
    if (!payload.ok) {
      lastError = payload.error?.message ?? "Spades server request failed";
    }
    if (payload.view) {
      currentView = payload.view;
    }
    return payload;
  }

  async function adoptSessionFromResponse(response) {
    if (!response.ok) return;

    if (response.session) {
      activeSession = { ...response.session };
      activeRoomCode = response.session.roomCode;
    } else if (response.view?.roomCode) {
      activeRoomCode = response.view.roomCode;
    }
    if (response.view) {
      currentView = response.view;
    }
    if (activeRoomCode) {
      await subscribe(activeRoomCode);
    }
  }

  async function subscribe(roomCode) {
    await connectSocket();
    socket.send(JSON.stringify({
      type: "subscribe",
      roomCode,
      identity: requestIdentity()
    }));
    return waitForMessage((message) => (
      ["roomUpdate", "roomSnapshot"].includes(message.type) && message.roomCode === roomCode
    ));
  }

  async function subscribeQueue() {
    await connectSocket();
    socket.send(JSON.stringify({
      type: "subscribeQueue",
      identity: requestIdentity()
    }));
    return waitForMessage((message) => message.type === "queueStatus");
  }

  async function connectSocket() {
    if (connected && socket) return socket;
    if (!WebSocketImpl) {
      throw new Error("WebSocket is required for Spades server client");
    }

    socket = new WebSocketImpl(wsUrl);
    if (socket.addEventListener) {
      socket.addEventListener("message", handleSocketMessage);
      socket.addEventListener("close", () => {
        connected = false;
      });
    } else {
      socket.on("message", (rawMessage) => handleSocketMessage({ data: rawMessage }));
      socket.on("close", () => {
        connected = false;
      });
    }

    await waitForSocketOpen(socket);
    connected = true;
    socket.send(JSON.stringify({
      type: "identify",
      identity: requestIdentity()
    }));
    await waitForMessage((message) => message.type === "identified");
    return socket;
  }

  function handleSocketMessage(event) {
    const message = parseSocketMessage(event.data);
    if (message.type === "roomUpdate" || message.type === "roomSnapshot") {
      currentView = message.view;
      activeRoomCode = message.roomCode;
      emit({
        type: message.type,
        view: currentView,
        event: message
      });
    }
    if (message.type === "queueStatus") {
      queueStatus = message.queue;
      if (message.view) {
        currentView = message.view;
        activeRoomCode = message.view.roomCode;
      }
      emit({
        type: "queueStatus",
        view: currentView,
        queue: queueStatus,
        event: message
      });
    }
    for (const waiter of pending) {
      if (waiter.predicate(message)) {
        pending = pending.filter((candidate) => candidate !== waiter);
        waiter.resolve(message);
        break;
      }
    }
  }

  function waitForMessage(predicate) {
    return new Promise((resolve) => {
      pending.push({ predicate, resolve });
    });
  }

  function closeSocket() {
    if (socket && connected) {
      socket.close();
    }
    connected = false;
    socket = null;
    pending = [];
  }

  function requestIdentity(options = {}) {
    return stripUndefined(activeSession ? {
      playerId: activeSession.playerId,
      seatToken: activeSession.seatToken
    } : {
      playerId,
      seatToken: options.seatToken ?? seatToken
    });
  }

  function endpointRoomCode(options = {}) {
    const roomCode = options.roomCode ?? activeRoomCode;
    if (!roomCode) {
      throw new Error("Room code is required for server action");
    }
    return roomCode;
  }

  function actionIdFor(endpoint, roomCode) {
    if (!currentView?.viewerSeat || currentView.viewerSeat === "spectator") return undefined;
    const type = endpointToActionType(endpoint);
    const current = actionSequences.get(type) ?? 0;
    const next = current + 1;
    actionSequences.set(type, next);
    return `${roomCode}:${currentView.viewerSeat}:${type}:${next}`;
  }

  async function adoptQueueResponse(response) {
    queueStatus = response.queue;
    if (response.session) {
      activeSession = { ...response.session };
    }
    if (response.view) {
      currentView = response.view;
      activeRoomCode = response.view.roomCode;
      await subscribe(activeRoomCode);
    }
  }

  function emit(update) {
    for (const listener of listeners) {
      listener(update);
    }
  }
}

function waitForSocketOpen(socket) {
  return new Promise((resolve, reject) => {
    if (socket.readyState === 1) {
      resolve();
      return;
    }
    socket.addEventListener?.("open", resolve, { once: true });
    socket.addEventListener?.("error", reject, { once: true });
    socket.once?.("open", resolve);
    socket.once?.("error", reject);
  });
}

function parseSocketMessage(data) {
  return JSON.parse(typeof data === "string" ? data : String(data));
}

function endpointToActionType(endpoint) {
  return {
    ready: "ready",
    bid: "bid",
    "play-card": "playCard",
    leave: "leaveRoom",
    "next-hand": "nextHand",
    "new-match": "newMatch"
  }[endpoint] ?? endpoint;
}

function stripUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
