import { Seo } from "@/components/Seo";
import { InfoPageLayout } from "@/components/InfoPageLayout";

export default function Account() {
  return (
    <>
      <Seo
        title="Account | 1v1 Spades"
        description="Account features are planned for v1.1 and are not enabled yet."
        path="/account"
      />
      <InfoPageLayout
        title="Account"
        intro="Account features are planned for v1.1 and are not enabled yet."
      >
        <section>
          <h2>Guest play remains available</h2>
          <p>
            You can keep playing as a guest. Account creation, username claims,
            and account deletion are still being reviewed before they are
            enabled.
          </p>
        </section>

        <section>
          <h2>Privacy and deletion</h2>
          <p>
            Before accounts are enabled, an in-app account deletion path and
            associated data deletion policy must be ready. For questions, email{" "}
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
