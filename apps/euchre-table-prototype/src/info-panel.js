export const DISCORD_INVITE_URL = "https://discord.gg/YOUR_INVITE";

const infoPages = [
  {
    id: "about",
    label: "About",
    title: "About 1v1 Euchre Freeplay",
    body: [
      "1v1 Euchre Freeplay is a two-player Euchre match app built for quick games, friend invites, and future tournament play.",
      "Create a private room, invite an opponent, ready up, and play a clean head-to-head match."
    ]
  },
  {
    id: "how-to-play",
    label: "How to Play",
    title: "How to Play",
    body: [
      "Enter your name, create or join a room, then use Ready Up when you are set.",
      "After both players ready up, the countdown starts. The coin flip winner chooses whether to begin as dealer or non-dealer.",
      "Once cards are dealt, choose or pass trump, play legal cards, win tricks, and race to the target score."
    ]
  },
  {
    id: "rules",
    label: "Euchre Rules",
    title: "Euchre Rules",
    body: [
      "Euchre uses a 24-card deck: 9, 10, J, Q, K, and A in each suit.",
      "The Jack of trump is the right bower and the highest card. The Jack of the same-color suit is the left bower and also counts as trump.",
      "Players must follow the led suit when possible. Trump can be led immediately after trump is chosen.",
      "Stick the Dealer is on for the main freeplay mode, so the dealer must choose trump if both players pass twice."
    ]
  },
  {
    id: "scoring",
    label: "Scoring",
    title: "Scoring",
    body: [
      "The maker scores 1 point for taking 3 or 4 tricks.",
      "The maker scores 2 points for taking all 5 tricks.",
      "The defender scores 2 points when the maker fails to take at least 3 tricks.",
      "The match ends when a player reaches the target score."
    ]
  },
  {
    id: "lobby",
    label: "Lobby / Invite Help",
    title: "Lobby / Invite Help",
    body: [
      "The host creates a room and shares the invite link with an opponent.",
      "A second browser or device opening the invite link joins the open opponent seat. Additional visitors become spectators.",
      "Both seated players can ready and unready. The match does not start until both players are seated, both are ready, and the countdown finishes."
    ]
  },
  {
    id: "leaderboard",
    label: "Leaderboard",
    title: "Leaderboard",
    body: [
      "Completed matches update basic win/loss standings for guest players and saved profiles.",
      "Leaderboard rows show public match stats only."
    ],
    link: {
      href: "./leaderboard.html",
      text: "View Leaderboard"
    }
  },
  {
    id: "tournament-history",
    label: "Tournament History",
    title: "Tournament History",
    body: [
      "Completed tournament summaries show public-safe bracket results after a champion is declared.",
      "History records include the champion, bracket size, rounds, and completed date without private room data."
    ],
    link: {
      href: "./tournament-history.html",
      text: "View Tournament History"
    }
  },
  {
    id: "discord",
    label: "Discord / Community",
    title: "Discord / Community",
    body: [
      "Join the community to find matches, report bugs, follow updates, and help shape future tournament play."
    ],
    discord: true
  }
];

export function setupInfoPanel() {
  const buttons = document.querySelectorAll("[data-info-button]");
  if (!buttons.length) return;

  let overlay = null;
  let activePageId = infoPages[0].id;

  function openInfo() {
    if (!overlay) {
      overlay = createInfoOverlay({
        getActivePageId: () => activePageId,
        setActivePageId: (pageId) => {
          activePageId = pageId;
          renderActivePage(overlay, activePageId);
        },
        closeInfo
      });
      document.body.append(overlay);
    }

    overlay.hidden = false;
    renderActivePage(overlay, activePageId);
    document.addEventListener("keydown", handleKeydown);
  }

  function closeInfo() {
    if (overlay) overlay.hidden = true;
    document.removeEventListener("keydown", handleKeydown);
  }

  function handleKeydown(event) {
    if (event.key === "Escape") closeInfo();
  }

  buttons.forEach((button) => {
    button.addEventListener("click", openInfo);
  });
}

function createInfoOverlay({ getActivePageId, setActivePageId, closeInfo }) {
  const overlay = document.createElement("div");
  overlay.className = "info-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "infoPanelTitle");

  const panel = document.createElement("section");
  panel.className = "info-panel-drawer";

  const header = document.createElement("header");
  header.className = "info-panel-header";
  header.innerHTML = `
    <div>
      <p class="eyebrow">Info</p>
      <h2 id="infoPanelTitle">1v1 Euchre Freeplay</h2>
    </div>
  `;

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "info-close-button";
  closeButton.setAttribute("aria-label", "Close info");
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", closeInfo);
  header.append(closeButton);

  const tabs = document.createElement("nav");
  tabs.className = "info-tabs";
  tabs.setAttribute("aria-label", "Info pages");

  for (const page of infoPages) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.dataset.infoPage = page.id;
    tab.textContent = page.label;
    tab.addEventListener("click", () => setActivePageId(page.id));
    tabs.append(tab);
  }

  const content = document.createElement("article");
  content.className = "info-page";
  content.dataset.infoContent = "true";

  panel.append(header, tabs, content);
  overlay.append(panel);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeInfo();
  });

  renderActivePage(overlay, getActivePageId());
  return overlay;
}

function renderActivePage(overlay, activePageId) {
  const activePage = infoPages.find((page) => page.id === activePageId) ?? infoPages[0];
  const content = overlay.querySelector("[data-info-content]");

  overlay.querySelectorAll("[data-info-page]").forEach((tab) => {
    const active = tab.dataset.infoPage === activePage.id;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-current", active ? "page" : "false");
  });

  content.replaceChildren();
  const title = document.createElement("h3");
  title.textContent = activePage.title;
  content.append(title);

  for (const paragraph of activePage.body) {
    const p = document.createElement("p");
    p.textContent = paragraph;
    content.append(p);
  }

  if (activePage.discord) {
    const link = document.createElement("a");
    link.className = "button-link primary-action discord-action";
    link.href = DISCORD_INVITE_URL;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Join the Discord";
    content.append(link);
  }

  if (activePage.link) {
    const link = document.createElement("a");
    link.className = "button-link primary-action";
    link.href = activePage.link.href;
    link.textContent = activePage.link.text;
    content.append(link);
  }
}
