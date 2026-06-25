import { useState } from "react";
import { detectInAppBrowser } from "@/lib/browserEnv";

const DISMISS_KEY = "spades_inapp_dismissed";

/**
 * Global warning shown when the app is opened inside an in-app browser
 * from a social or messaging app. These embedded webviews routinely break
 * clipboard, storage persistence and reconnection. The banner nudges players to
 * open the link in real Safari/Chrome and offers a copy-link helper.
 *
 * Purely advisory UX: no gameplay, auth, or socket behaviour is changed.
 */
export function InAppBrowserBanner() {
  const [env] = useState(() => detectInAppBrowser());
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [copied, setCopied] = useState(false);

  if (!env.inApp || dismissed) return null;

  const copyLink = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Webviews frequently block the async clipboard API — fall back to a
      // prompt the user can copy from manually.
      try {
        window.prompt("Copy this link, then open it in Safari or Chrome:", url);
      } catch {
        /* ignore */
      }
    }
  };

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const howTo = env.isIOS
    ? "Tap the ••• or the share icon in this window, then choose “Open in Safari/Chrome.”"
    : env.isAndroid
      ? "Tap the ⋮ menu in this window, then choose “Open in browser / Chrome.”"
      : "Open this link in Safari or Chrome.";

  return (
    <div
      role="alert"
      data-testid="banner-inapp-browser"
      className="sticky top-0 z-[60] w-full border-b border-amber-500/40 bg-amber-950/95 backdrop-blur-sm px-3 py-2.5 text-amber-100 shadow-lg"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5 text-left">
          <p className="text-sm font-semibold leading-snug">
            ⚠️ You opened this in {env.name ? `${env.name}'s browser` : "an in-app browser"}.
          </p>
          <p className="text-xs leading-snug text-amber-100/90">
            For best results, open this link in Safari/Chrome. Do not use private
            browsing. Close old game tabs before joining.
          </p>
          <p className="text-[11px] leading-snug text-amber-200/80">{howTo}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={copyLink}
            data-testid="button-copy-external-link"
            className="rounded-md border border-amber-400/50 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-50 transition hover:bg-amber-500/30 active:scale-[0.98]"
          >
            {copied ? "✓ Copied" : "Copy link"}
          </button>
          <button
            type="button"
            onClick={dismiss}
            data-testid="button-dismiss-inapp-banner"
            aria-label="Dismiss warning"
            className="rounded-md px-2 py-1.5 text-xs text-amber-200/70 transition hover:text-amber-50"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
