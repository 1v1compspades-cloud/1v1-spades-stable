import { createSpadesAppController } from "./app-controller.js";
import { renderRoomShellText } from "./room-shell.js";
import {
  createInMemoryRoomRepository,
  createMemoryStorage,
  listFixturePresetNames,
  requireFixturePreset,
  selectFixtureView
} from "../../../packages/game-shell-core/src/index.js";

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
  return listFixturePresetNames(MANUAL_FIXTURE_PRESETS);
}

export function createTwoSeatManualHarness({
  roomCode = "LOCAL1",
  hostStorage = createMemoryStorage(),
  guestStorage = createMemoryStorage(),
  spectatorStorage = createMemoryStorage()
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
  const spectator = createSpadesAppController({
    repository,
    storage: spectatorStorage,
    createPlayerId: () => "manual-spectator"
  });
  let bidSequence = 0;

  return {
    repository,
    host,
    guest,
    spectator,
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
      const spectated = spectator.joinRoom({
        roomCode,
        seatToken: "manual-spectator-seat",
        displayName: "Spectator"
      });

      return { created, joined, spectated };
    },
    readyBoth() {
      return {
        host: host.readyPlayer(),
        guest: guest.readyPlayer()
      };
    },
    bidBoth({ hostBid = 4, guestBid = 3 } = {}) {
      bidSequence += 1;
      return {
        host: host.submitBid({ bid: hostBid, actionSequence: bidSequence }),
        guest: guest.submitBid({ bid: guestBid, actionSequence: bidSequence })
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
    statusForView(view = "host") {
      return selectFixtureView({
        host: host.getActiveRoomStatus(),
        guest: guest.getActiveRoomStatus(),
        spectator: spectator.getRoomStatus(roomCode)
      }, view);
    },
    runPreset(name) {
      const started = this.startPreset(name);
      const preset = started.preset;
      const played = this.playFullHand();
      const restored = preset.restoreAfter ? {
        host: host.restoreActiveRoom(),
        guest: guest.restoreActiveRoom()
      } : null;

      return {
        preset,
        started,
        played,
        restored,
        hostStatus: host.getActiveRoomStatus(),
        guestStatus: guest.getActiveRoomStatus()
      };
    },
    startPreset(name) {
      const preset = requireFixturePreset(MANUAL_FIXTURE_PRESETS, name);

      const setup = this.setup({
        deck: preset.deck(),
        matchSettings: preset.matchSettings
      });
      const ready = this.readyBoth();
      const bids = this.bidBoth({
        hostBid: preset.hostBid,
        guestBid: preset.guestBid
      });

      return {
        preset,
        setup,
        ready,
        bids,
        hostStatus: host.getActiveRoomStatus(),
        guestStatus: guest.getActiveRoomStatus(),
        spectatorStatus: spectator.getRoomStatus(roomCode)
      };
    },
    statusText(viewer = host) {
      const status = typeof viewer === "string" ? this.statusForView(viewer) : viewer.getActiveRoomStatus();
      return status ? renderRoomShellText(status) : "Manual harness idle.";
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
