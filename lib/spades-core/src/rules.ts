// Canonical 1v1 Competitive Spades scoring rules (house rules).
//
// These constants and pure helpers mirror the server-authoritative engine
// (artifacts/api-server/src/game/engine.ts) so every client can describe and
// display scoring consistently. The SERVER remains the sole authority for live
// scoring — these are shared definitions, not a replacement scoring engine.

/** Nil made (bid 0 and took 0 tricks): +100. */
export const NIL_MADE_BONUS = 100;

/** Nil failed (bid 0 but took >= 1 trick): base -100 (before adding trick points). */
export const NIL_FAILED_BASE_PENALTY = -100;

/**
 * Round score delta for a nil bid.
 * - Made nil  → +100.
 * - Failed nil → -100 + tricksTaken. Each trick taken adds +1 to the round
 *   score AND counts as a bag (so the usual bag-threshold penalties also apply
 *   to the updated bag count).
 *
 * Example: failed nil with 3 tricks → -100 + 3 = -97.
 */
export function nilRoundDelta(tricksTaken: number): number {
  return tricksTaken === 0 ? NIL_MADE_BONUS : NIL_FAILED_BASE_PENALTY + tricksTaken;
}

export interface BagRule {
  /** Number of bags that triggers one penalty. */
  threshold: number;
  /** Points subtracted per completed threshold (a positive magnitude). */
  penalty: number;
}

/**
 * Bag rule by race target:
 * - Race to 250 → every 5 bags = -50.
 * - Race to 500 → every 10 bags = -100.
 */
export function bagRuleForTarget(matchTarget: number): BagRule {
  return matchTarget >= 500
    ? { threshold: 10, penalty: 100 }
    : { threshold: 5, penalty: 50 };
}

/**
 * Given the fresh total bags accumulated in a round, return how many points to
 * subtract and how many bags carry into the next round (the rollover remainder).
 *
 * Mirrors engine.ts exactly:
 *   penalty     = floor(freshBags / threshold) * penaltyAmount
 *   carriedBags = freshBags % threshold
 *
 * Example: 6 bags @250 → { penalty: 50, carriedBags: 1 };
 *          11 bags @500 → { penalty: 100, carriedBags: 1 }.
 */
export function applyBagPenalty(
  matchTarget: number,
  freshBags: number,
): { penalty: number; carriedBags: number } {
  const { threshold, penalty } = bagRuleForTarget(matchTarget);
  return {
    penalty: Math.floor(freshBags / threshold) * penalty,
    carriedBags: freshBags % threshold,
  };
}
