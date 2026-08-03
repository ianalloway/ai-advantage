import { useEffect } from "react";

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
 * Netlify serves the SPA fallback, so this is set client-side after hydration
 * rather than in the served HTML. Crawlers that execute JS pick it up; a
 * server-rendered or per-route prerendered head would be strictly better and is
 * the natural follow-up if these routes matter for organic traffic.
 */

export const SITE_ORIGIN = "https://aiadvantagesports.com";

export interface DocumentMeta {
  title: string;
  description?: string;
  /** Route path such as "/daily-picks". Resolved against SITE_ORIGIN. */
  canonicalPath?: string;
  /** e.g. "noindex,follow" for pages that should stay out of the index. */
  robots?: string;
}

function upsertMeta(name: string, content: string): void {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.name = name;
    document.head.appendChild(tag);
  }
  tag.content = content;
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

// Captured once, before any route has overwritten them, so unmount restores the
// index.html values rather than whatever the previously mounted route set. A
// route that forgets to call this hook then inherits the site defaults instead
// of a stale neighbour's title.
const defaults = {
  title: typeof document === "undefined" ? "" : document.title,
  description:
    typeof document === "undefined"
      ? ""
      : (document.head.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? ""),
  canonical:
    typeof document === "undefined"
      ? `${SITE_ORIGIN}/`
      : (document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? `${SITE_ORIGIN}/`),
  robots:
    typeof document === "undefined"
      ? "index,follow"
      : (document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content ?? "index,follow"),
};

export function useDocumentMeta({ title, description, canonicalPath, robots }: DocumentMeta): void {
  useEffect(() => {
    document.title = title;
    if (description) upsertMeta("description", description);
    if (canonicalPath) upsertCanonical(`${SITE_ORIGIN}${canonicalPath}`);
    if (robots) upsertMeta("robots", robots);

    return () => {
      document.title = defaults.title;
      if (description) upsertMeta("description", defaults.description);
      if (canonicalPath) upsertCanonical(defaults.canonical);
      if (robots) upsertMeta("robots", defaults.robots);
    };
  }, [title, description, canonicalPath, robots]);
}
