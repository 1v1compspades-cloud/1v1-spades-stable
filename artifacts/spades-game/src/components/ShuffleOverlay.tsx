import { useEffect, useState, type CSSProperties } from "react";

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
        "bg-gradient-to-br from-[#2a2620] via-[#15120d] to-black " +
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

// ── Timeline (must finish inside the server's SHUFFLE_ANIMATION_MS = 3100ms) ──
//   0ms     shuffle  — two half-stacks fly in + riffle together
//   1000ms  cut      — opponent cuts the deck
//   1560ms  deal     — 16 cards fly clockwise into 4 piles (You · West · Opp · East)
//   2200ms  discard  — the two SIDE hands sweep into the graveyard, kept hands glow
//   2980ms  done     — final teaching frame: only You + Opponent remain in play
const CUT_MS = 1000;
const DEAL_START_MS = 1560;
const DISCARD_START_MS = 2200;
const DONE_MS = 2980;
const DEAL_STAGGER_MS = 30;
const STACK_SIZE = 7;
const ROUNDS = 4; // 4 cards dealt to each of the 4 piles → 16 flying cards

type Stage = "shuffle" | "cut" | "deal" | "discard" | "done";

type PileKey = "bottom" | "left" | "top" | "right";
type PileRole = "you" | "opp" | "side";
interface Pile {
  key: PileKey;
  x: number;
  y: number;
  rot: number;
  role: PileRole;
}

// Piles sit around a virtual round table. Deal order is CLOCKWISE from the
// dealer (bottom/South), i.e. bottom → left(West) → top(North) → right(East),
// mirroring how a real dealer flicks cards to the player on their left.
const PILES: Pile[] = [
  { key: "bottom", x: 0, y: 86, rot: 0, role: "you" },
  { key: "left", x: -104, y: 0, rot: -6, role: "side" },
  { key: "top", x: 0, y: -86, rot: 0, role: "opp" },
  { key: "right", x: 104, y: 0, rot: 6, role: "side" },
];
const DEAL_ORDER: PileKey[] = ["bottom", "left", "top", "right"];
// The graveyard sits off to the right of the table — clearly outside the
// circle of in-play hands so discarded cards read as "removed from the game".
// Kept inset enough that it never clips on narrow phones.
const GRAVE = { x: 150, y: 14 };

interface DealtCard {
  pile: Pile;
  round: number;
  dealIndex: number; // order this card is dealt (for the deal stagger)
  graveSlot: number | null; // null = kept hand; number = its slot in the graveyard
}

function buildDealtCards(): DealtCard[] {
  const cards: DealtCard[] = [];
  let grave = 0;
  for (let round = 0; round < ROUNDS; round++) {
    DEAL_ORDER.forEach((key, orderIndex) => {
      const pile = PILES.find((p) => p.key === key)!;
      const graveSlot = pile.role === "side" ? grave++ : null;
      cards.push({ pile, round, dealIndex: round * 4 + orderIndex, graveSlot });
    });
  }
  return cards;
}
const DEALT_CARDS = buildDealtCards();

interface ShuffleOverlayProps {
  onSkip?: () => void;
}

