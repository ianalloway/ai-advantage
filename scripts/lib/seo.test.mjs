import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  absoluteUrl,
  buildPageStructuredData,
  buildSitemapXml,
  escapeAttr,
  escapeHtml,
  escapeXml,
  prerenderRoutes,
  renderSubroute,
  replaceFirstJsonLd,
  setCanonical,
  setMeta,
  setTitle,
  sitemapRoutes,
} from "./seo.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const config = {
  origin: "https://example.com",
  siteName: "Example Desk",
  socialImage: "/card.png",
};

const route = {
  path: "/daily-picks",
  title: "Daily Picks — Example Desk",
  description: "Every qualified play with edge, stake, and window.",
  h1: "Daily Picks",
  intro: "Every qualified play, graded.",
  robots: "index,follow",
};

// A stand-in for the built dist/index.html head: homepage values that a
// subroute clone must overwrite, plus two JSON-LD blocks to prove only the
// first is rewritten.
const BASE_HTML = `<!DOCTYPE html><html><head>
<title>Home — Example Desk</title>
<meta name="description" content="Home description." />
<meta name="robots" content="index,follow" />
<link rel="canonical" href="https://example.com/" />
<meta property="og:title" content="Home — Example Desk" />
<meta property="og:description" content="Home og description." />
<meta property="og:url" content="https://example.com/" />
<meta name="twitter:title" content="Home — Example Desk" />
<meta name="twitter:description" content="Home twitter description." />
<script type="application/ld+json">
      { "@type": "WebApplication", "name": "Example Desk" }
    </script>
<script type="application/ld+json">
      { "@type": "Organization", "name": "Example Desk" }
    </script>
</head><body><div id="root"></div></body></html>`;

const ROOT = '<div id="root"></div>';

describe("escaping", () => {
  it("escapes element content", () => {
    expect(escapeHtml('a & b < c > d')).toBe("a &amp; b &lt; c &gt; d");
  });
  it("escapes attribute values including quotes", () => {
    expect(escapeAttr('say "hi" & <bye>')).toBe("say &quot;hi&quot; &amp; &lt;bye&gt;");
  });
  it("escapes xml including apostrophes", () => {
    expect(escapeXml("Tom's & Jerry's")).toBe("Tom&apos;s &amp; Jerry&apos;s");
  });
});

describe("absoluteUrl", () => {
  it("keeps the homepage trailing slash", () => {
    expect(absoluteUrl("https://example.com", "/")).toBe("https://example.com/");
  });
  it("resolves a subroute without a trailing slash", () => {
    expect(absoluteUrl("https://example.com", "/daily-picks")).toBe(
      "https://example.com/daily-picks",
    );
  });
  it("normalizes a trailing slash on the origin", () => {
    expect(absoluteUrl("https://example.com/", "/leaderboard")).toBe(
      "https://example.com/leaderboard",
    );
  });
});

describe("head rewriting", () => {
  it("replaces the title", () => {
    expect(setTitle(BASE_HTML, "New Title")).toContain("<title>New Title</title>");
  });

  it("rewrites a meta by name regardless of attribute order", () => {
    const reordered = '<meta content="old" name="description" />';
    expect(setMeta(reordered, "name", "description", "fresh")).toBe(
      '<meta content="fresh" name="description" />',
    );
  });

  it("rewrites an og property meta", () => {
    const out = setMeta(BASE_HTML, "property", "og:title", "Subroute Title");
    expect(out).toContain('<meta property="og:title" content="Subroute Title" />');
    // Only the og:title changes; og:description is untouched.
    expect(out).toContain('content="Home og description."');
  });

  it("inserts a content attribute when the matched tag lacks one", () => {
    const out = setMeta('<meta name="robots" />', "name", "robots", "noindex,follow");
    expect(out).toBe('<meta name="robots" content="noindex,follow" />');
  });

  it("escapes rewritten attribute values", () => {
    const out = setMeta(BASE_HTML, "name", "description", 'A "quoted" & <angled> value');
    expect(out).toContain('content="A &quot;quoted&quot; &amp; &lt;angled&gt; value"');
  });

  it("rewrites the canonical href", () => {
    const out = setCanonical(BASE_HTML, "https://example.com/daily-picks");
    expect(out).toContain('<link rel="canonical" href="https://example.com/daily-picks" />');
  });

  it("replaces only the first JSON-LD block", () => {
    const out = replaceFirstJsonLd(BASE_HTML, '{\n  "@type": "WebPage"\n}');
    expect(out).toContain('"@type": "WebPage"');
    expect(out).not.toContain('"@type": "WebApplication"');
    // The Organization block (second) survives.
    expect(out).toContain('"@type": "Organization"');
  });
});

