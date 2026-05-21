import { useState, useEffect } from "react";

export function useGameStorage() {
  const [playerName, setPlayerName] = useState(() => localStorage.getItem("spades_playerName") || "");
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem("spades_roomCode") || "");
  const [playerIndex, setPlayerIndex] = useState<0 | 1 | null>(() => {
    const saved = localStorage.getItem("spades_playerIndex");
    return saved ? (parseInt(saved) as 0 | 1) : null;
  });

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

  const clearStorage = () => {
    setRoomCode("");
    setPlayerIndex(null);
    localStorage.removeItem("spades_roomCode");
    localStorage.removeItem("spades_playerIndex");
  };

  return {
    playerName,
    roomCode,
    playerIndex,
    savePlayerName,
    saveRoomCode,
    savePlayerIndex,
    clearStorage
  };
}
