import { Card as CardType, SUIT_COLORS, SUIT_SYMBOLS } from "@/lib/game";
import { cn } from "@/lib/utils";

interface CardProps {
  card?: CardType;
  hidden?: boolean;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
}

export function CardComponent({ card, hidden, className, onClick, disabled, selected }: CardProps) {
  if (hidden || !card) {
    return (
      <div 
        className={cn(
          "relative w-20 h-28 sm:w-24 sm:h-36 rounded-lg border-2 border-slate-700 bg-slate-800 shadow-md flex items-center justify-center overflow-hidden",
          "bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjMWUyOTNiIj48L3JlY3Q+CjxwYXRoIGQ9Ik0wIDBMOCA4Wk04IDBMMCA4WiIgc3Ryb2tlPSIjMzMzNDNiIiBzdHJva2Utd2lkdGg9IjEiPjwvcGF0aD4KPC9zdmc+')] bg-repeat",
          className
        )}
      />
    );
  }

  const colorClass = SUIT_COLORS[card.suit];
  const symbol = SUIT_SYMBOLS[card.suit];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative w-20 h-28 sm:w-24 sm:h-36 rounded-lg border border-slate-300 bg-white shadow-md flex flex-col justify-between p-2 select-none transition-transform duration-200",
        colorClass,
        disabled && "opacity-50 cursor-not-allowed filter grayscale-[0.3]",
        !disabled && onClick && "hover:-translate-y-4 hover:shadow-lg cursor-pointer",
        selected && "-translate-y-4 shadow-lg ring-2 ring-primary ring-offset-2 ring-offset-background",
        className
      )}
    >
      <div className="flex flex-col items-center self-start leading-none">
        <span className="text-lg sm:text-xl font-bold font-serif">{card.rank}</span>
        <span className="text-sm sm:text-base">{symbol}</span>
      </div>
      
      <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
        <span className="text-6xl">{symbol}</span>
      </div>

      <div className="flex flex-col items-center self-end rotate-180 leading-none">
        <span className="text-lg sm:text-xl font-bold font-serif">{card.rank}</span>
        <span className="text-sm sm:text-base">{symbol}</span>
      </div>
    </button>
  );
}
