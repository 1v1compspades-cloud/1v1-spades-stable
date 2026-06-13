import { createSpadesAppController } from "./app-controller.js";
import { createInMemoryRoomRepository } from "./room-repository.js";
import { renderRoomShellText } from "./room-shell.js";

export const MANUAL_FIXTURE_PRESETS = Object.freeze({
  "nil-made": Object.freeze({
    description: "Player 2 bids nil and takes zero tricks.",
    hostBid: 4,
    guestBid: 0,
    deck: player1WinsEveryTrickDeck
  }),
  "nil-failed": Object.freeze({
    description: "Player 2 bids nil and wins the opening trick.",
    hostBid: 4,
    guestBid: 0,
    deck: player2HighDeck
  }),
  "bag-penalty": Object.freeze({
    description: "Player 1 overtricks enough to trigger a bag penalty.",
    hostBid: 3,
    guestBid: 3,
    deck: player1WinsEveryTrickDeck
  }),
  "close-game": Object.freeze({
    description: "A normal close-score hand for text-mode manual review.",
    hostBid: 6,
    guestBid: 6,
    deck: player2HighDeck
  }),
  "match-win": Object.freeze({
    description: "Player 1 reaches the target score after one hand.",
    hostBid: 4,
    guestBid: 3,
    deck: player1WinsEveryTrickDeck,
    matchSettings: Object.freeze({ targetScore: 40 })
  }),
  "reconnect-after-hand": Object.freeze({
    description: "Complete a hand, then restore both local sessions.",
    hostBid: 4,
    guestBid: 3,
    deck: player1WinsEveryTrickDeck,
    restoreAfter: "hand_complete"
  }),
  "reconnect-after-match-complete": Object.freeze({
    description: "Complete a match, then restore both local sessions.",
    hostBid: 4,
    guestBid: 3,
    deck: player1WinsEveryTrickDeck,
    matchSettings: Object.freeze({ targetScore: 40 }),
    restoreAfter: "match_complete"
  })
});

export function listManualFixturePresets() {
  return Object.keys(MANUAL_FIXTURE_PRESETS);
}

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
    setup({ deck, matchSettings } = {}) {
      const created = host.createRoom({
        roomCode,
        seatToken: "manual-host-seat",
        displayName: "Host",
        deck,
        matchSettings
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
      const led = leader.submitPlayCard({ card: leadCard });
      const followCard = follower.getActiveRoomStatus().hand.find((card) => (
        follower.getPlayableCardStatus().cardIds.includes(`${card.rank}-${card.suit}`)
      ));
      const followed = follower.submitPlayCard({ card: followCard });

      return { led, followed };
    },
    playFullHand({ maxTricks = 13 } = {}) {
      let latest = null;
      for (let trick = 0; trick < maxTricks && host.getActiveRoomStatus()?.phase === "playing"; trick += 1) {
        latest = this.playOneTrick();
      }
      return latest;
    },
    startNextHand(controller = host) {
      return controller.startNextHand();
    },
    startNewMatch(controller = host) {
      return controller.startNewMatch();
    },
    listPresets() {
      return listManualFixturePresets();
    },
    runPreset(name) {
      const preset = MANUAL_FIXTURE_PRESETS[name];
      if (!preset) {
        throw new Error(`Unknown manual fixture preset: ${name}`);
      }

      this.setup({
        deck: preset.deck(),
        matchSettings: preset.matchSettings
      });
      this.readyBoth();
      this.bidBoth({
        hostBid: preset.hostBid,
        guestBid: preset.guestBid
      });
      const played = this.playFullHand();
      const restored = preset.restoreAfter ? {
        host: host.restoreActiveRoom(),
        guest: guest.restoreActiveRoom()
      } : null;

      return {
        preset,
        played,
        restored,
        hostStatus: host.getActiveRoomStatus(),
        guestStatus: guest.getActiveRoomStatus()
      };
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

function player1WinsEveryTrickDeck() {
  return [
    ...cards("spades", ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"]),
    ...cards("clubs", ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"]),
    ...cards("hearts", ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]),
    ...cards("diamonds", ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"])
  ];
}

function player2HighDeck() {
  return orderedDeck({
    player1Cards: [
      ...cards("clubs", ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]),
      { rank: "2", suit: "hearts" }
    ],
    player2Cards: [
      { rank: "A", suit: "clubs" },
      ...cards("diamonds", ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"])
    ]
  });
}

function cards(suit, ranks) {
  return ranks.map((rank) => ({ rank, suit }));
}

function orderedDeck({ player1Cards, player2Cards }) {
  const used = new Set([...player1Cards, ...player2Cards].map((card) => `${card.rank}-${card.suit}`));
  const stock = ["clubs", "diamonds", "hearts", "spades"].flatMap((suit) => (
    ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]
      .map((rank) => ({ rank, suit }))
      .filter((card) => !used.has(`${card.rank}-${card.suit}`))
  ));

  return [...player1Cards, ...player2Cards, ...stock];
}
