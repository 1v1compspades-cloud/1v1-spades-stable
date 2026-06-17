import { useCallback, useEffect, useRef, useState } from "react";

// Stable per-tab id. sessionStorage survives a reload of the SAME tab (so a
// refresh never trips the guard against itself) but is NOT shared between tabs,
// so a second tab gets a different id.
function getTabId(): string {
  try {
    let id = sessionStorage.getItem("spades_tab_id");
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem("spades_tab_id", id);
    }
    return id;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * Old-tab protection: detects when the SAME browser has the same room/tournament
 * open in more than one tab and flags the older tab as superseded.
 *
 * Mechanism: each tab writes a `{ tabId, ts }` claim to a localStorage key
 * scoped to the room/tournament. The browser fires a `storage` event in *other*
 * tabs whenever that key changes, so a newly-opened tab's claim notifies the
 * existing tab(s), which then mark themselves superseded. The newest tab always
 * wins ("prefer the most recent tab"). `reclaim()` lets a superseded tab take
 * ownership back.
 *
 * Server-side seat ownership already prefers the most-recent socket (reconnect
 * rebinds the seat), so this is a pure UX guard — no socket/gameplay change.
 */
export function useTabGuard(scope: string | null | undefined): {
  superseded: boolean;
  reclaim: () => void;
} {
  const [superseded, setSuperseded] = useState(false);
  const tabIdRef = useRef<string>("");
  const claimTsRef = useRef<number>(0);
  const keyRef = useRef<string>("");

  const writeClaim = useCallback(() => {
    if (!keyRef.current) return;
    claimTsRef.current = Date.now();
    try {
      localStorage.setItem(
        keyRef.current,
        JSON.stringify({ tabId: tabIdRef.current, ts: claimTsRef.current }),
      );
    } catch {
      /* private mode / quota — guard simply no-ops */
    }
  }, []);

  const reclaim = useCallback(() => {
    setSuperseded(false);
    writeClaim();
  }, [writeClaim]);

  useEffect(() => {
    if (!scope) {
      setSuperseded(false);
      keyRef.current = "";
      return;
    }
    tabIdRef.current = getTabId();
    keyRef.current = `spades_tab_claim_${scope}`;
    setSuperseded(false);
    // Claim on mount → this (newest) tab becomes the active one and the storage
    // event notifies any older tab viewing the same scope.
    writeClaim();

    const onStorage = (e: StorageEvent) => {
      if (e.key !== keyRef.current || !e.newValue) return;
      try {
        const v = JSON.parse(e.newValue) as { tabId?: string; ts?: number };
        if (!v?.tabId || !v?.ts) return;
        // A different tab claimed this scope at/after our claim → we're stale.
        if (v.tabId !== tabIdRef.current && v.ts >= claimTsRef.current) {
          setSuperseded(true);
        }
      } catch {
        /* ignore malformed payloads */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [scope, writeClaim]);

  return { superseded, reclaim };
}
