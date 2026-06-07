import { cardsEqual } from "../../../packages/euchre-core/src/index.js";
import {
  availableTrumpSuits,
  cardLabel,
  chooseTrumpForCurrentPlayer,
  createMatch,
  currentTrumpActor,
  passTrumpForCurrentPlayer,
  playableCardsFor,
  playCard,
  startNewHand,
  suitSymbol
} from "./table-state.js";

const elements = {
  modeSelect: document.querySelector("#modeSelect"),
  newHandButton: document.querySelector("#newHandButton"),
  player1Score: document.querySelector("#player1Score"),
  player2Score: document.querySelector("#player2Score"),
  targetScore: document.querySelector("#targetScore"),
  statusText: document.querySelector("#statusText"),
  player1Hand: document.querySelector("#player1Hand"),
  player2Hand: document.querySelector("#player2Hand"),
  player1Tricks: document.querySelector("#player1Tricks"),
  player2Tricks: document.querySelector("#player2Tricks"),
  kittyCount: document.querySelector("#kittyCount"),
  upcard: document.querySelector("#upcard"),
  trumpPanel: document.querySelector("#trumpPanel"),
  trumpHelp: document.querySelector("#trumpHelp"),
  trumpButtons: document.querySelector("#trumpButtons"),
  passButton: document.querySelector("#passButton"),
  currentTrick: document.querySelector("#currentTrick"),
  trickHistory: document.querySelector("#trickHistory")
};

let match = createMatch();

elements.newHandButton.addEventListener("click", () => {
  if (match.winner || elements.modeSelect.value !== match.modeId) {
    match = createMatch({ modeId: elements.modeSelect.value });
  } else {
    match = startNewHand(match);
  }
  render();
});

elements.modeSelect.addEventListener("change", () => {
  match = createMatch({ modeId: elements.modeSelect.value });
  render();
});

elements.passButton.addEventListener("click", () => {
  try {
    match = passTrumpForCurrentPlayer(match);
    if (match.hand.phase === "redealRequired") {
      match = startNewHand(match);
    }
    render();
  } catch (error) {
    showError(error);
  }
});

function render() {
  elements.modeSelect.value = match.modeId;
  elements.player1Score.textContent = match.score.player1;
  elements.player2Score.textContent = match.score.player2;
  elements.targetScore.textContent = match.mode.targetScore;

  renderStatus();
  renderUpcard();
  renderTrumpControls();
  renderHand("player1", elements.player1Hand);
  renderHand("player2", elements.player2Hand);
  renderCurrentTrick();
  renderTrickHistory();

  elements.player1Tricks.textContent = `${match.hand.tricksWon.player1} tricks`;
  elements.player2Tricks.textContent = `${match.hand.tricksWon.player2} tricks`;
  elements.kittyCount.textContent = `${match.hand.kitty.length} cards`;
}

function renderStatus() {
  if (match.winner) {
    elements.statusText.textContent = `${playerName(match.winner)} wins the match.`;
    return;
  }

  if (match.hand.phase === "selectingTrump") {
    const selection = match.hand.trumpSelection;
    const actor = currentTrumpActor(selection);
    const forced = selection.forcedDealerChoice ? " Stick the Dealer is active." : "";
    elements.statusText.textContent = `${playerName(actor)} to choose or pass trump. Round ${selection.round}.${forced}`;
    return;
  }

  if (match.hand.phase === "playing") {
    elements.statusText.textContent = `${playerName(match.hand.currentPlayer)} to play. Trump is ${suitName(match.hand.trumpSuit)}. Maker is ${playerName(match.hand.maker)}.`;
    return;
  }

  if (match.hand.phase === "handComplete") {
    const points = match.hand.handScore.points;
    elements.statusText.textContent = `Hand complete. Player 1 +${points.player1}, Player 2 +${points.player2}. Start a new hand.`;
    return;
  }

  elements.statusText.textContent = "Start a new hand.";
}

function renderUpcard() {
  elements.upcard.className = `upcard ${isRed(match.hand.upcard.suit) ? "red" : ""}`;
  elements.upcard.innerHTML = cardMarkup(match.hand.upcard);
}

function renderTrumpControls() {
  const selecting = match.hand.phase === "selectingTrump";
  elements.trumpPanel.hidden = !selecting;
  elements.trumpButtons.replaceChildren();

  if (!selecting) return;

  const selection = match.hand.trumpSelection;
  const actor = currentTrumpActor(selection);
  elements.trumpHelp.textContent = selection.forcedDealerChoice
    ? `${playerName(actor)} must choose trump. Trump can be led immediately after selection.`
    : `${playerName(actor)} may choose trump or pass. Trump can be led immediately after selection.`;
  elements.passButton.disabled = selection.forcedDealerChoice;

  for (const suit of availableTrumpSuits(match)) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${suitSymbol(suit)} ${suitName(suit)}`;
    button.addEventListener("click", () => {
      try {
        match = chooseTrumpForCurrentPlayer(match, suit);
        render();
      } catch (error) {
        showError(error);
      }
    });
    elements.trumpButtons.append(button);
  }
}

function renderHand(player, container) {
  container.replaceChildren();
  const playable = playableCardsFor(match, player);
  const isCurrent = match.hand.phase === "playing" && match.hand.currentPlayer === player;

  for (const card of match.hand.hands[player]) {
    const button = document.createElement("button");
    const legal = playable.some((candidate) => cardsEqual(candidate, card));
    button.type = "button";
    button.className = [
      "card",
      isRed(card.suit) ? "red" : "",
      legal ? "legal" : "",
      isCurrent ? "current-player" : ""
    ].filter(Boolean).join(" ");
    button.innerHTML = cardMarkup(card);
    button.disabled = !legal;
    button.setAttribute("aria-label", `${playerName(player)} ${card.rank} of ${card.suit}`);
    button.addEventListener("click", () => {
      try {
        match = playCard(match, player, card);
        render();
      } catch (error) {
        showError(error);
      }
    });
    container.append(button);
  }
}

function renderCurrentTrick() {
  elements.currentTrick.replaceChildren();

  for (const play of match.hand.currentTrick) {
    const div = document.createElement("div");
    div.className = `card ${isRed(play.card.suit) ? "red" : ""}`;
    div.innerHTML = `<span>${playerName(play.player)}</span>${cardMarkup(play.card)}`;
    elements.currentTrick.append(div);
  }

  for (let index = match.hand.currentTrick.length; index < 2; index += 1) {
    const slot = document.createElement("div");
    slot.className = "play-slot";
    slot.textContent = "Waiting";
    elements.currentTrick.append(slot);
  }
}

function renderTrickHistory() {
  elements.trickHistory.replaceChildren();

  for (const [index, trick] of match.hand.completedTricks.entries()) {
    const item = document.createElement("li");
    const plays = trick.plays.map((play) => `${playerName(play.player)} ${cardLabel(play.card)}`).join(", ");
    item.textContent = `Trick ${index + 1}: ${plays}. Winner: ${playerName(trick.winner)}.`;
    elements.trickHistory.append(item);
  }
}

function cardMarkup(card) {
  return `<span><span class="rank">${card.rank}</span><span class="suit">${suitSymbol(card.suit)}</span></span>`;
}

function showError(error) {
  elements.statusText.textContent = error.message;
}

function playerName(player) {
  return player === "player1" ? "Player 1" : "Player 2";
}

function suitName(suit) {
  return suit[0].toUpperCase() + suit.slice(1);
}

function isRed(suit) {
  return suit === "hearts" || suit === "diamonds";
}

render();
