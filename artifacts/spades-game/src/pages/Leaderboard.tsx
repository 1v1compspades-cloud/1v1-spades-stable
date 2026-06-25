import { Link } from "wouter";
import { ArrowLeft, Trophy } from "lucide-react";
import { Seo } from "@/components/Seo";
import { V11LeaderboardPanel } from "@/components/V11LeaderboardPanel";

export default function Leaderboard() {
  return (
    <>
      <Seo
        title="Ranked Leaderboard | 1v1 Spades"
        description="Season 0 ranked leaderboard for 1v1 Spades."
        path="/leaderboard"
      />
      <main className="min-h-[100dvh] bg-background text-foreground">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6 sm:py-8">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-md border border-border/50 bg-white/[0.03] px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              data-testid="link-leaderboard-back"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to Lobby
            </Link>
            <div className="flex items-center gap-2 text-primary">
              <Trophy className="h-5 w-5" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-[0.35em]">
                Ranked
              </span>
            </div>
          </header>

          <V11LeaderboardPanel variant="full" />
        </div>
      </main>
    </>
  );
}
