import { Seo } from "@/components/Seo";
import { InfoPageLayout } from "@/components/InfoPageLayout";

export default function Tournaments() {
  return (
    <>
      <Seo
        title="Online Spades Tournaments | 1V1 Competitive Spades"
        description="Join free-entry private online 1V1 Spades tournaments with champion brackets, live matches, and weekly competitive events."
        path="/tournaments"
      />
      <InfoPageLayout
        title="1V1 Competitive Spades Tournaments"
        intro="Compete in free-entry, private online tournaments built for real competition. Invite-only lobbies, organized check-ins, single-elimination brackets, and a champion screen to crown the winner."
      >
        <section>
          <h2>Free entry, invite-only lobbies</h2>
          <p>
            Tournaments are free to enter and run in private, invite-only
            lobbies. Players join with an invite link or code from the host, so
            every event is a known, controlled field rather than an open public
            free-for-all.
          </p>
        </section>

        <section>
          <h2>Check-ins and brackets</h2>
          <ul>
            <li>
              <strong>Check-ins:</strong> players confirm they're present and
              ready before the bracket locks, so matches start with active
              participants.
            </li>
            <li>
              <strong>Single-elimination brackets:</strong> win and advance, lose
              and you're out. Bracket sizes scale to the field, and winners move
              forward automatically.
            </li>
            <li>
              <strong>Champion screen:</strong> the final match ends on a
              dedicated champion screen that crowns the tournament winner.
            </li>
          </ul>
        </section>

        <section>
          <h2>Recognition-only events</h2>
          <p>
            Events are free to enter and are played for competition, standings,
            and community recognition only. There are no buy-ins, deposits,
            wagering, cash payouts, or redeemable rewards.
          </p>
        </section>

        <section>
          <h2>Weekly schedule</h2>
          <p>
            Tournaments run on a regular weekly cadence, with events on
            <strong> Mondays and Fridays</strong>. Watch the community for
            announcements, check-in times, and bracket links for each event.
          </p>
        </section>

        <section>
          <h2>Other ways to play</h2>
          <p>
            Prefer a casual game? Try King of the Table, where the winner keeps
            their seat and challengers line up to take them down. New to the
            game? Read the full rules first, and review our fair-play and
            anti-cheat approach.
          </p>
        </section>
      </InfoPageLayout>
    </>
  );
}
