import seo from "@/data/seo.json";
import type { DocumentMeta } from "@/lib/useDocumentMeta";

/**
 * Typed access to the per-route SEO copy in src/data/seo.json — the single
 * source shared by the pages (this hook input), the build-time prerender
 * (dist/<route>/index.html heads), and the sitemap generator. Editing a title
 * or description in one place updates the rendered page, the crawlable static
 * head, and the sitemap together, so they can no longer drift apart.
 */

interface RouteEntry {
  path: string;
  title: string;
  description: string;
  robots?: string;
}

const byPath = new Map<string, RouteEntry>(
  (seo.routes as RouteEntry[]).map((route) => [route.path, route]),
);

/** Metadata for a known route path, shaped for {@link useDocumentMeta}. */
export function routeMeta(path: string): DocumentMeta {
  const entry = byPath.get(path);
  if (!entry) {
    // A route missing from seo.json still gets a self-referential canonical
    // rather than silently inheriting the homepage's.
    return { title: seo.siteName, canonicalPath: path };
  }
  return {
    title: entry.title,
    description: entry.description,
    canonicalPath: entry.path,
    robots: entry.robots,
  };
}

/** Metadata for the catch-all 404 route (kept out of the index). */
export const notFoundMeta: DocumentMeta = {
  title: seo.notFound.title,
  robots: seo.notFound.robots,
};
