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
  return (
    !text ||
    text.includes("reconnect") ||
    text.includes("room not found") ||
    text.includes("session expired") ||
    text.includes("seat") ||
    text.includes("token")
  );
};
