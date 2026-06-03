// Lightweight, dependency-free browser-environment detection used purely for
// UX warnings (in-app webview banner, "open externally" helper, checklist).
// Nothing here affects gameplay, auth, or socket behaviour.

export type InAppBrowserInfo = {
  /** True when we believe the page is running inside an embedded app webview. */
  inApp: boolean;
  /** Friendly name of the host app when known (e.g. "Discord"), else null. */
  name: string | null;
  isIOS: boolean;
  isAndroid: boolean;
};

/**
 * Best-effort detection of an in-app browser (Discord / Facebook / Instagram /
 * TikTok / Snapchat / etc.) from the User-Agent string. These embedded webviews
 * frequently break clipboard, popups, storage persistence and OAuth, which is
 * exactly what bit a player who opened a room link from Discord.
 */
export function detectInAppBrowser(
  ua: string = typeof navigator !== "undefined" ? navigator.userAgent : "",
): InAppBrowserInfo {
  const u = ua || "";
  const isIOS = /iPhone|iPad|iPod/i.test(u);
  const isAndroid = /Android/i.test(u);

  let name: string | null = null;
  if (/Discord/i.test(u)) name = "Discord";
  else if (/FBAN|FBAV|FB_IAB|FBIOS|FBBV/i.test(u)) name = "Facebook";
  else if (/Instagram/i.test(u)) name = "Instagram";
  else if (/(BytedanceWebview|musical_ly|TikTok|Bytedance)/i.test(u)) name = "TikTok";
  else if (/Snapchat/i.test(u)) name = "Snapchat";
  else if (/Twitter|TwitterAndroid/i.test(u)) name = "X (Twitter)";
  else if (/\bLine\//i.test(u)) name = "LINE";
  else if (/WhatsApp/i.test(u)) name = "WhatsApp";
  else if (/Pinterest/i.test(u)) name = "Pinterest";

  return { inApp: name !== null, name, isIOS, isAndroid };
}
