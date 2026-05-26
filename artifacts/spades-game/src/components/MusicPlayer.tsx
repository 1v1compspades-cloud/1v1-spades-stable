import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "spades:music:muted";
const DEFAULT_VOLUME = 0.35;

function readMuted(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "false") return false;
    return true;
  } catch {
    return true;
  }
}

export function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState<boolean>(() => readMuted());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, muted ? "true" : "false");
    } catch {
      /* no-op */
    }
    const a = audioRef.current;
    if (!a) return;
    a.volume = DEFAULT_VOLUME;
    if (muted) {
      a.pause();
    } else {
      const p = a.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          setMuted(true);
        });
      }
    }
  }, [muted]);

  const toggle = () => setMuted((m) => !m);

  const src = `${import.meta.env.BASE_URL}audio/spades_lofi_loop.mp3`;

  return (
    <>
      <audio
        ref={audioRef}
        src={src}
        loop
        preload="auto"
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={muted ? "Unmute background music" : "Mute background music"}
        data-testid="button-music-toggle"
        style={{
          right: "calc(env(safe-area-inset-right) + 12px)",
          bottom: "calc(env(safe-area-inset-bottom) + 11rem)",
        }}
        className="fixed z-[35] h-[38px] w-[38px] sm:h-10 sm:w-10 flex items-center justify-center rounded-full border border-amber-500/40 bg-black/80 text-primary backdrop-blur-sm shadow-[0_4px_14px_rgba(0,0,0,0.35)] hover:bg-primary/15 active:scale-95 transition"
      >
        <span className="text-base sm:text-lg leading-none" aria-hidden="true">
          {muted ? "🔇" : "🎵"}
        </span>
      </button>
    </>
  );
}

export default MusicPlayer;
