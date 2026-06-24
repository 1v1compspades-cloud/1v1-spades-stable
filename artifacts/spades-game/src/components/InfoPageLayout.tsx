import type { ReactNode } from "react";
import { Link } from "wouter";
import { CASUAL_PLAY_DISCLAIMER } from "@/components/LegalFooter";

const NAV = [
  { href: "/rules", label: "Rules" },
  { href: "/fair-play", label: "Fair Play Policy" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/support", label: "Support" },
];

/**
 * Lightweight shared chrome for the public, indexable info pages. Pure presentational layout —
 * no sockets, no game state. Uses semantic HTML so the text is readable to
 * crawlers, and interlinks the pages + homepage for SEO discovery.
 */
export function InfoPageLayout({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <header className="border-b border-border/50">
        <div className="mx-auto max-w-3xl px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="font-serif text-lg font-bold text-primary tracking-wide"
            data-testid="link-home-brand"
          >
            <span aria-hidden className="mr-2 text-base">♠</span>
            1v1 Spades
          </Link>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <nav aria-label="Info pages" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-muted-foreground hover:text-primary transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <Link
              href="/"
              data-testid="button-back-to-game"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              ← Back to Game
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-5 py-10">
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-primary">
            {title}
          </h1>
          {intro && (
            <p className="mt-3 text-base text-muted-foreground leading-relaxed">
              {intro}
            </p>
          )}
          <div className="mt-8 space-y-8 [&_h2]:font-serif [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mb-2 [&_p]:text-muted-foreground [&_p]:leading-relaxed [&_li]:text-muted-foreground [&_li]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5">
            {children}
          </div>

          <div className="mt-12 rounded-xl border border-primary/30 bg-card/60 p-6 text-center">
            <h2 className="font-serif text-xl font-semibold text-primary">
              Ready to play?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a room, share the code, and start a live head-to-head match.
            </p>
            <Link
              href="/"
              data-testid="link-play-now"
              className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-base font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Play Spades
            </Link>
          </div>
        </article>
      </main>

      <footer className="border-t border-border/50">
        <div className="mx-auto max-w-3xl px-5 py-6 space-y-4 text-sm text-muted-foreground">
          <p className="text-xs leading-relaxed">{CASUAL_PLAY_DISCLAIMER}</p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="hover:text-primary transition-colors">
              ← Back to the homepage
            </Link>
            <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="hover:text-primary transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
