import { type CSSProperties } from "react";

interface CardBackProps {
  className?: string;
  style?: CSSProperties;
}

function CardBack({ className = "", style }: CardBackProps) {
  return (
    <div
      style={style}
      className={
        "w-10 h-14 sm:w-14 sm:h-20 rounded-md border-2 border-amber-300/70 " +
        "bg-gradient-to-br from-emerald-800 via-emerald-900 to-black " +
        "shadow-[0_6px_18px_-4px_rgba(0,0,0,0.6)] " +
        "relative overflow-hidden " +
        className
      }
      aria-hidden="true"
    >
      <div className="absolute inset-1 rounded-sm border border-amber-300/30" />
      <div className="absolute inset-0 flex items-center justify-center text-amber-300/50 text-sm sm:text-base font-serif">
        ♠
      </div>
    </div>
  );
}

const STACK_SIZE = 7;
// One "round" deals 4 cards (left → top → right → bottom). We show 4 rounds
// so the player perceives a real 4-handed deal before discards happen.
const DEAL_ROUNDS = 4;
// Per-card stagger inside the deal phase. Tight so the whole 16-card deal
// finishes in well under the discard window.
const DEAL_STAGGER_MS = 22;
const DEAL_FLY_MS = 200;
// Phase timings (must add up to ≤ SHUFFLE_ANIMATION_MS = 2600ms on server).
// Tight: deal ends ≈2102ms, discard glow ≈2102ms, slide ≈2192ms + 380ms = 2572ms.
const DEAL_START_MS = 1550;
const DEAL_END_MS = DEAL_START_MS + DEAL_ROUNDS * 4 * DEAL_STAGGER_MS + DEAL_FLY_MS; // ≈ 2102
const DISCARD_START_MS = DEAL_END_MS; // side piles glow + label
const DISCARD_SLIDE_MS = DISCARD_START_MS + 90; // then slide off

// Pile positions on the virtual table — kept compact so the overlay never
// hides the bidding bar / hand / score on mobile.
const PILE_OFFSETS: { tx: number; ty: number; rot: number; key: "left" | "top" | "right" | "bottom" }[] = [
  { tx: -120, ty: 0,    rot: -8,  key: "left" },
  { tx: 0,    ty: -78,  rot: 0,   key: "top" },
  { tx: 120,  ty: 0,    rot: 8,   key: "right" },
  { tx: 0,    ty: 78,   rot: 0,   key: "bottom" },
];

