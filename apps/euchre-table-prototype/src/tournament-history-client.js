import { setupInfoPanel } from "./info-panel.js";

const elements = {
  rows: document.querySelector("#tournamentHistoryRows"),
  status: document.querySelector("#tournamentHistoryStatus")
};

setupInfoPanel();
loadTournamentHistory().catch((error) => {
  setStatus(error.message);
});

async function loadTournamentHistory() {
  const response = await fetch("/api/tournament-history");
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not load tournament history.");
  }

  renderTournamentHistory(payload.history ?? []);
}

function renderTournamentHistory(rows) {
  elements.rows.replaceChildren();

  if (!rows.length) {
    const empty = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 7;
    cell.textContent = "No completed tournaments yet.";
    empty.append(cell);
    elements.rows.append(empty);
    setStatus("Completed tournament summaries will appear here.");
    return;
  }

  for (const row of rows) {
    const tr = document.createElement("tr");
    appendCell(tr, row.tournamentCode);
    appendCell(tr, row.bracketSize);
    appendCell(tr, row.championDisplayName);
    appendCell(tr, row.runnerUpDisplayName ?? "");
    appendCell(tr, formatCompletedAt(row.completedAt));
    appendCell(tr, row.matchCount);
    appendCell(tr, row.rounds);
    elements.rows.append(tr);
  }

  setStatus(`${rows.length} completed tournament${rows.length === 1 ? "" : "s"}.`);
}

function appendCell(row, value) {
  const cell = document.createElement("td");
  cell.textContent = String(value ?? "");
  row.append(cell);
}

function formatCompletedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function setStatus(message) {
  elements.status.textContent = message;
}
