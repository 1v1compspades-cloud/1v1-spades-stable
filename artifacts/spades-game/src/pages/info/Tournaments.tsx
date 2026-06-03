import { Seo } from "@/components/Seo";
import { InfoPageLayout } from "@/components/InfoPageLayout";

export default function Tournaments() {
  return (
    <>
      <Seo
        title="Free-Entry Private 1V1 Spades Tournaments — Brackets & Prize Pools"
        description="Free-entry, invite-only online 1V1 Spades tournaments: private lobbies, player check-ins, single-elimination brackets, sponsor-funded prize pools, a champion screen, and weekly Monday and Friday events."
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
          <h2>Sponsor-funded prize pools</h2>
          <p>
            Select events feature prize pools funded by sponsors. Entry stays
            free for players — sponsors back the rewards — keeping the focus on
            competition and community rather than buy-ins.
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
