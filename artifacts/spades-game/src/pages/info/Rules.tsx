import { Seo } from "@/components/Seo";
import { InfoPageLayout } from "@/components/InfoPageLayout";

export default function Rules() {
  return (
    <>
      <Seo
        title="Spades Free Play Rules"
        description="Learn the rules of Spades Free Play, including bidding, nil, bags, spades breaking, scoring, and head-to-head match flow."
        path="/rules"
      />
      <InfoPageLayout
        title="How to Play Spades Free Play"
        intro="Spades Free Play is head-to-head Spades with no partner. Just two players, hidden hands, and a full bidding-and-tricks match. Here is how a match plays out."
      >
        <section>
          <h2>Head-to-head, no partner</h2>
          <p>
            Unlike traditional 4-player Spades, this is a pure 1-versus-1 duel.
            There are no teammates to cover for you. Every bid, every book, and
            every bag is yours alone. You only ever see your own cards; your
            opponent's hand stays hidden until each card is played.
          </p>
        </section>

        <section>
          <h2>Bidding (0–13)</h2>
          <p>
            Before any cards are played, each player bids how many books
            (tricks) they expect to win that round, anywhere from 0 to 13.
          </p>
          <ul>
            <li>Bid the number of books you believe you can take.</li>
            <li>
              <strong>Nil is allowed:</strong> bid zero and try to win no books
              at all. A made nil is worth <strong>+100</strong>; a failed nil is{" "}
              <strong>−100</strong> plus one point back for every book you were
              forced to take (so nil with one book is −99). Those books still
              count as bags.
            </li>
          </ul>
        </section>

        <section>
          <h2>Books and bags</h2>
          <ul>
            <li>
              <strong>Books:</strong> each trick you win is a book. Make your bid
              and you score for the books you committed to.
            </li>
            <li>
              <strong>Bags:</strong> books won beyond your bid are "bags." Each
              bag is worth a little now, but bags accumulate and trigger a
              penalty once they pile up.
            </li>
          </ul>
        </section>

        <section>
          <h2>Bag penalties</h2>
          <p>
            Overbidding to grab extra books is risky. Bags pile up across rounds
            and cost you points once they cross a threshold, which depends on the
            race mode you are playing:
          </p>
          <ul>
            <li>
              <strong>Race to 250:</strong> every 5 bags = <strong>−50</strong>{" "}
              points, and your bag count rolls over (5 bags → −50 and 0 left, 6
              bags → −50 and 1 left).
            </li>
            <li>
              <strong>Race to 500:</strong> every 10 bags = <strong>−100</strong>{" "}
              points, and your bag count rolls over (10 bags → −100 and 0 left,
              11 bags → −100 and 1 left).
            </li>
          </ul>
          <p>
            Consistently bidding accurate counts — rather than sandbagging —
            keeps your score climbing. Bidding too low just to be safe will
            quietly bleed points over a long match.
          </p>
        </section>

        <section>
          <h2>Spades breaking</h2>
          <p>
            Spades are trump. You cannot lead a spade until spades have been
            "broken" — that is, until a spade has been played because a player
            could not follow the suit that was led. Once broken, spades may be
            led freely. The highest spade wins a trick; if no spades are played,
            the highest card of the led suit wins, and that player leads next.
          </p>
        </section>

        <section>
          <h2>Following suit and the renege rule</h2>
          <p>
            You must follow the suit that was led if you have a card in that
            suit. Failing to follow suit when you are able to — known as a
            renege — is against the rules. Because the game is server-enforced,
            illegal plays are simply not allowed, so a match can never be decided
            by an undetected renege.
          </p>
        </section>

        <section>
          <h2>Winning: race to 250, finals to 500</h2>
          <p>
            A standard match is a race to 250 points. Tournament finals and
            longer-format games may extend the race to 500. The first player to
            reach the target while leading wins the match. If both players hit
            the target tied, a short tiebreaker decides it, so every match ends
            with a clear winner.
          </p>
        </section>
      </InfoPageLayout>
    </>
  );
}
