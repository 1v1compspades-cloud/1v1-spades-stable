import { Seo } from "@/components/Seo";
import { InfoPageLayout } from "@/components/InfoPageLayout";

export default function Discord() {
  return (
    <>
      <Seo
        title="Join the 1V1 Spades Discord | Competitive Spades Community"
        description="Join the 1V1 Competitive Spades Discord for tournaments, check-ins, King of the Table, match results, clips, champions, and community updates."
        path="/discord"
      />
      <InfoPageLayout
        title="Join the Community on Discord"
        intro="The 1V1 Competitive Spades community lives on Discord. It's where events are announced, players check in, results are posted, and champions are celebrated."
      >
        <section>
          <a
            href="https://discord.gg/bT2G3uNX5"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-join-discord"
            className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-base font-bold text-primary-foreground hover:bg-primary/90 transition-colors no-underline"
          >
            Join the Discord
          </a>
        </section>

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
