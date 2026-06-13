import { DEFAULT_MATCH_SETTINGS } from "./index.js";

export function getMatchWinner({ score, targetScore = DEFAULT_MATCH_SETTINGS.targetScore } = {}) {
  const player1Score = Number(score?.player1 ?? 0);
  const player2Score = Number(score?.player2 ?? 0);
  const player1AtTarget = player1Score >= targetScore;
  const player2AtTarget = player2Score >= targetScore;

  if (!player1AtTarget && !player2AtTarget) {
    return null;
  }

  if (player1Score === player2Score) {
    return null;
  }

  return player1Score > player2Score ? "player1" : "player2";
}

export function isMatchComplete({ score, targetScore = DEFAULT_MATCH_SETTINGS.targetScore } = {}) {
  return Boolean(getMatchWinner({ score, targetScore }));
}
