import { Seo } from "@/components/Seo";
import { InfoPageLayout } from "@/components/InfoPageLayout";

export default function Discord() {
  return (
    <>
      <Seo
        title="Join the 1V1 Competitive Spades Community on Discord"
        description="Join the 1V1 Competitive Spades Discord for tournament announcements, check-ins, rules, match results, champions, King of the Table action, clips, and to find opponents for live head-to-head matches."
        path="/discord"
      />
      <InfoPageLayout
        title="Join the Community on Discord"
        intro="The 1V1 Competitive Spades community lives on Discord. It's where events are announced, players check in, results are posted, and champions are celebrated."
      >
        <section>
          <h2>What happens in the community</h2>
          <ul>
            <li>
              <strong>Tournament announcements:</strong> dates, formats, and
              invite links for upcoming Monday and Friday events.
            </li>
            <li>
              <strong>Check-ins:</strong> confirm your spot before brackets lock.
            </li>
            <li>
              <strong>Rules &amp; questions:</strong> learn the game and get
              answers from other players.
            </li>
            <li>
              <strong>Match results &amp; champions:</strong> follow standings
              and see who took the crown.
            </li>
            <li>
              <strong>King of the Table:</strong> coordinate winner-stays
              sessions and challenge the current King.
            </li>
            <li>
              <strong>Clips:</strong> share highlights, big nil runs, and
              clutch comebacks.
            </li>
          </ul>
        </section>

        <section>
          <h2>Find opponents anytime</h2>
          <p>
            Because every game is head-to-head, the community is the easiest way
            to line up matches. Call out a challenge, share a room code, and play
            live whenever you want.
          </p>
        </section>

        <section>
          <h2>New here?</h2>
          <p>
            Start by reading the rules, review our fair-play and anti-cheat
            approach, then create a room and challenge a friend — or join a King
            of the Table session and take your shot at the King.
          </p>
        </section>
      </InfoPageLayout>
    </>
  );
}
