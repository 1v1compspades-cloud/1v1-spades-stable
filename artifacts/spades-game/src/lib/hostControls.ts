/**
 * Pure presentation logic for the tournament-lobby "start" control.
 *
 * Kept free of React so it can be unit-tested with node:test (see
 * hostControls.test.mts). The component (Tournament.tsx) renders whatever
 * this returns; it does NOT make its own gating decisions.
 *
 * Gating rules:
 *   - not in roster                     -> hidden
 *   - in roster, not the host           -> leave (only a Leave button)
 *   - host by name but no host token    -> warning (do NOT silently hide)
 *   - host with token, lobby not full   -> disabled "Need X more"
 *   - host with token, lobby full       -> enabled "Start Tournament"
 */

export type StartControl =
  | { kind: "hidden" }
  | { kind: "leave" }
  | { kind: "warning"; message: string }
  | { kind: "start"; enabled: boolean; label: string };

export interface StartControlInput {
  iAmInRoster: boolean;
  iAmHost: boolean;
  hasHostToken: boolean;
  playerCount: number;
  size: number;
  starting: boolean;
}

export const HOST_TOKEN_WARNING =
  "Host controls unavailable on this device. Reopen using the original host link.";

export function computeStartControl(input: StartControlInput): StartControl {
  const { iAmInRoster, iAmHost, hasHostToken, playerCount, size, starting } = input;
  if (!iAmInRoster) return { kind: "hidden" };
  if (!iAmHost) return { kind: "leave" };
  if (!hasHostToken) return { kind: "warning", message: HOST_TOKEN_WARNING };
  if (starting) return { kind: "start", enabled: false, label: "Starting…" };
  if (playerCount >= size) return { kind: "start", enabled: true, label: "Start Tournament" };
  return { kind: "start", enabled: false, label: `Need ${Math.max(0, size - playerCount)} more` };
}
