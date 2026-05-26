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
        "w-16 h-24 sm:w-20 sm:h-28 rounded-md border-2 border-amber-300/70 " +
        "bg-gradient-to-br from-emerald-800 via-emerald-900 to-black " +
        "shadow-[0_6px_18px_-4px_rgba(0,0,0,0.6)] " +
        "relative overflow-hidden " +
        className
      }
      aria-hidden="true"
    >
      <div className="absolute inset-1 rounded-sm border border-amber-300/30" />
      <div className="absolute inset-0 flex items-center justify-center text-amber-300/50 text-xl font-serif">
        ♠
      </div>
    </div>
  );
}

const STACK_SIZE = 7;
const DEAL_COUNT = 8;

export function ShuffleOverlay() {
  // Animation timeline (must total ≈ SHUFFLE_ANIMATION_MS on the server = 2600ms):
  //   0.00s  fade in + stacks fly in from sides
  //   0.40s  riffle (interleave toward center)
  //   1.00s  cut motion
  //   1.55s  deal cards flying alternately up/down
  //   2.45s  end
  return (
    <div
      data-testid="shuffle-overlay"
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-lg overflow-hidden"
      style={{ animation: "shuffle-fade-in 200ms ease-out both" }}
    >
      <div className="absolute top-[18%] sm:top-[22%] text-center pointer-events-none">
        <p className="text-[10px] sm:text-xs uppercase tracking-[0.4em] text-primary/80">
          Dealer is shuffling
        </p>
      </div>

      {/* Card stage — centered fixed-size box so all animations are anchored */}
      <div className="relative w-64 h-40 sm:w-80 sm:h-48 flex items-center justify-center">
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

        {/* CUT pile — appears after riffle, performs the cut motion */}
        <div
          className="absolute"
          style={{
            animation:
              "shuffle-fade-in 120ms ease-out 1000ms both, " +
              "shuffle-cut 540ms cubic-bezier(0.5, 0, 0.5, 1) 1000ms both",
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

        {/* DEAL cards — pop out alternately to top + bottom seats */}
        {Array.from({ length: DEAL_COUNT }).map((_, i) => {
          const up = i % 2 === 0;
          const delay = 1550 + i * 110;
          return (
            <div
              key={`d-${i}`}
              className="absolute"
              style={{
                animation: `${
                  up ? "shuffle-deal-up" : "shuffle-deal-down"
                } 700ms cubic-bezier(0.4, 0, 0.6, 1) ${delay}ms both`,
                opacity: 0,
              }}
            >
              <CardBack />
            </div>
          );
        })}
      </div>

      <div className="absolute bottom-[20%] sm:bottom-[24%] text-center pointer-events-none">
        <p className="text-xs sm:text-sm text-muted-foreground italic">Dealing the cards…</p>
      </div>
    </div>
  );
}

export default ShuffleOverlay;
