import { Seo } from "@/components/Seo";
import { InfoPageLayout } from "@/components/InfoPageLayout";

const EFFECTIVE_DATE = "June 4, 2026";

export default function Terms() {
  return (
    <>
      <Seo
        title="Terms of Use | Spades Free Play"
        description="Terms of Use for the Spades Free Play app. A free, for-entertainment card game with no real-money gambling, deposits, or prizes."
        path="/terms"
      />
      <InfoPageLayout
        title="Terms of Use"
        intro={`Please read these Terms of Use before using the Spades Free Play app. Effective ${EFFECTIVE_DATE}.`}
      >
        <section>
          <h2>Acceptance of these terms</h2>
          <p>
            By downloading or using Spades Free Play (the "app"), you agree to
            these Terms of Use. If you do not agree, please do not use the app.
          </p>
        </section>

        <section>
          <h2>Free play only — no real-money gambling</h2>
          <p>
            The app is provided solely for entertainment. It is free to play and
            contains:
          </p>
          <ul>
            <li>No cash games and no real-money wagering of any kind.</li>
            <li>No deposits, paid entries, or buy-ins.</li>
            <li>No wallets, balances, or withdrawals.</li>
            <li>No prizes, payouts, or items of monetary value.</li>
          </ul>
          <p>
            Any in-game scores or standings are for fun only and have no monetary
            value and cannot be redeemed for anything of value.
          </p>
        </section>

        <section>
          <h2>Eligibility</h2>
          <p>
            You must be able to form a binding agreement to use the app, or use
            it under the supervision of a parent or guardian where required. The
            app is intended for a general audience.
          </p>
        </section>

        <section>
          <h2>Acceptable use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>
              Cheat, exploit bugs, or use automated tools to gain an unfair
              advantage in a match.
            </li>
            <li>
              Harass, abuse, or impersonate other players, or choose offensive
              display names.
            </li>
            <li>
              Interfere with, overload, or attempt to disrupt the game servers or
              other players' sessions.
            </li>
            <li>
              Reverse engineer or attempt to gain unauthorized access to the app
              or its systems.
            </li>
          </ul>
        </section>

        <section>
          <h2>Service availability</h2>
          <p>
            The app relies on live game servers, and matches are played in real
            time. Game sessions are temporary and may be interrupted by
            disconnects, maintenance, or server restarts. We do not guarantee
            uninterrupted availability and may modify or discontinue features at
            any time.
          </p>
        </section>

        <section>
          <h2>Intellectual property</h2>
          <p>
            The app, its design, and its content are owned by us or our licensors
            and are protected by applicable laws. You may not copy, distribute,
            or create derivative works from the app except as permitted by law.
          </p>
        </section>

        <section>
          <h2>Disclaimer and limitation of liability</h2>
          <p>
            The app is provided "as is" and "as available" without warranties of
            any kind, to the maximum extent permitted by law. To the fullest
            extent permitted by law, we are not liable for any indirect,
            incidental, or consequential damages arising from your use of the
            app.
          </p>
        </section>

        <section>
          <h2>Apple App Store terms</h2>
          <p>
            If you obtained the app from the Apple App Store, you acknowledge that
            these terms are between you and us, not Apple, and that Apple is not
            responsible for the app or its content. Apple is a third-party
            beneficiary of these terms and may enforce them against you. Your use
            of the app must also comply with the applicable App Store Terms of
            Service.
          </p>
        </section>

        <section>
          <h2>Changes to these terms</h2>
          <p>
            We may update these Terms of Use from time to time. Continued use of
            the app after changes take effect constitutes acceptance of the
            updated terms. The effective date at the top of this page reflects the
            latest version.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            Questions about these terms? Reach us through our community on{" "}
            <a
              href="https://discord.gg/bT2G3uNX5"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-terms-discord"
              className="text-primary hover:underline"
            >
              Discord
            </a>{" "}
            or by email at{" "}
            <a
              href="mailto:support@1v1spades.com"
              className="text-primary hover:underline"
            >
              support@1v1spades.com
            </a>
            .
          </p>
        </section>
      </InfoPageLayout>
    </>
  );
}
