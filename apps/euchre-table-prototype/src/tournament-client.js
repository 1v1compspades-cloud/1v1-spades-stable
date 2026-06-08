const storageKey = "euchreTournamentView";
const elements = {
  status: document.querySelector("#tournamentStatus"),
  bracketSize: document.querySelector("#bracketSize"),
  createButton: document.querySelector("#createTournamentButton"),
  adminKeyReveal: document.querySelector("#adminKeyReveal"),
  adminKeyOnce: document.querySelector("#adminKeyOnce"),
  codeInput: document.querySelector("#tournamentCodeInput"),
  nameInput: document.querySelector("#displayNameInput"),
  joinButton: document.querySelector("#joinTournamentButton"),
  adminState: document.querySelector("#adminState"),
  adminKeyInput: document.querySelector("#adminKeyInput"),
  verifyAdminButton: document.querySelector("#verifyAdminButton"),
  adminControls: document.querySelector("#adminControls"),
  startButton: document.querySelector("#startTournamentButton"),
  resetButton: document.querySelector("#resetLobbyButton"),
  copyMatchLinksButton: document.querySelector("#copyMatchLinksButton"),
  validateButton: document.querySelector("#validateBracketButton"),
  exportButton: document.querySelector("#exportTournamentButton"),
  tournamentCode: document.querySelector("#tournamentCode"),
  tournamentPlayers: document.querySelector("#tournamentPlayers"),
  openSlots: document.querySelector("#openSlots"),
  bracketStatus: document.querySelector("#bracketStatus"),
  copyLinkButton: document.querySelector("#copyTournamentLinkButton"),
  tournamentLink: document.querySelector("#tournamentLink"),
  tournamentHint: document.querySelector("#tournamentHint"),
  lobbyCount: document.querySelector("#lobbyCount"),
  playerList: document.querySelector("#playerList"),
  bracketView: document.querySelector("#bracketView")
};

let tournamentView = null;
let pollHandle = null;
let verifiedAdminKey = null;

elements.createButton.addEventListener("click", async () => {
  try {
    const result = await api("/api/tournaments", {
      method: "POST",
      body: { bracketSize: Number(elements.bracketSize.value) }
    });
    showHostAccessNotice();
    verifiedAdminKey = result.adminKey;
    setTournament(result.tournament, "Tournament created. Host controls unlocked. Share only the public join link.");
    await verifyAdmin(result.adminKey, false);
  } catch (error) {
    setStatus(error.message);
  }
});

elements.joinButton.addEventListener("click", async () => {
  const code = elements.codeInput.value.trim().toUpperCase();
  const displayName = elements.nameInput.value.trim();

  if (!code) {
    setStatus("Enter a tournament code.");
    return;
  }

  try {
    const result = await api(`/api/tournaments/${code}/join`, {
      method: "POST",
      body: { displayName }
    });
    setTournament(result.tournament, `${displayName} joined the lobby.`);
  } catch (error) {
    setStatus(error.message);
  }
});

elements.copyLinkButton.addEventListener("click", async () => {
  if (!tournamentView?.tournamentCode) return;
  const link = tournamentLinkFor(tournamentView.tournamentCode);

  if (navigator.clipboard) {
    await navigator.clipboard.writeText(link);
    setStatus("Tournament link copied.");
  } else {
    setStatus(link);
  }
});

elements.verifyAdminButton.addEventListener("click", async () => {
  const key = elements.adminKeyInput.value.trim();

  if (!key) {
    setStatus("Enter the private host key to unlock host controls.");
    return;
  }

  try {
    await verifyAdmin(key);
    setStatus("Host controls unlocked.");
  } catch (error) {
    verifiedAdminKey = null;
    elements.adminControls.hidden = true;
    elements.adminState.textContent = "Locked";
    setStatus(error.message);
  }
});

elements.startButton.addEventListener("click", () => {
  adminAction("start", "/start", "Tournament started.");
});

elements.resetButton.addEventListener("click", () => {
  adminAction("reset", "/reset-lobby", "Lobby reset.");
});

elements.validateButton.addEventListener("click", async () => {
  if (!hasAdmin()) return;

  try {
    const result = await api(`/api/tournaments/${tournamentView.tournamentCode}/admin/validate-bracket`, {
      method: "POST",
      body: { adminKey: verifiedAdminKey }
    });
    setTournament(result.tournament, result.validation.valid ? "Bracket is valid." : result.validation.issues.join("; "));
  } catch (error) {
    setStatus(error.message);
  }
});

