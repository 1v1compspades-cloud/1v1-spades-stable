import { createLocalRoomSessionStorage } from "../../../packages/game-shell-core/src/index.js";

const spadesRoomSessionStorage = createLocalRoomSessionStorage({ namespace: "spades" });

export const {
  activeRoomSessionKey,
  roomSessionsKey,
  roomSeatTokenPrefix,
  saveActiveRoomSession,
  loadSavedActiveRoom,
  loadSavedRoomSession,
  clearSavedActiveRoom,
  roomSeatTokenKey
} = spadesRoomSessionStorage;
