// Pure SEO helpers shared by the build-time prerender and sitemap generation.
//
// Everything here is a plain string transform with no filesystem or network
// access, so scripts/lib/seo.test.mjs can exercise it directly. The build step
// (scripts/prerender.mjs) reads src/data/seo.json, hands the parsed config in,
// and writes whatever these functions return to dist/.
//
// The head-rewriting helpers operate on the already-built dist/index.html: they
// find a specific tag by its identifying attribute and swap only the value that
// matters, so they stay correct even if index.html's head is reordered or
// extended later.

const AMP = /&/g;
const LT = /</g;
const GT = />/g;
const QUOT = /"/g;

/** Escape text that lands in element content (between tags). */
export function escapeHtml(value) {
  return String(value).replace(AMP, "&amp;").replace(LT, "&lt;").replace(GT, "&gt;");
}

/** Escape text that lands inside a double-quoted attribute value. */
export function escapeAttr(value) {
  return String(value)
    .replace(AMP, "&amp;")
    .replace(LT, "&lt;")
    .replace(GT, "&gt;")
    .replace(QUOT, "&quot;");
}

/** Escape text destined for XML character data (sitemap <loc>). */
export function escapeXml(value) {
  return String(value)
    .replace(AMP, "&amp;")
    .replace(LT, "&lt;")
    .replace(GT, "&gt;")
    .replace(QUOT, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolve a route path against the site origin. The homepage keeps its trailing
 * slash (canonical `https://site/`), every other route is slash-free so the
 * canonical, the sitemap, and the in-app links all agree on one spelling.
 */
export function absoluteUrl(origin, path) {
  const base = String(origin).replace(/\/+$/, "");
  if (!path || path === "/") return `${base}/`;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function setTitle(html, title) {
  return html.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${escapeHtml(title)}</title>`);
}

/**
 * Rewrite the `content` of the `<meta>` tag identified by `attr="key"`
 * (attr is "name" or "property"). Tolerant of attribute order; inserts a
 * `content` attribute if the matched tag somehow lacks one.
 */
export function setMeta(html, attr, key, content) {
  const tagRe = new RegExp(`<meta\\b[^>]*\\b${attr}="${escapeRegExp(key)}"[^>]*>`, "i");
  return html.replace(tagRe, (tag) => {
    if (/\bcontent="/i.test(tag)) {
      return tag.replace(/(\bcontent=")[^"]*(")/i, () => `content="${escapeAttr(content)}"`);
    }
    return tag.replace(/\s*\/?>\s*$/, () => ` content="${escapeAttr(content)}" />`);
  });
}

export function setCanonical(html, href) {
  const tagRe = /<link\b[^>]*\brel="canonical"[^>]*>/i;
  return html.replace(tagRe, (tag) =>
    tag.replace(/(\bhref=")[^"]*(")/i, () => `href="${escapeAttr(href)}"`),
  );
}

function indentBlock(text, pad) {
  return text
    .split("\n")
    .map((line, index) => (index === 0 ? line : `${pad}${line}`))
    .join("\n");
}

/** Replace the first JSON-LD `<script>` block's payload (the homepage clone's
 *  WebApplication node) with per-page structured data. */
export function replaceFirstJsonLd(html, jsonText) {
  const scriptRe = /<script type="application\/ld\+json">[\s\S]*?<\/script>/i;
  if (!scriptRe.test(html)) return html;
  return html.replace(
    scriptRe,
    () => `<script type="application/ld+json">\n      ${indentBlock(jsonText, "      ")}\n    </script>`,
  );
}

/** WebPage + BreadcrumbList graph for a single indexable route. */
export function buildPageStructuredData(route, config) {
  const url = absoluteUrl(config.origin, route.path);
  const home = absoluteUrl(config.origin, "/");
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: route.title,
        description: route.description,
        url,
        isPartOf: { "@type": "WebSite", name: config.siteName, url: home },
        primaryImageOfPage: absoluteUrl(config.origin, config.socialImage),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: home },
          { "@type": "ListItem", position: 2, name: route.h1 || route.title, item: url },
        ],
      },
    ],
  };
  return JSON.stringify(graph, null, 2);
}

// Static in-page navigation the crawler-facing body links out to. Keeps every
// prerendered route one hop from the desk's primary surfaces.
const NAV = [
  ["/", "Live Desk"],
  ["/daily-picks", "Daily Picks"],
  ["/leaderboard", "Proof Ledger"],
  ["/login", "Log In"],
];

/**
 * Minimal but honest static body for a prerendered subroute, injected into the
 * empty `#root`. createRoot().render() replaces it once the bundle loads, so
 * this exists purely for crawlers and no-JS clients: a real <h1>, a one-line
 * description, and internal links.
 */
export function buildPrerenderBody(route) {
  const nav = NAV.map(
    ([href, label]) =>
      `<a href="${escapeAttr(href)}" style="color:#94a3b8;margin-right:16px;">${escapeHtml(label)}</a>`,
  ).join("\n        ");
  return `
<div id="prerender-seo" style="min-height:100vh;background:#05070d;color:#e2e8f0;font-family:Inter,system-ui,sans-serif;">
  <header style="border-bottom:1px solid rgba(255,255,255,0.1);padding:18px 20px;">
    <strong style="color:#fff;">AI Advantage Sports</strong>
    <span style="color:#64748b;"> — Sports intelligence, sized and tracked</span>
    <nav style="margin-top:6px;">
        ${nav}
    </nav>
  </header>
  <main style="max-width:1120px;margin:0 auto;padding:48px 20px;">
    <h1 style="font-size:34px;font-weight:600;color:#fff;line-height:1.15;">${escapeHtml(route.h1 || route.title)}</h1>
    <p style="margin-top:16px;max-width:640px;font-size:18px;line-height:1.6;color:#cbd5e1;">${escapeHtml(route.intro || route.description)}</p>
  </main>
  <footer style="border-top:1px solid rgba(255,255,255,0.1);padding:24px 20px;color:#64748b;">
    AI Advantage Sports — execution-first sports betting intelligence. Bet responsibly; 21+.
  </footer>
</div>`;
}

/**
 * Rewrite a clone of dist/index.html into the head + body for one subroute:
 * title, description, robots, canonical, Open Graph / Twitter, per-page
 * structured data, and the crawler-facing body.
 */
export function renderSubroute(baseHtml, route, config, rootMarker) {
  const url = absoluteUrl(config.origin, route.path);
  let html = baseHtml;
  html = setTitle(html, route.title);
  html = setMeta(html, "name", "description", route.description);
  html = setMeta(html, "name", "robots", route.robots);
  html = setCanonical(html, url);
  html = setMeta(html, "property", "og:title", route.title);
  html = setMeta(html, "property", "og:description", route.description);
  html = setMeta(html, "property", "og:url", url);
  html = setMeta(html, "name", "twitter:title", route.title);
  html = setMeta(html, "name", "twitter:description", route.description);
  html = replaceFirstJsonLd(html, buildPageStructuredData(route, config));
  if (rootMarker && html.includes(rootMarker)) {
    html = html.replace(rootMarker, () => `<div id="root">${buildPrerenderBody(route)}</div>`);
  }
  return html;
}

/** Routes that belong in the sitemap: opted in via `sitemap` and not noindex. */
export function sitemapRoutes(routes) {
  return routes.filter(
    (route) => route.sitemap && !String(route.robots || "").includes("noindex"),
  );
}

export function buildSitemapXml(routes, origin, lastmod) {
  const entries = sitemapRoutes(routes)
    .map((route) => {
      const loc = escapeXml(absoluteUrl(origin, route.path));
      const priority = Number(route.sitemap.priority).toFixed(1);
      return [
        "  <url>",
        `    <loc>${loc}</loc>`,
        `    <lastmod>${lastmod}</lastmod>`,
        `    <changefreq>${route.sitemap.changefreq}</changefreq>`,
        `    <priority>${priority}</priority>`,
        "  </url>",
      ].join("\n");
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

/** Routes that get their own prerendered dist/<path>/index.html. */
export function prerenderRoutes(routes) {
  return routes.filter((route) => route.prerender);
}
