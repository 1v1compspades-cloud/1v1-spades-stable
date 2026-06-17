import { Button } from "@/components/ui/button";

/**
 * Full-screen overlay shown on a tab that has been superseded because the SAME
 * browser opened the same room/tournament in a newer tab. It blocks interaction
 * on the stale tab (preventing confusing double state) and lets the user either
 * take over here or leave.
 */
export function TabConflictOverlay({
  onUseHere,
  onLeave,
  scopeLabel = "room",
}: {
  onUseHere: () => void;
  onLeave?: () => void;
  scopeLabel?: string;
}) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      data-testid="overlay-tab-conflict"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-2xl border-2 border-amber-500/40 bg-card/95 p-6 text-center shadow-2xl">
        <div className="mb-3 text-3xl" aria-hidden>
          🪟
        </div>
        <h2 className="text-lg font-bold text-amber-200">
          This {scopeLabel} is open in another tab
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Use one tab only. This older tab has been paused to avoid mixing up the
          game. You can take over here, or close this tab and keep using the new
          one.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button
            onClick={onUseHere}
            data-testid="button-use-this-tab"
            className="min-h-[44px] font-semibold"
          >
            Use this tab instead
          </Button>
          {onLeave && (
            <Button
              variant="ghost"
              onClick={onLeave}
              data-testid="button-leave-tab-conflict"
              className="min-h-[44px]"
            >
              Leave
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