elements.exportButton.addEventListener("click", async () => {
  if (!hasAdmin()) return;

  try {
    const result = await api(`/api/tournaments/${tournamentView.tournamentCode}/admin/export`, {
      method: "POST",
      body: { adminKey: verifiedAdminKey }
    });
    await copyText(JSON.stringify(result.backup, null, 2));
    setStatus("Tournament backup copied.");
  } catch (error) {
    setStatus(error.message);
  }
});

elements.copyMatchLinksButton.addEventListener("click", async () => {
  if (!tournamentView?.admin?.matchLinks?.length) {
    setStatus("No match links yet.");
    return;
  }

  const links = tournamentView.admin.matchLinks
    .map((match) => `${match.matchId.toUpperCase()}: ${new URL(match.roomLink, window.location.href).toString()}`)
    .join("\n");
  await copyText(links);
  setStatus("Match links copied.");
});

const urlCode = new URL(window.location.href).searchParams.get("code");
const saved = loadSavedTournament();

if (urlCode) {
  elements.codeInput.value = urlCode.toUpperCase();
  refreshTournament(urlCode.toUpperCase(), "Tournament code loaded.");
} else if (saved?.tournamentCode) {
  refreshTournament(saved.tournamentCode, "Reconnected to this tournament view.");
} else {
  render();
}

async function refreshTournament(code, status) {
  try {
    const result = await api(`/api/tournaments/${code}`);
    setTournament(result.tournament, status);
  } catch (error) {
    localStorage.removeItem(storageKey);
    setStatus(`${error.message}. Check the tournament code and try again.`);
  }
}

async function verifyAdmin(adminKey, showStatus = true) {
  if (!tournamentView?.tournamentCode) {
    setStatus("Load a tournament first.");
    return;
  }

  const result = await api(`/api/tournaments/${tournamentView.tournamentCode}/admin/verify`, {
    method: "POST",
    body: { adminKey }
  });
  verifiedAdminKey = adminKey;
  tournamentView = result.tournament;
  elements.adminKeyInput.value = "";
  elements.adminControls.hidden = false;
  elements.adminState.textContent = "Verified";
  if (showStatus) setStatus("Host controls unlocked.");
  render();
}

async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }

  return payload;
}

function setTournament(nextTournament, status) {
  tournamentView = nextTournament;
  elements.codeInput.value = nextTournament.tournamentCode;
  localStorage.setItem(storageKey, JSON.stringify({ tournamentCode: nextTournament.tournamentCode }));
  if (!nextTournament.admin) {
    elements.adminControls.hidden = true;
    elements.adminState.textContent = "Locked";
  }
  if (status) setStatus(status);
  startPolling();
  render();
}

function startPolling() {
  if (pollHandle) return;
  pollHandle = setInterval(() => {
    if (tournamentView?.tournamentCode) {
      refreshTournament(tournamentView.tournamentCode).catch((error) => setStatus(error.message));
    }
  }, 2000);
}

