import { Seo } from "@/components/Seo";
import { InfoPageLayout } from "@/components/InfoPageLayout";

export default function Discord() {
  return (
    <>
      <Seo
        title="Community & Discord — Find Spades Opponents | 1v1 Competitive Spades"
        description="Join the 1v1 Competitive Spades community to find opponents, organize tournaments, and challenge other players to live head-to-head Spades matches online."
        path="/discord"
      />
      <InfoPageLayout
        title="Community & Discord"
        intro="1v1 Competitive Spades is best with a steady stream of opponents. The community is where players meet up, line up matches, and organize tournaments."
      >
        <section>
          <h2>Find opponents and organize games</h2>
          <p>
            Because every game is head-to-head, the fun comes from finding good
            competition. The community is the place to call out challenges,
            share room codes, schedule King of the Table sessions, and recruit
            players to fill a tournament bracket.
          </p>
        </section>

        <section>
          <h2>What you can do</h2>
          <ul>
            <li>Match up with other players for live 1v1 games.</li>
            <li>Organize and announce single-elimination tournaments.</li>
            <li>Share room codes and challenger links.</li>
            <li>Talk strategy — bidding, nil runs, and managing bags.</li>
          </ul>
        </section>

        <section>
          <h2>New here?</h2>
          <p>
            Start by reading the rules, then create a room and share the code
            with a friend, or jump into King of the Table and queue up against
            whoever is holding the seat.
          </p>
        </section>
      </InfoPageLayout>
    </>
  );
}
