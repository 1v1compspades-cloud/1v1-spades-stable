import { Seo } from "@/components/Seo";
import { InfoPageLayout } from "@/components/InfoPageLayout";

const RISK_ROWS: { context: string; range: string }[] = [
  { context: "Open public casual lobbies", range: "10%–25%" },
  { context: "Private invite lobbies", range: "3%–8%" },
  { context: "Host-managed events", range: "2%–5%" },
  { context: "Persistent names + logs + replay review", range: "1%–3%" },
];

export default function FairPlay() {
  return (
    <>
      <Seo
        title="Fair Play Policy | Spades Free Play"
        description="Learn how Spades Free Play uses private lobbies, hidden spectator hands, server rules, and fair-play policies to reduce cheating risk."
        path="/fair-play"
      />
      <InfoPageLayout
        title="Fair Play Policy"
        intro="Fair play is the foundation of Spades Free Play. We combine private rooms, server-enforced rules, and clear session controls to make cheating hard to attempt and easier to detect."
      >
        <section>
          <h2>How we protect competitive integrity</h2>
          <p>
            No single feature stops cheating on its own. Instead, we layer
            several measures so that a player would have to defeat all of them at
            once to gain an unfair edge:
          </p>
          <ul>
            <li>
              <strong>Private, invite-only rooms:</strong> matches run in
              closed lobbies with a known opponent rather than anonymous public
              rooms.
            </li>
            <li>
              <strong>Hidden spectator hands:</strong> spectators and stream
              viewers can follow the action but never see either player's cards,
              removing a common channel for relayed information.
            </li>
            <li>
              <strong>Locked admin tools:</strong> match-control and host tools
              are gated behind secret-key authorization, so only the verified
              host can use them.
            </li>
            <li>
              <strong>One-player, one-seat, one-tab policy:</strong> a player is
              expected to occupy a single seat from a single session,
              discouraging multi-seat or multi-window manipulation.
            </li>
            <li>
              <strong>Old-tab protection:</strong> stale or duplicate game tabs
              are detected so a player can't drive a match from multiple places
              at once.
            </li>
            <li>
              <strong>Opponent-offline indicators:</strong> players and hosts can
              see when an opponent disconnects, so stalling and connection abuse
              are visible rather than hidden.
            </li>
            <li>
              <strong>In-app browser warnings:</strong> players opening the game
              inside restricted in-app browsers are warned, reducing broken
              sessions and reconnection exploits.
            </li>
            <li>
              <strong>Manual host oversight:</strong> a human host actively
              monitors events and can pause, remake, or rule on matches when
              something looks wrong.
            </li>
            <li>
              <strong>Result tracking:</strong> match outcomes are recorded so
              patterns and disputes can be reviewed after the fact.
            </li>
          </ul>
        </section>

        <section>
          <h2>Server-enforced rules</h2>
          <p>
            All game logic — bidding, following suit, spades breaking, scoring,
            and bracket advancement — is enforced on the server. Illegal moves
            are simply rejected, so a match cannot be won by an undetected rule
            violation.
          </p>
        </section>

        <section>
          <h2>Estimated risk by context</h2>
          <p>
            The table below shows our internal, estimated likelihood that a given
            match environment could be affected by some form of cheating. Tighter
            controls meaningfully lower the risk.
          </p>
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Estimated likelihood of cheating by match environment
              </caption>
              <thead>
                <tr className="border-b border-border/60 bg-card/60">
                  <th
                    scope="col"
                    className="px-4 py-3 font-semibold text-foreground"
                  >
                    Environment
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 font-semibold text-foreground"
                  >
                    Estimated risk
                  </th>
                </tr>
              </thead>
              <tbody>
                {RISK_ROWS.map((row) => (
                  <tr
                    key={row.context}
                    className="border-b border-border/40 last:border-0"
                  >
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.context}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {row.range}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm italic">
            These are internal estimated risk ranges, not audited third-party
            statistics. No online card game can guarantee zero cheating. Our goal
            is to make cheating hard to attempt, easy to detect, and costly to
            risk.
          </p>
        </section>

        <section>
          <h2>Where we're headed</h2>
          <p>
            Integrity improves over time. Planned additions such as player
            identity controls, detailed game logs, and replay review are
            designed to push risk lower still and make post-match investigation
            faster and more thorough.
          </p>
        </section>
      </InfoPageLayout>
    </>
  );
}