function loadSavedTournament() {
  try {
    return JSON.parse(localStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

function render() {
  if (!tournamentView) {
    elements.copyLinkButton.disabled = true;
    elements.bracketView.textContent = "No tournament selected.";
    return;
  }

  const playerCount = tournamentView.players.length;
  elements.tournamentCode.textContent = tournamentView.tournamentCode;
  elements.tournamentPlayers.textContent = `${playerCount} / ${tournamentView.bracketSize}`;
  elements.openSlots.textContent = tournamentView.openSlots;
  elements.bracketStatus.textContent = statusLabel(tournamentView.status);
  elements.copyLinkButton.disabled = false;
  elements.tournamentLink.textContent = tournamentLinkFor(tournamentView.tournamentCode);
  elements.lobbyCount.textContent = `${playerCount} players`;
  elements.tournamentHint.textContent = tournamentView.status === "lobby"
    ? "Host starts the bracket after the lobby fills."
    : "Match links open private Euchre rooms.";

  renderPlayers();
  renderBracket();
  renderAdminControls();
}

function renderPlayers() {
  elements.playerList.replaceChildren();

  for (const player of tournamentView.players) {
    const item = document.createElement("li");
    item.textContent = player.displayName;
    elements.playerList.append(item);
  }

  for (let index = 0; index < tournamentView.openSlots; index += 1) {
    const item = document.createElement("li");
    item.className = "empty-slot";
    item.textContent = "Open slot";
    elements.playerList.append(item);
  }
}

function renderBracket() {
  elements.bracketView.replaceChildren();

  if (!tournamentView.bracket) {
    const empty = document.createElement("p");
    empty.className = "muted-note";
    empty.textContent = "Waiting for the lobby to fill.";
    elements.bracketView.append(empty);
    return;
  }

  for (const round of tournamentView.bracket.rounds) {
    const roundEl = document.createElement("section");
    roundEl.className = "bracket-round";
    const heading = document.createElement("h3");
    heading.textContent = round.name;
    roundEl.append(heading);

    for (const match of round.matches) {
      const card = document.createElement("article");
      card.className = "match-card";
      const p1 = match.player1?.displayName ?? "TBD";
      const p2 = match.player2?.displayName ?? "TBD";
      const winner = match.winner?.displayName ?? "Pending";
      card.innerHTML = `
        <strong>${match.matchId.toUpperCase()}</strong>
        <span>${p1}</span>
        <span>${p2}</span>
        <small>Winner: ${winner}</small>
      `;

      if (match.roomLink) {
        const link = document.createElement("a");
        link.className = "button-link secondary-link match-link";
        link.href = match.roomLink;
        link.textContent = "Open Match Room";
        card.append(link);
      }

      if (hasAdmin() && match.player1 && match.player2 && !match.winner) {
        const actions = document.createElement("div");
        actions.className = "match-admin-actions";
        actions.append(
          adminWinnerButton(match, match.player1, "Mark P1"),
          adminWinnerButton(match, match.player2, "Mark P2"),
          adminWinnerButton(match, match.player1, "Forfeit P2", "admin_forfeit"),
          adminWinnerButton(match, match.player2, "Forfeit P1", "admin_forfeit")
        );
        card.append(actions);
      }

      roundEl.append(card);
    }

    elements.bracketView.append(roundEl);
  }
}

function renderAdminControls() {
  const verified = hasAdmin();
  elements.adminControls.hidden = !verified;
  elements.adminState.textContent = verified ? "Verified" : "Locked";

  if (!verified) return;

  elements.startButton.disabled = !tournamentView.admin.canStart;
  elements.resetButton.disabled = !tournamentView.admin.canResetLobby;
  elements.copyMatchLinksButton.disabled = !tournamentView.admin.matchLinks.length;
}

function adminWinnerButton(match, player, label, source = "admin_mark_winner") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary compact-button";
  button.textContent = label;
  button.addEventListener("click", () => {
    adminMarkWinner(match, player, source).catch((error) => setStatus(error.message));
  });
  return button;
}

async function adminMarkWinner(match, player, source) {
  if (!hasAdmin()) return;

  const result = await api(`/api/tournaments/${tournamentView.tournamentCode}/admin/matches/${match.matchId}/winner`, {
    method: "POST",
    body: {
      adminKey: verifiedAdminKey,
      round: match.round,
      winnerId: player.id,
      source
    }
  });
  setTournament(result.tournament, source === "admin_forfeit" ? "Forfeit recorded." : "Winner recorded.");
}

async function adminAction(kind, path, successMessage) {
  if (!hasAdmin()) return;

  try {
    const result = await api(`/api/tournaments/${tournamentView.tournamentCode}/admin${path}`, {
      method: "POST",
      body: { adminKey: verifiedAdminKey }
    });
    setTournament(result.tournament, successMessage);
  } catch (error) {
    setStatus(error.message);
  }
}

function showHostAccessNotice() {
  elements.adminKeyReveal.hidden = false;
  elements.adminKeyOnce.textContent = "Unlocked";
  elements.adminKeyInput.value = "";
}

function hasAdmin() {
  return Boolean(verifiedAdminKey && tournamentView?.admin?.verified);
}

async function copyText(text) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  } else {
    setStatus(text);
  }
}

function setStatus(message) {
  if (message) elements.status.textContent = message;
}

function statusLabel(status) {
  return {
    lobby: "Lobby",
    bracket: "Bracket",
    complete: "Complete"
  }[status] ?? "None";
}

function tournamentLinkFor(code) {
  const url = new URL(window.location.href);
  url.pathname = url.pathname.replace(/[^/]*$/, "tournament.html");
  url.search = `?code=${encodeURIComponent(code)}`;
  return url.toString();
}
