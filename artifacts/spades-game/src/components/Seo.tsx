import { useEffect } from "react";

const SITE_ORIGIN = "https://1v1spades.com";

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  let created = false;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
    created = true;
  }
  const prev = el.getAttribute("content");
  el.setAttribute("content", content);
  return { el, prev, created };
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  let created = false;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
    created = true;
  }
  const prev = el.getAttribute("href");
  el.setAttribute("href", href);
  return { el, prev, created };
}

type Restorable = { el: Element; prev: string | null; created: boolean };

function restore(entries: Restorable[]) {
  for (const { el, prev, created } of entries) {
    if (created) {
      el.remove();
    } else if (prev !== null) {
      el.setAttribute(el.tagName === "LINK" ? "href" : "content", prev);
    }
  }
}

/**
 * Client-side SEO head manager for the static info/marketing pages. Sets a
 * unique <title>, meta description, canonical URL, robots, and Open Graph /
 * Twitter tags per page, and restores the previous head state on unmount so
 * SPA navigation back into the game doesn't leave stale metadata. Googlebot
 * renders JS, so these are picked up for indexing. Purely presentational —
 * touches only document head, never game state, sockets, or gameplay logic.
 */
export function Seo({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}) {
  useEffect(() => {
    const prevTitle = document.title;
    const url = `${SITE_ORIGIN}${path}`;
    document.title = title;

    const entries: Restorable[] = [
      upsertMeta("name", "description", description),
      upsertMeta("name", "robots", "index, follow"),
      upsertMeta("property", "og:title", title),
      upsertMeta("property", "og:description", description),
      upsertMeta("property", "og:type", "website"),
      upsertMeta("property", "og:url", url),
      upsertMeta("name", "twitter:card", "summary_large_image"),
      upsertMeta("name", "twitter:title", title),
      upsertMeta("name", "twitter:description", description),
      upsertLink("canonical", url),
    ];

    return () => {
      document.title = prevTitle;
      restore(entries);
    };
  }, [title, description, path]);

  return null;
}
