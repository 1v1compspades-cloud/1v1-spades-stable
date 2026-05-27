import { useState, useEffect } from "react";

export function useGameStorage() {
  const [playerName, setPlayerName] = useState(() => localStorage.getItem("spades_playerName") || "");
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem("spades_roomCode") || "");
  const [playerIndex, setPlayerIndex] = useState<0 | 1 | null>(() => {
    const saved = localStorage.getItem("spades_playerIndex");
    return saved ? (parseInt(saved) as 0 | 1) : null;
  });
  const [isSpectator, setIsSpectator] = useState<boolean>(
    () => localStorage.getItem("spades_isSpectator") === "1"
  );

  const savePlayerName = (name: string) => {
    setPlayerName(name);
    localStorage.setItem("spades_playerName", name);
  };

  const saveRoomCode = (code: string) => {
    setRoomCode(code);
    localStorage.setItem("spades_roomCode", code);
  };

  const savePlayerIndex = (index: 0 | 1 | null) => {
    setPlayerIndex(index);
    if (index !== null) {
      localStorage.setItem("spades_playerIndex", index.toString());
    } else {
      localStorage.removeItem("spades_playerIndex");
    }
  };

  const saveIsSpectator = (v: boolean) => {
    setIsSpectator(v);
    if (v) localStorage.setItem("spades_isSpectator", "1");
    else localStorage.removeItem("spades_isSpectator");
  };

  const clearStorage = () => {
    setRoomCode("");
    setPlayerIndex(null);
    setIsSpectator(false);
    localStorage.removeItem("spades_roomCode");
    localStorage.removeItem("spades_playerIndex");
    localStorage.removeItem("spades_isSpectator");
  };

  // ── Tournament tokens (per-tournament secret, keyed by tournament code) ──
  // Stored as JSON `{ token, savedAt }`. Tokens older than TTL are silently
  // dropped on read (the server still has the auth-of-record). This keeps
  // localStorage from accumulating stale entries forever, and avoids
  // surfacing stale identities into long-finished tournaments.
  const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
  const tournamentTokenKey = (code: string) => `spades_tournament_token_${code.toUpperCase()}`;
  const saveTournamentToken = (code: string, token: string) => {
    localStorage.setItem(
      tournamentTokenKey(code),
      JSON.stringify({ token, savedAt: Date.now() })
    );
  };
  const getTournamentToken = (code: string): string | null => {
    const raw = localStorage.getItem(tournamentTokenKey(code));
    if (!raw) return null;
    // Back-compat: older entries were stored as the bare token string.
    if (!raw.startsWith("{")) {
      // Wrap-and-resave so future reads use the new format.
      saveTournamentToken(code, raw);
      return raw;
    }
    try {
      const parsed = JSON.parse(raw) as { token?: string; savedAt?: number };
      if (!parsed?.token || !parsed?.savedAt) {
        localStorage.removeItem(tournamentTokenKey(code));
        return null;
      }
      if (Date.now() - parsed.savedAt > TOKEN_TTL_MS) {
        localStorage.removeItem(tournamentTokenKey(code));
        return null;
      }
      return parsed.token;
    } catch {
      localStorage.removeItem(tournamentTokenKey(code));
      return null;
    }
  };
  const clearTournamentToken = (code: string) => {
    localStorage.removeItem(tournamentTokenKey(code));
  };

  // One-time sweep on mount: drop any expired tournament tokens left behind
  // from past sessions, so localStorage doesn't grow unbounded.
  useEffect(() => {
    try {
      const prefix = "spades_tournament_token_";
      const now = Date.now();
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(prefix)) continue;
        const raw = localStorage.getItem(k);
        if (!raw || !raw.startsWith("{")) continue;
        try {
          const parsed = JSON.parse(raw) as { savedAt?: number };
          if (!parsed?.savedAt || now - parsed.savedAt > TOKEN_TTL_MS) {
            localStorage.removeItem(k);
          }
        } catch {
          localStorage.removeItem(k);
        }
      }
    } catch {
      // best-effort cleanup; ignore quota / privacy-mode errors
    }
  }, []);

  return {
    playerName,
    roomCode,
    playerIndex,
    isSpectator,
    savePlayerName,
    saveRoomCode,
    savePlayerIndex,
    saveIsSpectator,
    clearStorage,
    saveTournamentToken,
    getTournamentToken,
    clearTournamentToken,
  };
}
