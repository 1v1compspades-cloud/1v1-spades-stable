const quickMatchButton = document.querySelector("#quickMatchButton");
const quickMatchStatus = document.querySelector("#quickMatchStatus");

quickMatchButton.addEventListener("click", async () => {
  quickMatchButton.disabled = true;

  try {
    const response = await fetch("/api/quick-match", { method: "POST" });
    const payload = await response.json();
    quickMatchStatus.textContent = payload.message ?? "Quick Match coming next.";
  } catch {
    quickMatchStatus.textContent = "Quick Match coming next.";
  } finally {
    quickMatchButton.disabled = false;
  }
});