export function ShuffleOverlay() {
  // Timeline (server animation budget = 2600ms):
  //   0.00s  fade in + half-stacks fly in
  //   0.40s  riffle
  //   1.00s  cut
  //   1.55s  4-pile deal (left → top → right → bottom) × 4 rounds
  //   2.37s  side piles glow + "Discarded" label
  //   2.49s  side piles slide off into discard zone
  return (
    <div
      data-testid="shuffle-overlay"
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-lg overflow-hidden"
      style={{ animation: "shuffle-fade-in 200ms ease-out both" }}
    >
      <div className="absolute top-[14%] sm:top-[18%] text-center pointer-events-none px-4">
        <p className="text-[10px] sm:text-xs uppercase tracking-[0.4em] text-primary/80">
          Dealer is shuffling
        </p>
      </div>

      {/* Card stage — centered fixed-size box so all animations are anchored */}
      <div className="relative w-72 h-56 sm:w-96 sm:h-64 flex items-center justify-center">
        {/* LEFT half-stack: flies in, then riffles toward center */}
        <div
          className="absolute"
          style={{
            animation:
              "shuffle-stack-in-left 380ms cubic-bezier(0.2, 0.7, 0.2, 1) both, " +
              "shuffle-riffle-left 600ms cubic-bezier(0.5, 0, 0.5, 1) 400ms both",
          }}
        >
          {Array.from({ length: STACK_SIZE }).map((_, i) => (
            <CardBack
              key={`l-${i}`}
              className="absolute"
              style={{
                top: `${-i * 2}px`,
                left: `${-i * 1}px`,
                zIndex: STACK_SIZE - i,
              }}
            />
          ))}
        </div>

        {/* RIGHT half-stack: mirror */}
        <div
          className="absolute"
          style={{
            animation:
              "shuffle-stack-in-right 380ms cubic-bezier(0.2, 0.7, 0.2, 1) both, " +
              "shuffle-riffle-right 600ms cubic-bezier(0.5, 0, 0.5, 1) 400ms both",
          }}
        >
          {Array.from({ length: STACK_SIZE }).map((_, i) => (
            <CardBack
              key={`r-${i}`}
              className="absolute"
              style={{
                top: `${-i * 2}px`,
                right: `${-i * 1}px`,
                zIndex: STACK_SIZE - i,
              }}
            />
          ))}
        </div>

        {/* CUT pile — appears after riffle, performs the cut motion. Then
            fades during the deal phase so it doesn't compete with the
            flying deal cards. */}
        <div
          className="absolute"
          style={{
            animation:
              "shuffle-fade-in 120ms ease-out 1000ms both, " +
              "shuffle-cut 540ms cubic-bezier(0.5, 0, 0.5, 1) 1000ms both, " +
              `shuffle-fade-out 200ms ease-in ${DEAL_START_MS - 100}ms both`,
            opacity: 0,
          }}
        >
          {Array.from({ length: STACK_SIZE + 2 }).map((_, i) => (
            <CardBack
              key={`c-${i}`}
              className="absolute"
              style={{
                top: `${-i * 1.5}px`,
                left: `${-i * 0.5}px`,
                zIndex: STACK_SIZE + 2 - i,
              }}
            />
          ))}
        </div>

        {/* PILE RESTING SPOTS — show the 4 dealt piles building up.
            Each pile is a small stack of card-backs that fade in as cards
            arrive. The side (left + right) piles get the discard treatment. */}
        {PILE_OFFSETS.map((pile) => {
          const isSide = pile.key === "left" || pile.key === "right";
          const pileFadeIn = DEAL_START_MS + 200; // begin to be visible as cards land
          return (
            <div
              key={`pile-${pile.key}`}
              className="absolute"
              data-testid={`deal-pile-${pile.key}`}
              style={{
                transform: `translate(${pile.tx}px, ${pile.ty}px) rotate(${pile.rot}deg)`,
                animation: isSide
                  ? `shuffle-fade-in 240ms ease-out ${pileFadeIn}ms both, ` +
                    `shuffle-pile-discard 380ms ease-in ${DISCARD_SLIDE_MS}ms both`
                  : `shuffle-fade-in 240ms ease-out ${pileFadeIn}ms both`,
                opacity: 0,
              }}
            >
              {Array.from({ length: 3 }).map((_, i) => (
                <CardBack
                  key={`p-${pile.key}-${i}`}
                  className="absolute"
                  style={{
                    top: `${-i * 1.5}px`,
                    left: `${-i * 0.5}px`,
                    zIndex: 3 - i,
                  }}
                />
              ))}
              {/* Discarded label sits over the pile, fades in at discard start. */}
              {isSide && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 -top-5 sm:-top-6 whitespace-nowrap"
                  style={{
                    animation:
                      `shuffle-fade-in 200ms ease-out ${DISCARD_START_MS}ms both, ` +
                      `shuffle-fade-out 220ms ease-in ${DISCARD_SLIDE_MS + 120}ms both`,
                    opacity: 0,
                  }}
                >
                  <span
                    data-testid={`deal-discard-label-${pile.key}`}
                    className="px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] uppercase tracking-widest font-semibold bg-destructive/30 text-destructive border border-destructive/40"
                  >
                    Discarded
                  </span>
                </div>
              )}
              {/* Side piles dim/glow during the discard moment. */}
              {isSide && (
                <div
                  className="absolute inset-0 rounded-md pointer-events-none"
                  style={{
                    animation: `shuffle-pile-dim 260ms ease-out ${DISCARD_START_MS}ms both`,
                    opacity: 0,
                    background: "rgba(0,0,0,0.45)",
                    boxShadow: "0 0 24px 4px rgba(239,68,68,0.45)",
                  }}
                />
              )}
            </div>
          );
        })}

        {/* DEAL cards — fly from the center cut-pile out to each of the
            4 piles in rotation: left → top → right → bottom. */}
        {Array.from({ length: DEAL_ROUNDS * 4 }).map((_, i) => {
          const pile = PILE_OFFSETS[i % 4]!;
          const delay = DEAL_START_MS + i * DEAL_STAGGER_MS;
          // Per-card target via CSS custom properties consumed by shuffle-deal-to.
          const style: CSSProperties = {
            animation: `shuffle-deal-to ${DEAL_FLY_MS}ms cubic-bezier(0.4, 0, 0.6, 1) ${delay}ms both`,
            opacity: 0,
            // Cast so React accepts CSS custom properties on inline style.
            ["--deal-tx" as unknown as string]: `${pile.tx}px`,
            ["--deal-ty" as unknown as string]: `${pile.ty}px`,
            ["--deal-rot" as unknown as string]: `${pile.rot}deg`,
          };
          return (
            <div key={`d-${i}`} className="absolute" style={style}>
              <CardBack />
            </div>
          );
        })}
      </div>

      <div
        className="absolute bottom-[16%] sm:bottom-[20%] text-center pointer-events-none px-4 space-y-1"
      >
        <p
          className="text-xs sm:text-sm text-muted-foreground italic"
          style={{
            animation: `shuffle-fade-out 220ms ease-in ${DISCARD_START_MS}ms both`,
          }}
        >
          Dealing the cards…
        </p>
        <p
          data-testid="deal-discard-explainer"
          className="text-[11px] sm:text-xs uppercase tracking-wider text-destructive/90 font-semibold"
          style={{
            animation: `shuffle-fade-in 220ms ease-out ${DISCARD_START_MS}ms both`,
            opacity: 0,
          }}
        >
          Side hands discarded — 1v1 hands locked in
        </p>
      </div>
    </div>
  );
}

export default ShuffleOverlay;