export function ShuffleOverlay({ onSkip }: ShuffleOverlayProps) {
  const prefersReduced =
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  const [stage, setStage] = useState<Stage>(
    prefersReduced ? "done" : "shuffle",
  );

  useEffect(() => {
    if (prefersReduced) return;
    const timers = [
      setTimeout(() => setStage("cut"), CUT_MS),
      setTimeout(() => setStage("deal"), DEAL_START_MS),
      setTimeout(() => setStage("discard"), DISCARD_START_MS),
      setTimeout(() => setStage("done"), DONE_MS),
    ];
    return () => timers.forEach(clearTimeout);
  }, [prefersReduced]);

  const showIntro = stage === "shuffle" || stage === "cut";
  const dealing = stage === "deal" || stage === "discard" || stage === "done";
  const discarding = stage === "discard" || stage === "done";

  const caption =
    stage === "shuffle"
      ? "Shuffling the deck"
      : stage === "cut"
        ? "Opponent cuts the deck"
        : stage === "deal"
          ? "Dealing four hands"
          : stage === "discard"
            ? "Side hands go to the graveyard"
            : "You vs Opponent · 13 cards each";

  function cardStyle(c: DealtCard): CSSProperties {
    const base: CSSProperties = {
      position: "absolute",
      transition:
        "transform 360ms cubic-bezier(0.4, 0, 0.2, 1), opacity 280ms ease",
    };
    if (!dealing) {
      // Still in the dealer's hand at center, not yet visible.
      return {
        ...base,
        transform: "translate(0px, 0px) rotate(0deg)",
        opacity: 0,
        transitionDelay: "0ms",
        zIndex: 5,
      };
    }
    // Discarded side cards sweep into the graveyard, stacking inside its box.
    if (discarding && c.pile.role === "side" && c.graveSlot !== null) {
      const gx = GRAVE.x + (c.graveSlot % 2 === 0 ? -2 : 2);
      const gy = GRAVE.y + c.graveSlot * 1.3 - 4;
      return {
        ...base,
        transform: `translate(${gx}px, ${gy}px) rotate(${c.graveSlot % 2 ? 8 : -8}deg) scale(0.72)`,
        opacity: 0.4,
        transitionDelay: `${c.graveSlot * 26}ms`,
        zIndex: 3,
      };
    }
    // Resting in its dealt pile.
    const px = c.pile.x + c.round * 0.8;
    const py = c.pile.y - c.round * 2;
    return {
      ...base,
      transform: `translate(${px}px, ${py}px) rotate(${c.pile.rot}deg)`,
      opacity: 1,
      transitionDelay: stage === "deal" ? `${c.dealIndex * DEAL_STAGGER_MS}ms` : "0ms",
      zIndex: c.pile.role === "side" ? 4 : 6,
    };
  }

  const keptPiles = PILES.filter((p) => p.role !== "side");

  return (
    <div
      data-testid="shuffle-overlay"
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-lg overflow-hidden"
      style={prefersReduced ? undefined : { animation: "shuffle-fade-in 200ms ease-out both" }}
    >
      {/* Top caption — narrates each phase of the deal */}
      <div className="absolute top-[9%] sm:top-[13%] text-center pointer-events-none px-4">
        <p
          key={caption}
          data-testid="deal-caption"
          className="text-xs sm:text-sm uppercase tracking-[0.35em] text-primary font-semibold"
          style={prefersReduced ? undefined : { animation: "shuffle-fade-in 260ms ease-out both" }}
        >
          {caption}
        </p>
        <p className="mt-1.5 text-[10px] sm:text-xs text-muted-foreground">
          1v1 Spades uses <span className="text-amber-300 font-semibold">26 cards</span> ·
          two hands play, two are removed
        </p>
      </div>

      {/* Card stage — fixed-size box so every transform is anchored to center */}
      <div className="relative w-72 h-56 sm:w-96 sm:h-64 flex items-center justify-center">
        {/* Round table outline behind the piles */}
        <div
          aria-hidden="true"
          data-testid="deal-table-outline"
          className="absolute rounded-full pointer-events-none"
          style={{
            width: "232px",
            height: "232px",
            border: "1px dashed rgba(245, 197, 24, 0.18)",
            boxShadow: "inset 0 0 40px rgba(0, 0, 0, 0.5)",
            background:
              "radial-gradient(circle at center, rgba(224,168,42,0.10) 0%, rgba(0,0,0,0) 70%)",
          }}
        />

        {/* ── Deck intro (shuffle + cut) — skipped entirely under reduced motion ── */}
        {!prefersReduced && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ opacity: showIntro ? 1 : 0, transition: "opacity 220ms ease" }}
        >
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
                style={{ top: `${-i * 2}px`, left: `${-i * 1}px`, zIndex: STACK_SIZE - i }}
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
                style={{ top: `${-i * 2}px`, right: `${-i * 1}px`, zIndex: STACK_SIZE - i }}
              />
            ))}
          </div>

          {/* CUT pile — appears after the riffle and performs the cut motion */}
          <div
            className="absolute"
            style={{
              animation:
                `shuffle-fade-in 120ms ease-out ${CUT_MS}ms both, ` +
                `shuffle-cut 540ms cubic-bezier(0.5, 0, 0.5, 1) ${CUT_MS}ms both`,
              opacity: 0,
            }}
          >
            {Array.from({ length: STACK_SIZE + 2 }).map((_, i) => (
              <CardBack
                key={`c-${i}`}
                className="absolute"
                style={{ top: `${-i * 1.5}px`, left: `${-i * 0.5}px`, zIndex: STACK_SIZE + 2 - i }}
              />
            ))}
          </div>
        </div>
        )}

        {/* ── Graveyard zone (appears as the side hands are discarded) ── */}
        <div
          data-testid="deal-graveyard"
          className="absolute"
          style={{
            transform: `translate(${GRAVE.x}px, ${GRAVE.y}px)`,
            opacity: discarding ? 1 : 0,
            transition: "opacity 240ms ease",
          }}
        >
          <div className="relative w-10 h-14 sm:w-14 sm:h-20">
            <span className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] uppercase tracking-widest font-bold bg-destructive/25 text-destructive border border-destructive/40 whitespace-nowrap">
              🪦 Graveyard
            </span>
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-md border border-dashed border-destructive/40 bg-black/40"
              style={{ boxShadow: "inset 0 0 18px rgba(0,0,0,0.6)" }}
            />
            <span className="absolute top-full mt-1 left-1/2 -translate-x-1/2 text-[8px] sm:text-[9px] text-muted-foreground whitespace-nowrap">
              out of play
            </span>
          </div>
        </div>

        {/* ── Kept-hand glow rings + labels (You / Opponent) ── */}
        {keptPiles.map((pile) => (
          <div
            key={`keep-${pile.key}`}
            className="absolute"
            style={{
              transform: `translate(${pile.x}px, ${pile.y}px)`,
              opacity: dealing ? 1 : 0,
              transition: "opacity 240ms ease",
            }}
          >
            <div
              aria-hidden="true"
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-16 sm:w-16 sm:h-[5.5rem] rounded-md"
              style={{
                animation:
                  discarding && !prefersReduced
                    ? "deal-keep-pulse 1400ms ease-in-out infinite"
                    : "none",
              }}
            />
            <div
              data-testid={`deal-keep-label-${pile.role}`}
              className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap"
              style={pile.role === "you" ? { top: "46px" } : { bottom: "46px" }}
            >
              <span className="px-2 py-0.5 rounded text-[9px] sm:text-[10px] uppercase tracking-widest font-bold bg-primary/20 text-primary border border-primary/40">
                {pile.role === "you" ? "You" : "Opponent"}
              </span>
            </div>
          </div>
        ))}

        {/* ── Dealt cards — fly clockwise into the four piles, then the side
            hands sweep into the graveyard ── */}
        {DEALT_CARDS.map((c) => (
          <div
            key={`deal-${c.pile.key}-${c.round}`}
            data-testid={`deal-card-${c.pile.key}-${c.round}`}
            style={cardStyle(c)}
          >
            <CardBack />
          </div>
        ))}
      </div>

      {/* Bottom teaching line */}
      <div className="absolute bottom-6 sm:bottom-10 text-center pointer-events-none px-4">
        <div
          data-testid="deal-discard-explainer"
          style={{
            opacity: discarding ? 1 : 0,
            transition: "opacity 240ms ease",
          }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-destructive/15 border border-destructive/40">
            <span className="text-destructive text-base sm:text-lg leading-none">−</span>
            <span className="text-xs sm:text-sm font-semibold text-destructive uppercase tracking-wider">
              West &amp; East hands removed
            </span>
          </div>
          <p className="mt-1.5 text-[10px] sm:text-xs text-muted-foreground">
            Only the two opposite hands stay in play — 13 cards each
          </p>
        </div>
      </div>

      {/* Skip control — lets players bypass the deal on any hand */}
      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          data-testid="button-skip-deal"
          className="absolute bottom-5 right-5 sm:bottom-7 sm:right-7 pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-card/80 px-3.5 py-1.5 text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-primary hover:bg-primary/15 hover:border-primary/60 transition-colors"
        >
          Skip <span aria-hidden="true">⏭</span>
        </button>
      )}
    </div>
  );
}

export default ShuffleOverlay;
