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
