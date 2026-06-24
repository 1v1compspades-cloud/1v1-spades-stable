// Lightweight AsyncStorage persistence for a mobile seat.
//
// The server issues a per-seat reconnect `token` when you create or join a room
// (mirrors the web client's localStorage model). We stash it — together with the
// roomCode, seat index, and display name — so a foregrounded / relaunched app
// can re-claim the same seat via `reconnect_player`.

import AsyncStorage from "@react-native-async-storage/async-storage";

const SESSION_KEY = "spades_fp_session";
const NAME_KEY = "spades_fp_name";
const ONBOARDED_KEY = "spades_fp_onboarded";

export interface SeatSession {
  roomCode: string;
  playerIndex: 0 | 1;
  token?: string;
  playerName: string;
}

export async function saveSession(s: SeatSession): Promise<void> {
  try {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s));
    if (s.playerName) await AsyncStorage.setItem(NAME_KEY, s.playerName);
  } catch {
    /* non-fatal: persistence is best-effort */
  }
}

export async function loadSession(): Promise<SeatSession | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SeatSession;
    if (
      parsed &&
      typeof parsed.roomCode === "string" &&
      (parsed.playerIndex === 0 || parsed.playerIndex === 1) &&
      typeof parsed.playerName === "string"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export async function saveName(name: string): Promise<void> {
  try {
    await AsyncStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignore */
  }
}

export async function loadName(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(NAME_KEY)) ?? "";
  } catch {
    return "";
  }
}

/** Whether the user has completed (or skipped) the first-launch onboarding. */
export async function loadOnboarded(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDED_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function setOnboarded(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDED_KEY, "1");
  } catch {
    /* ignore */
  }
}
