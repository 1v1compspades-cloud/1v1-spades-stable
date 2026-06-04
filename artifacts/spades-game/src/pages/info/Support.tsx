import { Seo } from "@/components/Seo";
import { InfoPageLayout } from "@/components/InfoPageLayout";

export default function Support() {
  return (
    <>
      <Seo
        title="Support & Help | Spades Free Play"
        description="Get help with the Spades Free Play app. Contact support by email or join the community on Discord for questions, bug reports, and feedback."
        path="/support"
      />
      <InfoPageLayout
        title="Support &amp; Help"
        intro="Need a hand with Spades Free Play? Here's how to reach us and get answers fast."
      >
        <section>
          <h2>Contact us</h2>
          <p>
            We're happy to help with questions, bug reports, and feedback. The
            fastest ways to reach us are:
          </p>
          <ul>
            <li>
              <strong>Email:</strong>{" "}
              <a
                href="mailto:support@1v1spades.com"
                className="text-primary hover:underline"
              >
                support@1v1spades.com
              </a>{" "}
              — include your device model and a short description of the issue.
            </li>
            <li>
              <strong>Community:</strong> join our Discord (below) to ask
              questions and chat with other players.
            </li>
          </ul>
          <div className="mt-2">
            <a
              href="https://discord.gg/bT2G3uNX5"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-support-discord"
              className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-base font-bold text-primary-foreground hover:bg-primary/90 transition-colors no-underline"
            >
              Join the Discord Community
            </a>
          </div>
        </section>

        <section>
          <h2>About the app</h2>
          <p>
            Spades Free Play is a free, for-entertainment card game. It has no
            cash games, deposits, paid entries, wallets, withdrawals, real-money
            gambling, or in-app prizes. If you ever have a concern about how the
            game works, reach out and we'll explain.
          </p>
        </section>

        <section>
          <h2>Common questions</h2>
          <ul>
            <li>
              <strong>How do I play with a friend?</strong> Create a table and
              share the room code, or enter a code your friend sends you to join
              their table.
            </li>
            <li>
              <strong>I got disconnected — did I lose my game?</strong> Reopen the
              app to rejoin a match in progress. Game sessions are held briefly so
              you can reconnect after a short drop.
            </li>
            <li>
              <strong>Is this real-money gambling?</strong> No. The app is free
              play only and there is nothing to deposit, win, or withdraw.
            </li>
            <li>
              <strong>How do I report a bug or a player?</strong> Email us or
              post in the Discord with details, including a screenshot if you have
              one.
            </li>
          </ul>
        </section>

        <section>
          <h2>Response times</h2>
          <p>
            We aim to respond to support requests as quickly as we can. The
            Discord community is often the fastest place to get a reply from us or
            from other players.
          </p>
        </section>
      </InfoPageLayout>
    </>
  );
}
