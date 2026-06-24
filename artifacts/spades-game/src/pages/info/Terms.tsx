import { Seo } from "@/components/Seo";
import { InfoPageLayout } from "@/components/InfoPageLayout";

const EFFECTIVE_DATE = "June 4, 2026";

export default function Terms() {
  return (
    <>
      <Seo
        title="Terms of Service | 1v1 Spades"
        description="Terms of Service for the 1v1 Spades app. A for-entertainment card game with no payment features or redeemable rewards."
        path="/terms"
      />
      <InfoPageLayout
        title="Terms of Service"
        intro={`Please read these Terms of Service before using the 1v1 Spades app. Effective ${EFFECTIVE_DATE}.`}
      >
        <section>
          <h2>Acceptance of these terms</h2>
          <p>
            By downloading or using 1v1 Spades (the "app"), you agree to
            these Terms of Service. If you do not agree, please do not use the
            app.
          </p>
        </section>

        <section>
          <h2>Casual play only</h2>
          <p>
            The app is provided solely for entertainment.
          </p>
          <ul>
            <li>No payment features or paid entry.</li>
            <li>No financial accounts or balances.</li>
            <li>No redeemable rewards or items of monetary value.</li>
          </ul>
          <p>
            Any in-game scores or standings are for fun only and cannot be
            redeemed for anything of value.
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
            We may update these Terms of Service from time to time. Continued
            use of the app after changes take effect constitutes acceptance of
            the updated terms. The effective date at the top of this page
            reflects the latest version.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            Questions about these terms? Reach us by email at{" "}
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
