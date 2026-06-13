const DEFAULT_NAMESPACE = "spadesPrototype";

export function createLocalPlayerIdentityStore({
  storage = localStorage,
  namespace = DEFAULT_NAMESPACE,
  now = () => Date.now(),
  random = () => Math.random()
} = {}) {
  const key = `${namespace}:localIdentity`;

  function load() {
    const saved = readSavedIdentity();
    if (saved) return saved;

    const identity = {
      playerId: `player-${now().toString(36)}-${random().toString(36).slice(2, 10)}`,
      seatToken: `seat-${now().toString(36)}-${random().toString(36).slice(2, 10)}`,
      displayName: "Player",
      lastSession: null
    };
    save(identity);
    return identity;
  }

  function saveDisplayName(displayName) {
    const identity = load();
    const next = {
      ...identity,
      displayName: normalizeDisplayName(displayName)
    };
    save(next);
    return next;
  }

  function saveSession(session) {
    const identity = load();
    const next = {
      ...identity,
      lastSession: session ? {
        roomCode: session.roomCode,
        seat: session.seat,
        seatToken: session.seatToken,
        playerId: session.playerId
      } : null
    };
    save(next);
    return next;
  }

  function clearSession() {
    return saveSession(null);
  }

  function sessionIdentity() {
    const identity = load();
    return {
      playerId: identity.playerId,
      seatToken: identity.lastSession?.seatToken ?? identity.seatToken,
      displayName: identity.displayName,
      lastSession: identity.lastSession
    };
  }

  return {
    load,
    saveDisplayName,
    saveSession,
    clearSession,
    sessionIdentity
  };

  function readSavedIdentity() {
    try {
      const raw = storage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed.playerId || !parsed.seatToken) return null;
      return {
        playerId: String(parsed.playerId),
        seatToken: String(parsed.seatToken),
        displayName: normalizeDisplayName(parsed.displayName ?? "Player"),
        lastSession: parsed.lastSession ?? null
      };
    } catch {
      return null;
    }
  }

  function save(identity) {
    storage.setItem(key, JSON.stringify(identity));
  }
}

function normalizeDisplayName(displayName) {
  const value = String(displayName ?? "").trim();
  return (value || "Player").slice(0, 32);
}
