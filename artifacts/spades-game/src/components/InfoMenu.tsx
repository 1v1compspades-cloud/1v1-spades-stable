import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LINKS = [
  { href: "/rules", label: "Rules", testid: "info-link-rules" },
  { href: "/fair-play", label: "Fair Play Policy", testid: "info-link-fair-play" },
  { href: "/privacy", label: "Privacy Policy", testid: "info-link-privacy" },
  { href: "/terms", label: "Terms of Service", testid: "info-link-terms" },
  { href: "/support", label: "Support", testid: "info-link-support" },
];

/**
 * Small "Info" menu shown ONLY on the setup/start screen (Lobby). It links to
 * the public info pages and never appears during active matches, private-event
 * rooms, spectator views, or admin tools (those are rendered by other
 * pages). Purely navigational — no game state, sockets, or gameplay logic.
 * Fixed top-left so it never overlaps the ConnectionPill (top-right) or the
 * lobby's name input / create / join controls.
 */
export function InfoMenu() {
  return (
    <div className="fixed top-2 left-2 z-50 pl-[env(safe-area-inset-left)] pt-[env(safe-area-inset-top)]">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            data-testid="button-info-menu"
            className="h-8 gap-1.5 border-primary/30 bg-card/80 backdrop-blur-sm text-xs font-semibold text-foreground/90 hover:border-primary/60 hover:text-primary"
          >
            <span aria-hidden>☰</span> Info
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={6} className="w-56">
          <DropdownMenuLabel>Rules &amp; Info</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {LINKS.map((l) => (
            <DropdownMenuItem key={l.href} asChild>
              <Link href={l.href} data-testid={l.testid} className="cursor-pointer">
                {l.label}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
