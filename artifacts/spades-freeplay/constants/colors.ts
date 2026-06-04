/**
 * Semantic design tokens for the Spades Free Play app.
 *
 * Visual direction: a premium black & gold card-room. The app is dark-first,
 * so both the `light` and `dark` palettes intentionally resolve to the same
 * card-room theme — the look stays consistent regardless of the device's
 * appearance setting.
 *
 * Always consume these via the `useColors()` hook; never hardcode hex values
 * in components.
 */

const cardRoom = {
  // Legacy aliases (kept for backward compatibility)
  text: "#f6f1e7",
  tint: "#d4af37",

  // Core surfaces — deep matte black
  background: "#0b0b0d",
  foreground: "#f6f1e7",

  // Cards / elevated surfaces
  card: "#16161a",
  cardForeground: "#f6f1e7",

  // Primary action color — polished gold
  primary: "#d4af37",
  primaryForeground: "#0b0b0d",

  // Secondary / less-emphasis interactive surfaces
  secondary: "#1e1e24",
  secondaryForeground: "#f6f1e7",

  // Muted / subdued elements
  muted: "#1a1a1f",
  mutedForeground: "#9a9488",

  // Accent highlights
  accent: "#caa54a",
  accentForeground: "#0b0b0d",

  // Destructive actions
  destructive: "#c14953",
  destructiveForeground: "#ffffff",

  // Borders and input outlines
  border: "#2a2a30",
  input: "#23232a",

  // Brand extras (card-room specific)
  gold: "#d4af37",
  goldSoft: "#e8c25a",
  goldDim: "#8a7327",
  felt: "#0e3b2e",
  feltLight: "#13503d",

  // Playing-card face (a real card is always light) + ambient shadow
  cardFace: "#fbfaf5",
  shadow: "#000000",

  // Gold glow used behind the hero (strong center → transparent edge)
  glowStrong: "rgba(212,175,55,0.18)",
  glowFade: "rgba(212,175,55,0)",
};

const colors = {
  light: cardRoom,
  dark: cardRoom,

  // Border radius (px). Cards and buttons share this.
  radius: 16,
};

export default colors;
