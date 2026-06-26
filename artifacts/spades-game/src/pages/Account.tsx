import { Seo } from "@/components/Seo";
import { InfoPageLayout } from "@/components/InfoPageLayout";

export default function Account() {
  return (
    <>
      <Seo
        title="Account | 1v1 Spades"
        description="Manage ranked profile recovery and deletion for 1v1 Spades."
        path="/account"
      />
      <InfoPageLayout
        title="Account"
        intro="Ranked profiles can be managed from the account panel on the home screen."
      >
        <section>
          <h2>Guest play remains available</h2>
          <p>
            You can keep playing casual matches as a guest. Ranked matches use
            a ranked profile and username so your season record and leaderboard
            placement stay attached to you.
          </p>
        </section>

        <section>
          <h2>Privacy and deletion</h2>
          <p>
            Open the home screen account panel to attach a recovery email,
            recover an existing ranked profile, or delete your ranked account
            from inside the app. For questions, email{" "}
            <a href="mailto:support@1v1spades.com" className="text-primary hover:underline">
              support@1v1spades.com
            </a>
            .
          </p>
        </section>
      </InfoPageLayout>
    </>
  );
}
