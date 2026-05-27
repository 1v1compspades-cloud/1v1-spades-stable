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
const DEAL_STAGGER_MS = 34;
const DEAL_FLY_MS = 300;
// Phase timings (must add up to ≤ SHUFFLE_ANIMATION_MS = 3100ms on server).
// Deal ends ≈2544ms, discard glow ≈2544ms, slide ≈2634ms + 380ms = 3014ms.
const DEAL_START_MS = 1700;
const DEAL_END_MS = DEAL_START_MS + DEAL_ROUNDS * 4 * DEAL_STAGGER_MS + DEAL_FLY_MS; // ≈ 2102
const DISCARD_START_MS = DEAL_END_MS; // side piles glow + label
const DISCARD_SLIDE_MS = DISCARD_START_MS + 90; // then slide off

// Pile positions on the virtual table — arranged on a true CIRCLE of equal
// radius around the center so the deal reads as "around a round table" rather
// than a cross/star pattern. Deal order is CLOCKWISE starting from the dealer
// (bottom/south), then west, north, east — matching how a real dealer flicks
// cards around the table starting with the player on their left.
const PILE_RADIUS = 100;
const PILE_OFFSETS: { tx: number; ty: number; rot: number; key: "bottom" | "left" | "top" | "right" }[] = [
  { tx: 0,             ty: PILE_RADIUS,  rot: 0,   key: "bottom" }, // dealer / south
  { tx: -PILE_RADIUS,  ty: 0,            rot: -8,  key: "left"   }, // west
  { tx: 0,             ty: -PILE_RADIUS, rot: 0,   key: "top"    }, // north
  { tx: PILE_RADIUS,   ty: 0,            rot: 8,   key: "right"  }, // east
];

// Curved-arc midpoint: cards travel from center to each pile through an arc
// that bows CLOCKWISE (perpendicular to the radial direction, rotated -90°).
// Perp of (tx, ty) rotated CW = (ty, -tx); scaled to 0.45 for a visible but
// not exaggerated arc.
const ARC_BOW = 0.45;
function midpoint(tx: number, ty: number): { mx: number; my: number } {
  return {
    mx: tx / 2 + ty * ARC_BOW,
    my: ty / 2 + -tx * ARC_BOW,
  };
}

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
        <p className="mt-1 text-[10px] sm:text-xs text-muted-foreground">
          1v1 Spades uses <span className="text-amber-300 font-semibold">26 cards</span> · the West &amp; East hands are removed
        </p>
        {import.meta.env.DEV && (
          <p
            data-testid="deal-anim-debug-label"
            className="mt-1 text-[9px] uppercase tracking-widest text-amber-300/80 font-mono"
          >
            [dev] Using 1v1 four-pile deal animation
          </p>
        )}
      </div>

      {/* "Half deck removed" banner — fades in at the moment the side piles
          get discarded so the player visibly understands that 26 of the 52
          cards just left the table. Sits below the card stage. */}
      <div
        data-testid="deal-deck-removed-banner"
        className="absolute bottom-[18%] sm:bottom-[20%] text-center pointer-events-none px-4"
        style={{
          animation: `shuffle-fade-in 300ms ease-out ${DISCARD_START_MS}ms both`,
          opacity: 0,
        }}
      >
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-destructive/15 border border-destructive/40">
          <span className="text-destructive text-base sm:text-lg leading-none">−</span>
          <span className="text-xs sm:text-sm font-semibold text-destructive uppercase tracking-wider">
            26 cards removed
          </span>
        </div>
        <p className="mt-1.5 text-[10px] sm:text-xs text-muted-foreground">
          13 cards × 2 hands · West &amp; East piles discarded
        </p>
      </div>

      {/* Card stage — centered fixed-size box so all animations are anchored */}
      <div className="relative w-72 h-56 sm:w-96 sm:h-64 flex items-center justify-center">
        {/* CIRCULAR TABLE OUTLINE — subtle felt circle behind the piles so
            the 4 dealt hands read as positions around a round table, not at
            cardinal points in empty space. */}
        <div
          aria-hidden="true"
          data-testid="deal-table-outline"
          className="absolute rounded-full pointer-events-none"
          style={{
            width: `${PILE_RADIUS * 2 + 80}px`,
            height: `${PILE_RADIUS * 2 + 80}px`,
            border: "1px dashed rgba(245, 197, 24, 0.18)",
            boxShadow: "inset 0 0 40px rgba(16, 80, 50, 0.35)",
            background: "radial-gradient(circle at center, rgba(20,90,60,0.18) 0%, rgba(0,0,0,0) 70%)",
            animation: `shuffle-fade-in 400ms ease-out ${DEAL_START_MS - 200}ms both`,
            opacity: 0,
          }}
        />

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

        {/* DEAL cards — fly from the center cut-pile out to each of the 4
            piles in CLOCKWISE rotation starting from the dealer (bottom):
            bottom → left → top → right. Each card travels along a curved
            arc (midpoint computed perpendicular to the radial direction)
            so the deal visibly sweeps around the round table. */}
        {Array.from({ length: DEAL_ROUNDS * 4 }).map((_, i) => {
          const pile = PILE_OFFSETS[i % 4]!;
          const { mx, my } = midpoint(pile.tx, pile.ty);
          const delay = DEAL_START_MS + i * DEAL_STAGGER_MS;
          // Per-card target + midpoint via CSS custom properties consumed by
          // shuffle-deal-to (which interpolates start → midpoint → end).
          const style: CSSProperties = {
            animation: `shuffle-deal-to ${DEAL_FLY_MS}ms cubic-bezier(0.4, 0, 0.6, 1) ${delay}ms both`,
            opacity: 0,
            // Cast so React accepts CSS custom properties on inline style.
            ["--deal-tx" as unknown as string]: `${pile.tx}px`,
            ["--deal-ty" as unknown as string]: `${pile.ty}px`,
            ["--deal-mid-tx" as unknown as string]: `${mx}px`,
            ["--deal-mid-ty" as unknown as string]: `${my}px`,
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
