export type ReconnectAvailabilityState = "idle" | "checking" | "available" | "unavailable";

export const shouldShowReconnectPanel = (input: {
  hasSavedSession: boolean;
  availability: ReconnectAvailabilityState;
  isFindingMatch: boolean;
  isFindingRankedMatch: boolean;
}): boolean => {
  return (
    input.hasSavedSession &&
    input.availability === "available" &&
    !input.isFindingMatch &&
    !input.isFindingRankedMatch
  );
};

export const shouldClearSavedReconnectBeforeCasualMatch = (input: {
  hasSavedSession: boolean;
  availability: ReconnectAvailabilityState;
}): boolean => {
  return input.hasSavedSession && input.availability !== "available";
};

export const shouldClearSavedReconnectAfterFailure = (message: unknown): boolean => {
  const text = String(message || "").toLowerCase();
  const retryable =
    text.includes("temporarily unavailable") ||
    text.includes("please retry") ||
    text.includes("try again") ||
    text.includes("network") ||
    text.includes("timeout") ||
    text.includes("offline") ||
    text.includes("seat already active in another tab");
  if (retryable) return false;
  return (
    !text ||
    text.includes("room not found") ||
    text.includes("session expired") ||
    text.includes("seat empty") ||
    text.includes("held by another player") ||
    text.includes("token required") ||
    text.includes("token invalid") ||
    text.includes("token mismatch")
  );
};
