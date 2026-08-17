import { useEffect } from "react";
import seo from "@/data/seo.json";

/**
 * Per-route document metadata for a client-rendered SPA.
 *
 * Every route used to inherit the static tags in index.html verbatim: one
 * `<title>`, one description, and `<link rel="canonical" href="https://aiadvantagesports.com/">`.
 * That last one is the damaging part — sitemap.xml submits /daily-picks,
 * /leaderboard, /login, and /signup for indexing, while each of those pages
 * told crawlers it was a duplicate of the homepage. The sitemap and the pages
 * were arguing, and the canonical wins.
 *
 * The build now prerenders a correct <head> into dist/<route>/index.html, so
 * this hook is the client-side counterpart: it keeps the same tags accurate
 * after in-app navigation and for any route that is not prerendered. Open Graph
 * and Twitter title/description/url are derived from the same title/description
 * so a share of the current route never advertises the homepage's card.
 */

export const SITE_ORIGIN: string = seo.origin;

export interface DocumentMeta {
  title: string;
  description?: string;
  /** Route path such as "/daily-picks". Resolved against SITE_ORIGIN. */
  canonicalPath?: string;
  /** e.g. "noindex,follow" for pages that should stay out of the index. */
  robots?: string;
}

function upsertMeta(attr: "name" | "property", key: string, content: string): void {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function upsertCanonical(href: string): void {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = href;
}

function readMeta(attr: "name" | "property", key: string): string {
  return document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)?.content ?? "";
}

// Captured once, before any route has overwritten them, so unmount restores the
// index.html values rather than whatever the previously mounted route set. A
// route that forgets to call this hook then inherits the site defaults instead
// of a stale neighbour's title.
const defaults = {
  title: typeof document === "undefined" ? "" : document.title,
  description: typeof document === "undefined" ? "" : readMeta("name", "description"),
  canonical:
    typeof document === "undefined"
      ? `${SITE_ORIGIN}/`
      : (document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? `${SITE_ORIGIN}/`),
  robots: typeof document === "undefined" ? "index,follow" : readMeta("name", "robots") || "index,follow",
  ogTitle: typeof document === "undefined" ? "" : readMeta("property", "og:title"),
  ogDescription: typeof document === "undefined" ? "" : readMeta("property", "og:description"),
  ogUrl: typeof document === "undefined" ? `${SITE_ORIGIN}/` : readMeta("property", "og:url"),
  twitterTitle: typeof document === "undefined" ? "" : readMeta("name", "twitter:title"),
  twitterDescription: typeof document === "undefined" ? "" : readMeta("name", "twitter:description"),
};

export function useDocumentMeta({ title, description, canonicalPath, robots }: DocumentMeta): void {
  useEffect(() => {
    document.title = title;
    upsertMeta("property", "og:title", title);
    upsertMeta("name", "twitter:title", title);

    if (description) {
      upsertMeta("name", "description", description);
      upsertMeta("property", "og:description", description);
      upsertMeta("name", "twitter:description", description);
    }
    if (canonicalPath) {
      const url = `${SITE_ORIGIN}${canonicalPath}`;
      upsertCanonical(url);
      upsertMeta("property", "og:url", url);
    }
    if (robots) upsertMeta("name", "robots", robots);

    return () => {
      document.title = defaults.title;
      upsertMeta("property", "og:title", defaults.ogTitle);
      upsertMeta("name", "twitter:title", defaults.twitterTitle);
      if (description) {
        upsertMeta("name", "description", defaults.description);
        upsertMeta("property", "og:description", defaults.ogDescription);
        upsertMeta("name", "twitter:description", defaults.twitterDescription);
      }
      if (canonicalPath) {
        upsertCanonical(defaults.canonical);
        upsertMeta("property", "og:url", defaults.ogUrl);
      }
      if (robots) upsertMeta("name", "robots", defaults.robots);
    };
  }, [title, description, canonicalPath, robots]);
}
