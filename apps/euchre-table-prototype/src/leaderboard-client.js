import { setupInfoPanel } from "./info-panel.js";

const elements = {
  rows: document.querySelector("#leaderboardRows"),
  status: document.querySelector("#leaderboardStatus")
};

setupInfoPanel();
loadLeaderboard().catch((error) => {
  setStatus(error.message);
});

async function loadLeaderboard() {
  const response = await fetch("/api/leaderboard");
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not load leaderboard.");
  }

  renderLeaderboard(payload.leaderboard ?? []);
}

function renderLeaderboard(rows) {
  elements.rows.replaceChildren();

  if (!rows.length) {
    const empty = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 7;
    cell.textContent = "No completed matches yet.";
    empty.append(cell);
    elements.rows.append(empty);
    setStatus("Play a completed match to appear here.");
    return;
  }

  for (const row of rows) {
    const tr = document.createElement("tr");
    appendCell(tr, row.rank);
    appendCell(tr, row.displayName);
    appendCell(tr, row.wins);
    appendCell(tr, row.losses);
    appendCell(tr, row.matchesPlayed);
    appendCell(tr, `${row.winPercentage}%`);
    appendCell(tr, row.tournamentWins);
    elements.rows.append(tr);
  }

  setStatus(`${rows.length} player${rows.length === 1 ? "" : "s"} ranked.`);
}

function appendCell(row, value) {
  const cell = document.createElement("td");
  cell.textContent = String(value ?? "");
  row.append(cell);
}

function setStatus(message) {
  elements.status.textContent = message;
}
