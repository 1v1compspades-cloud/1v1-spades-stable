export function createInMemoryRoomRepository(initialRooms = []) {
  const rooms = new Map();

  for (const room of initialRooms) {
    rooms.set(normalizeRoomCode(room.roomCode), room);
  }

  return {
    save(room) {
      const roomCode = normalizeRoomCode(room?.roomCode);
      if (!roomCode) {
        throw new Error("Room repository save requires a roomCode");
      }
      rooms.set(roomCode, room);
      return room;
    },

    get(roomCode) {
      return rooms.get(normalizeRoomCode(roomCode)) ?? null;
    },

    require(roomCode) {
      const room = rooms.get(normalizeRoomCode(roomCode));
      if (!room) {
        throw new Error("Room not found");
      }
      return room;
    },

    update(roomCode, updater) {
      const current = this.require(roomCode);
      const next = updater(current);
      this.save(next);
      return next;
    },

    has(roomCode) {
      return rooms.has(normalizeRoomCode(roomCode));
    },

    list() {
      return [...rooms.values()];
    }
  };
}

export function normalizeRoomCode(roomCode) {
  const value = String(roomCode ?? "").trim().toUpperCase();
  return value || null;
}
