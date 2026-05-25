import { Card as CardType, SUIT_SYMBOLS } from "@/lib/game";
import { cn } from "@/lib/utils";

interface CardProps {
  card?: CardType;
  hidden?: boolean;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
}

// Four-color suit palette for clear visual distinction at a glance.
// Each color is dark enough to read on the white card face.
const SUIT_FACE_COLORS: Record<CardType["suit"], string> = {
  spades:   "text-slate-900",
  hearts:   "text-red-600",
  clubs:    "text-emerald-700",
  diamonds: "text-blue-700",
};

export function CardComponent({ card, hidden, className, onClick, disabled, selected }: CardProps) {
  if (hidden || !card) {
    return (
      <div
        className={cn(
          "relative flex-shrink-0 w-16 h-24 sm:w-24 sm:h-36 rounded-lg border-2 border-slate-700 bg-slate-800 shadow-md flex items-center justify-center overflow-hidden",
          "bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjMWUyOTNiIj48L3JlY3Q+CjxwYXRoIGQ9Ik0wIDBMOCA4Wk04IDBMMCA4WiIgc3Ryb2tlPSIjMzMzNDNiIiBzdHJva2Utd2lkdGg9IjEiPjwvcGF0aD4KPC9zdmc+')] bg-repeat",
          className
        )}
      />
    );
  }

  const colorClass = SUIT_FACE_COLORS[card.suit];
  const symbol = SUIT_SYMBOLS[card.suit];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={`card-${card.suit}-${card.rank}`}
      aria-label={`${card.rank} of ${card.suit}`}
      className={cn(
        // Compact mobile card so a horizontal hand strip fits on one row.
        // 64×88 mobile is still a solid tap target; sm: bumps back to 96×144.
        "relative flex-shrink-0 w-16 h-24 sm:w-24 sm:h-36 rounded-lg border border-slate-300 bg-white shadow-md flex flex-col items-center justify-center p-1.5 select-none transition-transform duration-150",
        // Suit-tinted left edge bar for fast scanning even when fanned
        "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 before:rounded-l-lg",
        card.suit === "spades"   && "before:bg-slate-900",
        card.suit === "hearts"   && "before:bg-red-600",
        card.suit === "clubs"    && "before:bg-emerald-700",
        card.suit === "diamonds" && "before:bg-blue-700",
        colorClass,
        // Disabled cards stay FULLY READABLE — no opacity/grayscale/brightness
        // filters (Android/Samsung browsers render those much darker than iOS).
        // Just disable pointer interaction via the native `disabled` attr.
        disabled && "cursor-default",
        // Playable cards get a subtle gold ring + lift hint so they stand out
        // without dimming the rest of the hand.
        !disabled && onClick && "ring-2 ring-primary/60 ring-offset-1 ring-offset-background hover:-translate-y-3 hover:shadow-xl active:translate-y-0 cursor-pointer",
        selected && "-translate-y-3 shadow-xl ring-2 ring-primary ring-offset-2 ring-offset-background",
        className
      )}
    >
      {/* Top-left corner index: rank stacked over suit */}
      <div className="absolute top-1 left-2 flex flex-col items-center leading-[0.85]">
        <span className="text-base sm:text-lg font-bold font-serif tabular-nums">{card.rank}</span>
        <span className="text-sm sm:text-base">{symbol}</span>
      </div>

      {/* Center: large stacked value over suit — the dominant face */}
      <div className="flex flex-col items-center justify-center leading-none pointer-events-none">
        <span className="text-2xl sm:text-3xl font-bold font-serif tabular-nums">{card.rank}</span>
        <span className="text-2xl sm:text-3xl mt-0.5">{symbol}</span>
      </div>

      {/* Bottom-right corner index (rotated) */}
      <div className="absolute bottom-1 right-2 flex flex-col items-center leading-[0.85] rotate-180">
        <span className="text-base sm:text-lg font-bold font-serif tabular-nums">{card.rank}</span>
        <span className="text-sm sm:text-base">{symbol}</span>
      </div>
    </button>
  );
}
