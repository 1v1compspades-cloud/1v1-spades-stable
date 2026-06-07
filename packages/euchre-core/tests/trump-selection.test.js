import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseTrump,
  createTrumpSelection,
  GAME_MODES,
  passTrump
} from "../src/index.js";

test("accepts the upcard suit in round 1 and records maker", () => {
  const state = createTrumpSelection({ upcardSuit: "hearts" });
  const chosen = chooseTrump(state, "player1", "hearts");

  assert.equal(chosen.trumpSuit, "hearts");
  assert.equal(chosen.maker, "player1");
  assert.equal(chosen.complete, true);
});

test("moves to round 2 after both players pass round 1", () => {
  const state = createTrumpSelection({ upcardSuit: "hearts" });
  const afterPasses = passTrump(passTrump(state, "player1"), "player2");

  assert.equal(afterPasses.round, 2);
  assert.equal(afterPasses.complete, false);
});

test("rejects choosing the upcard suit in round 2", () => {
  const state = passTrump(
    passTrump(createTrumpSelection({ upcardSuit: "hearts" }), "player1"),
    "player2"
  );

  assert.throws(() => chooseTrump(state, "player1", "hearts"), /upcard suit/);
});

test("Stick the Dealer forces dealer choice after all players pass twice", () => {
  let state = createTrumpSelection({
    dealer: "player2",
    upcardSuit: "hearts",
    mode: GAME_MODES.communityCompetitive
  });

  state = passTrump(state, "player1");
  state = passTrump(state, "player2");
  state = passTrump(state, "player1");
  state = passTrump(state, "player2");

  assert.equal(state.forcedDealerChoice, true);
  assert.throws(() => chooseTrump(state, "player1", "clubs"), /dealer/);

  const chosen = chooseTrump(state, "player2", "clubs");
  assert.equal(chosen.trumpSuit, "clubs");
  assert.equal(chosen.maker, "player2");
});

test("Classic Casual requires redeal after all players pass twice", () => {
  let state = createTrumpSelection({
    dealer: "player2",
    upcardSuit: "hearts",
    mode: GAME_MODES.classicCasual
  });

  state = passTrump(state, "player1");
  state = passTrump(state, "player2");
  state = passTrump(state, "player1");
  state = passTrump(state, "player2");

  assert.equal(state.complete, true);
  assert.equal(state.redealRequired, true);
});
