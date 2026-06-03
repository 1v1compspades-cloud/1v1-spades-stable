import { Seo } from "@/components/Seo";
import { InfoPageLayout } from "@/components/InfoPageLayout";

export default function Rules() {
  return (
    <>
      <Seo
        title="How to Play 1v1 Spades — Rules & Scoring | 1v1 Competitive Spades"
        description="Complete rules for 1v1 head-to-head Spades: hidden hands, bidding, following suit, the spades-broken rule, nil bids, bag penalties, set penalties, and how to win."
        path="/rules"
      />
      <InfoPageLayout
        title="How to Play 1v1 Spades"
        intro="1v1 Competitive Spades is head-to-head Spades with no partner. Two players, hidden hands, and a full bidding-and-tricks match decided entirely by your own play. Here are the complete rules exactly as the game enforces them."
      >
        <section>
          <h2>The deal</h2>
          <p>
            Each round, both players are dealt a hidden hand of cards. You only
            ever see your own cards — your opponent's hand stays secret until
            each card is legally played, just like over-the-board Spades.
          </p>
        </section>

        <section>
          <h2>Bidding</h2>
          <p>
            Before any cards are played, each player bids the number of tricks
            they expect to win that round. A coin toss decides the bidding order
            in Round 1 — the toss winner bids second, gaining the advantage of
            reacting to their opponent's bid. After Round 1, the bidding order
            alternates every round.
          </p>
          <ul>
            <li>Bid the number of tricks you think you can take.</li>
            <li>
              <strong>Nil bid:</strong> bid zero and try to win no tricks at
              all. In this 1v1 competitive house rule, a successful nil is worth
              +125 points and a failed nil costs −125.
            </li>
          </ul>
        </section>

        <section>
          <h2>Playing tricks</h2>
          <ul>
            <li>You must follow the suit that was led if you can.</li>
            <li>
              Spades are trump. You cannot lead a spade until spades are
              "broken" — that is, until a spade has been played because a player
              could not follow suit.
            </li>
            <li>
              The highest spade wins the trick; if no spades are played, the
              highest card of the led suit wins. The winner leads the next
              trick.
            </li>
          </ul>
        </section>

        <section>
          <h2>Scoring</h2>
          <ul>
            <li>
              <strong>Making your bid:</strong> you score 10 points for each
              trick you bid.
            </li>
            <li>
              <strong>Overtricks (bags):</strong> tricks won beyond your bid
              each score 1 point but also count as a "bag," which can trigger a
              penalty later.
            </li>
            <li>
              <strong>Getting set:</strong> if you fail to make your bid, you
              lose 10 points for every trick you bid.
            </li>
          </ul>
        </section>

        <section>
          <h2>Bag penalties</h2>
          <p>
            Accumulated bags are penalized on a tier based on your score at the
            start of the round:
          </p>
          <ul>
            <li>
              Score under 250: every 5 bags costs you 50 points.
            </li>
            <li>
              Score 250 or higher: every 10 bags costs you 100 points.
            </li>
          </ul>
          <p>
            The tier is locked in at the start of each round, so bidding
            tightly to avoid stacking bags is a real part of the strategy.
          </p>
        </section>

        <section>
          <h2>Winning the match</h2>
          <p>
            The match target is 250 or 500 points, chosen when the room is
            created. The first player to reach the target while leading wins. If
            both players are tied at the target, a three-round tiebreaker block
            decides the winner; a persistent tie starts a fresh tiebreaker
            block until someone pulls ahead.
          </p>
        </section>
      </InfoPageLayout>
    </>
  );
}
