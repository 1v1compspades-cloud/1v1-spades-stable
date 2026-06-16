import { Seo } from "@/components/Seo";
import { InfoPageLayout } from "@/components/InfoPageLayout";

export default function Support() {
  return (
    <>
      <Seo
        title="Support & Help | Spades Free Play"
        description="Get help with the Spades Free Play app. Contact support by email for questions, bug reports, and feedback."
        path="/support"
      />
      <InfoPageLayout
        title="Support &amp; Help"
        intro="Need a hand with Spades Free Play? Here's how to reach us and get answers fast."
      >
        <section>
          <h2>Contact us</h2>
          <p>
            We're happy to help with questions, bug reports, and feedback.
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
          </ul>
        </section>

        <section>
          <h2>About the app</h2>
          <p>
            Spades Free Play is a free, for-entertainment card game. It has no
            payment features, paid entry, financial accounts, or redeemable
            rewards. If you ever have a concern about how the game works, reach
            out and we'll explain.
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
              <strong>Does the app include payment features?</strong> No. The app
              is free play only.
            </li>
            <li>
              <strong>How do I report a bug or a player?</strong> Email us with
              details, including a screenshot if you have one.
            </li>
          </ul>
        </section>

        <section>
          <h2>Response times</h2>
          <p>
            We aim to respond to support requests as quickly as we can.
          </p>
        </section>
      </InfoPageLayout>
    </>
  );
}
