import { Seo } from "@/components/Seo";
import { InfoPageLayout } from "@/components/InfoPageLayout";

export default function KingOfTheTable() {
  return (
    <>
      <Seo
        title="King of the Table — Winner-Stays 1V1 Spades"
        description="King of the Table is a winner-stays 1V1 Spades mode: the winner holds the seat as King, a new challenger joins, crowns and streaks track the run, and matches stay fast and live-stream friendly."
        path="/king-of-the-table"
      />
      <InfoPageLayout
        title="King of the Table"
        intro="King of the Table is a winner-stays game mode built for momentum. Hold the seat by winning, stack a streak, and make every challenger come through you. It's fast, competitive, and made for live streams."
      >
        <section>
          <h2>Winner stays, challenger joins</h2>
          <ul>
            <li>
              <strong>Winner stays:</strong> the player who wins keeps their seat
              as the reigning King.
            </li>
            <li>
              <strong>Challenger joins:</strong> a new challenger steps into the
              open seat and a fresh match begins immediately.
            </li>
            <li>
              <strong>Challenge the current king:</strong> anyone watching can
              queue up and take their shot at dethroning the King.
            </li>
          </ul>
        </section>

        <section>
          <h2>Crowns and streaks</h2>
          <p>
            Every consecutive win grows the King's crown and streak. The longer
            you hold the table, the bigger the run — and the bigger the target on
            your back. Streaks make for natural rivalries and highlight-reel
            comebacks.
          </p>
        </section>

        <section>
          <h2>Fast, competitive, stream-friendly</h2>
          <p>
            Matches rotate quickly with no downtime between games, so there's
            always live action. The continuous winner-stays format is ideal for
            streamers and viewers — easy to follow, full of momentum swings, and
            built around one simple question: who can beat the King?
          </p>
        </section>

        <section>
          <h2>Other ways to play</h2>
          <p>
            Want a structured bracket instead? Enter a tournament. Just learning?
            Start with the rules, then jump in and challenge the King.
          </p>
        </section>
      </InfoPageLayout>
    </>
  );
}
