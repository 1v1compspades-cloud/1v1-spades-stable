import { Seo } from "@/components/Seo";
import { InfoPageLayout } from "@/components/InfoPageLayout";

export default function KingOfTheTable() {
  return (
    <>
      <Seo
        title="King of the Table — Winner-Stays Spades | 1v1 Competitive Spades"
        description="King of the Table is a winner-stays 1v1 Spades mode. The winner keeps their seat as King, the loser steps out, and the next challenger in the queue rotates in to play."
        path="/king-of-the-table"
      />
      <InfoPageLayout
        title="King of the Table"
        intro="King of the Table is a winner-stays game mode. Hold the table by winning, build a streak, and make every challenger come through you. Lose, and the next player in line steps up to take the crown."
      >
        <section>
          <h2>How it works</h2>
          <ul>
            <li>
              <strong>Winner stays:</strong> when a match ends, the winner keeps
              their seat as the reigning King.
            </li>
            <li>
              <strong>Loser steps out:</strong> the losing player leaves the
              seat and can rejoin the queue to challenge again.
            </li>
            <li>
              <strong>Challengers rotate in:</strong> the next player in the
              challenger queue automatically takes the open seat and a new match
              begins.
            </li>
            <li>
              <strong>Streaks:</strong> each consecutive win grows the King's
              streak — see how long you can hold the table.
            </li>
          </ul>
        </section>

        <section>
          <h2>Joining a table</h2>
          <p>
            Anyone with the room code can join. If both seats are taken, you
            land in the challenger queue and spectate the live match while you
            wait. When the current match ends, the queue advances and you rotate
            in to face the King.
          </p>
        </section>

        <section>
          <h2>Spectating</h2>
          <p>
            Watchers can follow the action live — scores, bids, tricks, and card
            counts — without ever seeing either player's hidden hand. It's an
            easy way to railbird a hot streak or wait your turn in the queue.
          </p>
        </section>

        <section>
          <h2>Other ways to play</h2>
          <p>
            Want a structured bracket instead? Run a tournament. Just learning?
            Start with the rules, then jump into a quick match.
          </p>
        </section>
      </InfoPageLayout>
    </>
  );
}
