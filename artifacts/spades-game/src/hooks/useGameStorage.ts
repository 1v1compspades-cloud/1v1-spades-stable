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

  // ── Host token (creator-only secret) ─────────────────────────────────────
  // SECURITY: the host token MUST live under a dedicated key, never the shared
  // `spades_tournament_token_` key. Players store their per-player reconnect
  // token under that shared key, so if host detection keyed off it, every
  // joined player would inherit Host Tools. Only the original creating browser
  // ever writes this key (Lobby create flow). It is never written by any join,
  // backup-join, or reconnect path, so the host token can never be copied to a
  // player. Same TTL-wrapped JSON shape as the other tokens.
  const hostTokenKey = (code: string) => `spades_tournament_host_token_${code.toUpperCase()}`;
  const saveHostToken = (code: string, token: string) => {
    localStorage.setItem(
      hostTokenKey(code),
      JSON.stringify({ token, savedAt: Date.now() })
    );
  };
  const getHostToken = (code: string): string | null => {
    const raw = localStorage.getItem(hostTokenKey(code));
    if (!raw) return null;
    if (!raw.startsWith("{")) {
      saveHostToken(code, raw);
      return raw;
    }
    try {
      const parsed = JSON.parse(raw) as { token?: string; savedAt?: number };
      if (!parsed?.token || !parsed?.savedAt) {
        localStorage.removeItem(hostTokenKey(code));
        return null;
      }
      if (Date.now() - parsed.savedAt > TOKEN_TTL_MS) {
        localStorage.removeItem(hostTokenKey(code));
        return null;
      }
      return parsed.token;
    } catch {
      localStorage.removeItem(hostTokenKey(code));
      return null;
    }
  };
  const clearHostToken = (code: string) => {
    localStorage.removeItem(hostTokenKey(code));
  };

  // ── Per-room player tokens (per-seat secret) ─────────────────────────────
  // Keyed by (roomCode, seat). Same TTL-wrapped JSON shape as tournament
  // tokens so the sweep below catches both. The server is auth-of-record:
  // a stale or wrong token is rejected and the user is asked to rejoin.
  const playerTokenKey = (code: string, seat: 0 | 1) =>
    `spades_player_token_${code.toUpperCase()}_${seat}`;
  const savePlayerToken = (code: string, seat: 0 | 1, token: string) => {
    localStorage.setItem(
      playerTokenKey(code, seat),
      JSON.stringify({ token, savedAt: Date.now() }),
    );
  };
  const getPlayerToken = (code: string, seat: 0 | 1): string | null => {
    const raw = localStorage.getItem(playerTokenKey(code, seat));
    if (!raw) return null;
    if (!raw.startsWith("{")) {
      savePlayerToken(code, seat, raw);
      return raw;
    }
    try {
      const parsed = JSON.parse(raw) as { token?: string; savedAt?: number };
      if (!parsed?.token || !parsed?.savedAt) {
        localStorage.removeItem(playerTokenKey(code, seat));
        return null;
      }
      if (Date.now() - parsed.savedAt > TOKEN_TTL_MS) {
        localStorage.removeItem(playerTokenKey(code, seat));
        return null;
      }
      return parsed.token;
    } catch {
      localStorage.removeItem(playerTokenKey(code, seat));
      return null;
    }
  };
  const clearPlayerToken = (code: string, seat: 0 | 1) => {
    localStorage.removeItem(playerTokenKey(code, seat));
  };

  // One-time sweep on mount: drop any expired tournament/player tokens left
  // behind from past sessions, so localStorage doesn't grow unbounded.
  useEffect(() => {
    try {
      const prefixes = ["spades_tournament_token_", "spades_tournament_host_token_", "spades_player_token_"];
      const now = Date.now();
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (!k || !prefixes.some((p) => k.startsWith(p))) continue;
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
    saveHostToken,
    getHostToken,
    clearHostToken,
    savePlayerToken,
    getPlayerToken,
    clearPlayerToken,
  };
}
