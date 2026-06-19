export type V11AccountPrivacyRequirement = {
  id: string;
  requirement: string;
  rationale: string;
  status: "planned" | "blocked";
};

export const v11AccountPrivacyRequirements = [
  {
    id: "guest-play-default",
    requirement:
      "Guest play must remain available and remain the default until accounts are explicitly enabled.",
    rationale:
      "v1.0 is in App Review as free play with no account requirement; v1.1 account work must not gate existing gameplay.",
    status: "planned",
  },
  {
    id: "in-app-account-deletion",
    requirement:
      "If v1.1 enables account creation, users must be able to start full account deletion from inside the app.",
    rationale:
      "Apple requires apps that support account creation to also support account deletion from within the app.",
    status: "planned",
  },
  {
    id: "delete-associated-personal-data",
    requirement:
      "Account deletion must delete or anonymize associated personal data, including profile identity and claimed username records.",
    rationale:
      "Deleting only a session, token, or local app data is not enough once server-side accounts exist.",
    status: "planned",
  },
  {
    id: "support-email-visible",
    requirement:
      "Support email and legal/support pages must remain visible before account features are enabled.",
    rationale:
      "Players and reviewers need a non-social support path for privacy, deletion, and account questions.",
    status: "planned",
  },
  {
    id: "historical-guest-results-unclaimed",
    requirement:
      "Historical match_results names must remain guest aliases unless a reviewed claim/merge policy is approved.",
    rationale:
      "Display names from pre-account play should not automatically become authenticated identities.",
    status: "blocked",
  },
] as const satisfies readonly V11AccountPrivacyRequirement[];

export function getV11AccountPrivacyBlockers(): V11AccountPrivacyRequirement[] {
  return v11AccountPrivacyRequirements.filter((item) => item.status === "blocked");
}
