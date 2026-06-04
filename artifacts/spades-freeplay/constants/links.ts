/**
 * External destinations used across the app.
 *
 * These point to the existing public web community + website. The in-app
 * experience is free play only; competitive tournaments are hosted on the
 * website, opened in the device browser — never inside this app.
 */
export const LINKS = {
  website: "https://1v1spades.com",
  websiteTournaments: "https://1v1spades.com",
  discord: "https://discord.gg/bT2G3uNX5",

  // Legal / support placeholders required for App Store submission.
  // Confirm these resolve to live pages before shipping to TestFlight/App Store.
  privacy: "https://1v1spades.com/privacy",
  terms: "https://1v1spades.com/terms",
  support: "https://1v1spades.com/support",
} as const;