describe("buildPageStructuredData", () => {
  it("emits a WebPage + BreadcrumbList graph for the route", () => {
    const parsed = JSON.parse(buildPageStructuredData(route, config));
    const [page, crumbs] = parsed["@graph"];
    expect(page["@type"]).toBe("WebPage");
    expect(page.url).toBe("https://example.com/daily-picks");
    expect(page.isPartOf.url).toBe("https://example.com/");
    expect(crumbs["@type"]).toBe("BreadcrumbList");
    expect(crumbs.itemListElement.at(-1).item).toBe("https://example.com/daily-picks");
  });
});

describe("renderSubroute", () => {
  const out = renderSubroute(BASE_HTML, route, config, ROOT);

  it("rewrites the whole head for the route", () => {
    expect(out).toContain(`<title>${route.title}</title>`);
    expect(out).toContain('<link rel="canonical" href="https://example.com/daily-picks" />');
    expect(out).toContain('<meta property="og:url" content="https://example.com/daily-picks" />');
    expect(out).toContain('<meta name="twitter:title" content="Daily Picks — Example Desk" />');
    expect(out).toContain('"@type": "WebPage"');
    expect(out).not.toContain('"@type": "WebApplication"');
  });

  it("injects a crawler-facing body with an h1 and internal links", () => {
    expect(out).toContain("<h1");
    expect(out).toContain(route.h1);
    expect(out).toContain('href="/daily-picks"');
    expect(out).toContain('href="/leaderboard"');
    expect(out).not.toContain(ROOT); // root marker was consumed
  });
});

describe("sitemap", () => {
  const routes = [
    { path: "/", robots: "index,follow", sitemap: { priority: 1.0, changefreq: "daily" } },
    { path: "/daily-picks", robots: "index,follow", sitemap: { priority: 0.9, changefreq: "daily" } },
    { path: "/profile", robots: "noindex,follow", sitemap: { priority: 0.5, changefreq: "monthly" } },
    { path: "/about", robots: "index,follow" },
  ];

  it("selects only indexable, opted-in routes", () => {
    expect(sitemapRoutes(routes).map((r) => r.path)).toEqual(["/", "/daily-picks"]);
  });

  it("builds valid xml with fixed lastmod and one-decimal priority", () => {
    const xml = buildSitemapXml(routes, "https://example.com", "2026-08-15");
    expect(xml).toContain("<loc>https://example.com/</loc>");
    expect(xml).toContain("<loc>https://example.com/daily-picks</loc>");
    expect(xml).not.toContain("/profile");
    expect(xml).not.toContain("/about");
    expect(xml).toContain("<lastmod>2026-08-15</lastmod>");
    expect(xml).toContain("<priority>1.0</priority>");
    expect(xml).toContain("<priority>0.9</priority>");
  });
});

describe("src/data/seo.json integrity", () => {
  it("is internally consistent", async () => {
    const raw = await readFile(join(here, "..", "..", "src", "data", "seo.json"), "utf8");
    const seo = JSON.parse(raw);

    expect(seo.origin).toMatch(/^https:\/\//);
    expect(seo.origin).not.toMatch(/\/$/); // no trailing slash; helpers add it

    const paths = seo.routes.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length); // unique

    for (const r of seo.routes) {
      expect(r.path.startsWith("/")).toBe(true);
      expect(typeof r.title).toBe("string");
      expect(r.title.length).toBeGreaterThan(0);
      expect(typeof r.description).toBe("string");
      expect(r.description.length).toBeGreaterThan(0);
      expect(r.robots).toMatch(/^(index|noindex),(follow|nofollow)$/);
      if (r.prerender) {
        // A prerendered subroute needs a heading and a lead line for its body.
        expect(typeof r.h1).toBe("string");
        expect(typeof r.intro).toBe("string");
      }
    }

    // Nothing noindex is ever advertised in the sitemap.
    for (const r of sitemapRoutes(seo.routes)) {
      expect(r.robots).not.toContain("noindex");
      expect(r.sitemap.changefreq).toMatch(/^(always|hourly|daily|weekly|monthly|yearly|never)$/);
      expect(r.sitemap.priority).toBeGreaterThanOrEqual(0);
      expect(r.sitemap.priority).toBeLessThanOrEqual(1);
    }

    // The homepage is canonical and indexable; it is not a generated subroute.
    const home = seo.routes.find((r) => r.path === "/");
    expect(home).toBeTruthy();
    expect(home.prerender).toBe(false);
    expect(home.robots).toBe("index,follow");

    // Every prerender target is reachable as a distinct file path.
    for (const r of prerenderRoutes(seo.routes)) {
      expect(r.path).not.toBe("/");
    }
  });
});
