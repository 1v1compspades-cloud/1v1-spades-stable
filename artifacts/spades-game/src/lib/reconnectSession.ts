export type ReconnectAvailabilityState = "idle" | "checking" | "available" | "unavailable" | "unverified";

export const shouldShowReconnectPanel = (input: {
  hasSavedSession: boolean;
  availability: ReconnectAvailabilityState;
  isFindingMatch: boolean;
  isFindingRankedMatch: boolean;
}): boolean => {
  return (
    input.hasSavedSession &&
    (input.availability === "available" || input.availability === "unverified") &&
    !input.isFindingMatch &&
    !input.isFindingRankedMatch
  );
};

export const shouldClearSavedReconnectBeforeCasualMatch = (input: {
  hasSavedSession: boolean;
  availability: ReconnectAvailabilityState;
}): boolean => {
  return input.hasSavedSession && input.availability === "unavailable";
};

export const shouldClearSavedReconnectAfterAvailabilityCheck = (input: {
  available: boolean;
  reason?: string;
}): boolean => {
  if (input.available) return false;
  const reason = String(input.reason || "").toLowerCase();
  return (
    reason === "invalid_request" ||
    reason === "room_not_found" ||
    reason === "game_over" ||
    reason === "seat_empty" ||
    reason === "token_required" ||
    reason === "no_record" ||
    reason === "token_mismatch" ||
    reason === "name_mismatch"
  );
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
