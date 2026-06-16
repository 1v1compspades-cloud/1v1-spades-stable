export function cleanHomeRoomCodeForStatus(status) {
  return status?.roomCode ?? null;
}

export function isCleanHomeMode({ activePlayerScreen, cleanHomeRoomCode, status } = {}) {
  return activePlayerScreen === "lobby"
    && Boolean(cleanHomeRoomCode)
    && status?.roomCode === cleanHomeRoomCode;
}

export function buildPlayerNavigationVisibility({
  status,
  activePlayerScreen = "lobby",
  cleanHomeRoomCode = null,
  hasSavedRoom = false
} = {}) {
  const hasRoom = Boolean(status?.roomCode);
  const cleanHome = isCleanHomeMode({ activePlayerScreen, cleanHomeRoomCode, status });

  return Object.freeze({
    cleanHome,
    hasRoom,
    bodyHasRoom: hasRoom && !cleanHome,
    showUniversalHome: hasRoom && !cleanHome,
    showReconnect: cleanHome || (!hasRoom && hasSavedRoom),
    showRoomInvite: hasRoom && !cleanHome,
    showGlobalRoomInvite: hasRoom && !cleanHome
  });
}
