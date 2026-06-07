import test from "node:test";
import assert from "node:assert/strict";
import { GAME_MODES } from "../src/index.js";

test("Community Competitive defaults to Stick the Dealer and first to 10", () => {
  assert.equal(GAME_MODES.communityCompetitive.stickTheDealer, true);
  assert.equal(GAME_MODES.communityCompetitive.targetScore, 10);
});

test("Classic Casual redeals after a double pass", () => {
  assert.equal(GAME_MODES.classicCasual.stickTheDealer, false);
  assert.equal(GAME_MODES.classicCasual.redealOnDoublePass, true);
});

test("Fast Game plays to 5", () => {
  assert.equal(GAME_MODES.fastGame.targetScore, 5);
});

test("Tournament Mode locks rules with Stick the Dealer on and first to 10", () => {
  assert.equal(GAME_MODES.tournamentMode.stickTheDealer, true);
  assert.equal(GAME_MODES.tournamentMode.targetScore, 10);
  assert.equal(GAME_MODES.tournamentMode.rulesLocked, true);
});

test("Practice Mode enables hints", () => {
  assert.equal(GAME_MODES.practiceMode.hintsEnabled, true);
});
