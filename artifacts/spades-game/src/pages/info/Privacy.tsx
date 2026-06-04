import { Seo } from "@/components/Seo";
import { InfoPageLayout } from "@/components/InfoPageLayout";

const EFFECTIVE_DATE = "June 4, 2026";

export default function Privacy() {
  return (
    <>
      <Seo
        title="Privacy Policy | Spades Free Play"
        description="Privacy Policy for the Spades Free Play app. A free-play card game with no accounts required, no real-money play, and no sale of personal data."
        path="/privacy"
      />
      <InfoPageLayout
        title="Privacy Policy"
        intro={`This Privacy Policy explains how the Spades Free Play app handles information. Effective ${EFFECTIVE_DATE}.`}
      >
        <section>
          <h2>Free play only</h2>
          <p>
            Spades Free Play is a free, for-entertainment card game. There are no
            cash games, deposits, paid entries, wallets, withdrawals, real-money
            gambling, or in-app prizes. We do not collect or process any payment
            or financial account information through the app.
          </p>
        </section>

        <section>
          <h2>Information we collect</h2>
          <ul>
            <li>
              <strong>Display name:</strong> the nickname you choose is used to
              identify you to your opponent during a match. It is stored on your
              device and sent to the game server only to run live games.
            </li>
            <li>
              <strong>Game session data:</strong> temporary information such as a
              room code, your seat, and a reconnect token is kept on your device
              so you can rejoin a match after a brief disconnect. This data is
              ephemeral and is not used to build a profile.
            </li>
            <li>
              <strong>Gameplay actions:</strong> bids and card plays are sent to
              the game server in real time so the match can be played. Game state
              is held in server memory for the duration of a match and is not
              tied to a personal account.
            </li>
          </ul>
          <p>
            The app does not require you to create an account, and it does not
            ask for your email address, phone number, contacts, photos, or
            precise location.
          </p>
        </section>

        <section>
          <h2>How we use information</h2>
          <p>
            We use the limited information above only to operate live matches,
            let you reconnect to a game in progress, and keep the service
            running. We do not sell your personal information, and we do not use
            it for advertising profiles.
          </p>
        </section>

        <section>
          <h2>Sharing</h2>
          <p>
            Your chosen display name is visible to the opponent you are playing
            against, which is necessary to play a head-to-head game. We do not
            sell or rent personal information to third parties. We may disclose
            information if required by law or to protect the safety and integrity
            of the service.
          </p>
        </section>

        <section>
          <h2>Data retention</h2>
          <p>
            Live game state is temporary and is cleared from the server when a
            match ends or the server restarts. Information stored locally on your
            device (such as your display name) remains until you clear the app's
            data or uninstall the app.
          </p>
        </section>

        <section>
          <h2>Children's privacy</h2>
          <p>
            The app is suitable for general audiences and does not knowingly
            collect personal information from children. Because no account is
            required and no real-money features exist, the app does not request
            personal details from any user.
          </p>
        </section>

        <section>
          <h2>Security</h2>
          <p>
            We take reasonable measures to protect the limited information the app
            handles. No method of transmission or storage is completely secure,
            but because we collect minimal data and no payment information, the
            privacy footprint of the app is intentionally small.
          </p>
        </section>

        <section>
          <h2>Changes to this policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Material changes
            will be reflected by updating the effective date at the top of this
            page.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            Questions about this policy? Reach us through our community on{" "}
            <a
              href="https://discord.gg/bT2G3uNX5"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-privacy-discord"
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
