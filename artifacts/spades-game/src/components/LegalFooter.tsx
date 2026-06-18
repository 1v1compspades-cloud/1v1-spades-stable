import { Link } from "wouter";

export const FREE_PLAY_DISCLAIMER =
  "Spades Free Play is provided solely for entertainment and is free to play. No payment features, paid entry, deposits, wagering, prizes, financial accounts, balances, redeemable rewards, or items of monetary value are included.";

const POLICY_LINKS = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/fair-play", label: "Fair Play Policy" },
] as const;

export function LegalPolicyLinks({
  className = "",
}: {
  className?: string;
}) {
  return (
    <>
      {POLICY_LINKS.map((item, index) => (
        <span key={item.href} className={className}>
          {index > 0 && <span className="text-muted-foreground">, </span>}
          {index === POLICY_LINKS.length - 1 && (
            <span className="text-muted-foreground">and </span>
          )}
          <Link href={item.href} className="text-primary hover:underline">
            {item.label}
          </Link>
        </span>
      ))}
    </>
  );
}

export function MatchAgreementNotice() {
  return (
    <p className="text-xs leading-relaxed text-muted-foreground text-center">
      By creating or joining a match, you agree to our{" "}
      <LegalPolicyLinks />.
    </p>
  );
}

export function LegalFooter() {
  return (
    <footer className="space-y-3 text-xs leading-relaxed text-muted-foreground">
      <p>{FREE_PLAY_DISCLAIMER}</p>
      <nav
        aria-label="Legal and support links"
        className="flex flex-wrap justify-center gap-x-4 gap-y-1"
      >
        <Link href="/terms" className="hover:text-primary hover:underline">
          Terms of Service
        </Link>
        <Link href="/privacy" className="hover:text-primary hover:underline">
          Privacy Policy
        </Link>
        <Link href="/fair-play" className="hover:text-primary hover:underline">
          Fair Play Policy
        </Link>
        <Link href="/support" className="hover:text-primary hover:underline">
          Support
        </Link>
      </nav>
    </footer>
  );
}
