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

  return {
    playerName,
    roomCode,
    playerIndex,
    isSpectator,
    savePlayerName,
    saveRoomCode,
    savePlayerIndex,
    saveIsSpectator,
    clearStorage
  };
}
