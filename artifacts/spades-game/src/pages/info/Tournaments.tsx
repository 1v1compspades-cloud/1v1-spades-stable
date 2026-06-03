import { Seo } from "@/components/Seo";
import { InfoPageLayout } from "@/components/InfoPageLayout";

export default function Tournaments() {
  return (
    <>
      <Seo
        title="1v1 Spades Tournaments — Single-Elimination Brackets | 1v1 Competitive Spades"
        description="Run online 1v1 Spades tournaments: single-elimination brackets of 4, 8, 16, or 32 players with random seeding. Every match is a standard head-to-head game."
        path="/tournaments"
      />
      <InfoPageLayout
        title="1v1 Spades Tournaments"
        intro="Host a bracket and crown a champion. Tournament mode runs a single-elimination bracket where every match is a standard head-to-head 1v1 Spades game — perfect for friends, communities, and streamed events."
      >
        <section>
          <h2>How tournaments work</h2>
          <ul>
            <li>
              <strong>Bracket sizes:</strong> 4, 8, 16, or 32 players, single
              elimination.
            </li>
            <li>
              <strong>Random seeding:</strong> the bracket is seeded randomly
              when the host starts the event.
            </li>
            <li>
              <strong>Standard matches:</strong> every round is a normal 1v1
              game to the chosen point target — same rules, same scoring.
            </li>
            <li>
              <strong>Auto-advancing bracket:</strong> winners move forward
              automatically, and the next round's matches are created as soon as
              both feeder matches finish.
            </li>
          </ul>
        </section>

        <section>
          <h2>Joining a tournament</h2>
          <p>
            The host creates a tournament and shares an invite link or code.
            Players open the link, enter a name, and claim a spot in the lobby.
            When the bracket is full, the host starts the event and each player
            is dropped straight into their first match.
          </p>
        </section>

        <section>
          <h2>Built for real events</h2>
          <p>
            Tournaments are designed to survive the chaos of live play. Players
            who refresh or briefly lose connection are routed back into their
            current match, and hosts have recovery tools to handle disconnects,
            swap in backups before the event starts, and keep the bracket
            moving.
          </p>
        </section>

        <section>
          <h2>Other ways to play</h2>
          <p>
            Prefer a casual game? Start a quick head-to-head match, or try{" "}
            King of the Table, where the winner keeps their seat and challengers
            line up to take them down. New to the game? Read the full{" "}
            rules first.
          </p>
        </section>
      </InfoPageLayout>
    </>
  );
}
