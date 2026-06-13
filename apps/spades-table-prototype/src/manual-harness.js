import { createSpadesAppController } from "./app-controller.js";
import { createInMemoryRoomRepository } from "./room-repository.js";
import { renderRoomShellText } from "./room-shell.js";

export function createTwoSeatManualHarness({
  roomCode = "LOCAL1",
  hostStorage = createMemoryStorage(),
  guestStorage = createMemoryStorage()
} = {}) {
  const repository = createInMemoryRoomRepository();
  const host = createSpadesAppController({
    repository,
    storage: hostStorage,
    createPlayerId: () => "manual-host"
  });
  const guest = createSpadesAppController({
    repository,
    storage: guestStorage,
    createPlayerId: () => "manual-guest"
  });

  return {
    repository,
    host,
    guest,
    setup() {
      const created = host.createRoom({
        roomCode,
        seatToken: "manual-host-seat",
        displayName: "Host"
      });
      const joined = guest.joinRoom({
        roomCode,
        seatToken: "manual-guest-seat",
        displayName: "Guest"
      });

      return { created, joined };
    },
    readyBoth() {
      return {
        host: host.readyPlayer(),
        guest: guest.readyPlayer()
      };
    },
    bidBoth({ hostBid = 4, guestBid = 3 } = {}) {
      return {
        host: host.submitBid({ bid: hostBid, actionSequence: 1 }),
        guest: guest.submitBid({ bid: guestBid, actionSequence: 1 })
      };
    },
    playOneTrick() {
      const hostStatus = host.getActiveRoomStatus();
      const leader = hostStatus.currentTurn === "player1" ? host : guest;
      const follower = hostStatus.currentTurn === "player1" ? guest : host;
      const leadCard = leader.getActiveRoomStatus().hand[0];
      const led = leader.submitPlayCard({ card: leadCard, actionSequence: 1 });
      const followCard = follower.getActiveRoomStatus().hand.find((card) => (
        follower.getPlayableCardStatus().cardIds.includes(`${card.rank}-${card.suit}`)
      ));
      const followed = follower.submitPlayCard({ card: followCard, actionSequence: 1 });

      return { led, followed };
    },
    statusText(controller = host) {
      return renderRoomShellText(controller.getActiveRoomStatus());
    }
  };
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}
