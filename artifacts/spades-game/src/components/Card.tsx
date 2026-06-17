import { Card as CardType, SUIT_SYMBOLS } from "@/lib/game";
import { cn } from "@/lib/utils";

interface CardProps {
  card?: CardType;
  hidden?: boolean;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  /** Visually dim the card (e.g. illegal play during your turn). Still readable. */
  dimmed?: boolean;
}

// Four-color suit palette for clear visual distinction at a glance.
// Each color is dark enough to read on the white card face.
const SUIT_FACE_COLORS: Record<CardType["suit"], string> = {
  spades:   "text-slate-900",
  hearts:   "text-red-600",
  clubs:    "text-emerald-700",
  diamonds: "text-blue-700",
};

const SUIT_EDGE_COLORS: Record<CardType["suit"], string> = {
  spades:   "before:bg-slate-900",
  hearts:   "before:bg-red-600",
  clubs:    "before:bg-emerald-700",
  diamonds: "before:bg-blue-700",
};

const SUIT_BORDER_COLORS: Record<CardType["suit"], string> = {
  spades:   "border-slate-800/70",
  hearts:   "border-red-500/70",
  clubs:    "border-emerald-600/70",
  diamonds: "border-blue-600/70",
};

export function CardComponent({ card, hidden, className, onClick, disabled, selected, dimmed }: CardProps) {
  if (hidden || !card) {
    return (
      <div
        className={cn(
        "spades-card-back relative flex-shrink-0 w-[3.85rem] h-[5.55rem] sm:w-24 sm:h-36 rounded-xl border-2 shadow-md flex items-center justify-center overflow-hidden",
          "after:absolute after:inset-2 after:rounded-lg after:border after:border-primary/25",
          className
        )}
      />
    );
  }

  const colorClass = SUIT_FACE_COLORS[card.suit];
  const symbol = SUIT_SYMBOLS[card.suit];
  const markClass = cn(colorClass, "disabled:opacity-100");

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={`card-${card.suit}-${card.rank}`}
      aria-label={`${card.rank} of ${card.suit}`}
      className={cn(
        // Compact mobile card so a horizontal hand strip fits on one row.
        // Compact mobile card keeps the 13-card hand usable in a WebView.
        "spades-card-face relative flex-shrink-0 w-[3.85rem] h-[5.55rem] sm:w-24 sm:h-36 rounded-xl border-2 shadow-md flex flex-col items-center justify-center p-1.5 select-none transition-transform duration-150 disabled:opacity-100",
        // Suit-tinted left edge bar for fast scanning even when fanned
        "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 before:rounded-l-xl",
        SUIT_EDGE_COLORS[card.suit],
        SUIT_BORDER_COLORS[card.suit],
        // Disabled but NOT dimmed (e.g. during bidding, opponent's turn) →
        // fully readable, just non-clickable.
        disabled && "cursor-default",
        // Dimmed = illegal play during your own turn. Keep face readable
        // (opacity is mild so suit/rank still scan on Android/Samsung).
        dimmed && "opacity-60 saturate-75",
        // Playable cards get a subtle gold ring + lift hint so they stand out.
        !disabled && onClick && "ring-2 ring-primary/60 ring-offset-1 ring-offset-background hover:-translate-y-3 hover:shadow-xl active:translate-y-0 cursor-pointer",
        selected && "-translate-y-3 shadow-xl ring-2 ring-primary ring-offset-2 ring-offset-background",
        className
      )}
    >
      {/* Top-left corner index: rank stacked over suit */}
      <div className={cn("absolute top-1 left-2 flex flex-col items-center leading-[0.85]", markClass)}>
        <span className="text-sm sm:text-lg font-bold font-serif tabular-nums">{card.rank}</span>
        <span className="text-sm sm:text-base">{symbol}</span>
      </div>

      {/* Center: large stacked value over suit — the dominant face */}
      <div className={cn("flex flex-col items-center justify-center leading-none pointer-events-none", markClass)}>
        <span className="text-2xl sm:text-4xl font-bold font-serif tabular-nums drop-shadow-sm">{card.rank}</span>
        <span className="text-2xl sm:text-4xl mt-0.5 drop-shadow-sm">{symbol}</span>
      </div>

      {/* Bottom-right corner index (rotated) */}
      <div className={cn("absolute bottom-1 right-2 flex flex-col items-center leading-[0.85] rotate-180", markClass)}>
        <span className="text-sm sm:text-lg font-bold font-serif tabular-nums">{card.rank}</span>
        <span className="text-sm sm:text-base">{symbol}</span>
      </div>
    </button>
  );
}
