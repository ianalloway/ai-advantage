// Build-time prerender of the homepage marketing content.
//
// The app is a client-rendered SPA, so a raw `dist/index.html` ships an empty
// `<div id="root">` — invisible to crawlers, no-JS viewers, and "view source".
// This injects the real, static marketing copy into #root so the initial HTML
// is meaningful. main.tsx uses createRoot().render() (not hydrate), so React
// cleanly replaces this content once the bundle loads — no hydration mismatch.
//
// Pure string injection: no headless browser, no network. If anything is off,
// it logs and exits 0 so a prerender hiccup can never fail the production build.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const indexPath = join(here, "..", "dist", "index.html");

const sections = [
  {
    eyebrow: "Live Desk",
    title: "A usable slate, not a wall of hype.",
    body: "Pick a sport — NBA, NFL, MLB, or the FIFA World Cup — inspect current games with live lines, and only act when the model and the execution filters agree.",
  },
  {
    eyebrow: "Proof System",
    title: "Every recommendation should leave evidence.",
    body: "The product is built around auditable signals: model probability, execution-adjusted edge, recommended stake, and a settled execution ledger that grades each pick against the final score.",
  },
  {
    eyebrow: "Model Lab",
    title: "Pressure-test a matchup in seconds.",
    body: "Drop in two teams, tune bankroll settings, and get a clear pass-or-play report with the assumptions exposed.",
  },
];

const valueProps = [
  ["Model probability", "Win probability minus market-implied probability."],
  ["Execution edge", "Raw edge adjusted for timing, CLV, volatility, and liquidity."],
  ["Kelly sizing", "Quarter-Kelly stake guidance keeps conviction from turning reckless."],
];

const pricing = [
  ["Free Desk", "$0", "Live board, model leans, and the public proof ledger."],
  ["Event Pass", "$10", "Unlock the full execution board for a single slate."],
  ["Pro Monthly", "$19", "Deeper boards, historical ledgers, and workflow tools."],
];

function esc(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const prerenderHtml = `
<div id="prerender-seo" style="min-height:100vh;background:#05070d;color:#e2e8f0;font-family:Inter,system-ui,sans-serif;">
  <header style="border-bottom:1px solid rgba(255,255,255,0.1);padding:18px 20px;">
    <strong style="color:#fff;">AI Advantage Sports</strong>
    <span style="color:#64748b;"> — Sports intelligence, sized and tracked</span>
    <nav style="margin-top:6px;">
      <a href="#live-desk" style="color:#94a3b8;margin-right:16px;">Live Desk</a>
      <a href="#proof" style="color:#94a3b8;margin-right:16px;">Proof</a>
      <a href="#model-lab" style="color:#94a3b8;margin-right:16px;">Model</a>
      <a href="#pricing" style="color:#94a3b8;">Pricing</a>
    </nav>
  </header>
  <main style="max-width:1120px;margin:0 auto;padding:48px 20px;">
    <h1 style="font-size:40px;font-weight:600;color:#fff;line-height:1.1;">Find the edge before the market moves.</h1>
    <p style="margin-top:20px;max-width:640px;font-size:18px;line-height:1.6;color:#cbd5e1;">
      AI-assisted odds analysis, Kelly sizing, and proof-first tracking for NBA, NFL, MLB, and the FIFA World Cup.
      Built for decisions that can be defended after the final whistle.
    </p>
    <p style="margin-top:24px;"><a href="#live-desk" style="color:#67e8f9;font-weight:600;">Open Live Desk</a></p>
    <section style="margin-top:40px;">
      <h2 style="color:#fff;font-size:20px;">What the desk produces</h2>
      <ul style="margin-top:12px;padding-left:18px;line-height:1.7;color:#cbd5e1;">
        ${valueProps.map(([label, body]) => `<li><strong style="color:#fff;">${esc(label)}:</strong> ${esc(body)}</li>`).join("\n        ")}
      </ul>
    </section>
    ${sections
      .map(
        (s) => `<section style="margin-top:36px;">
      <div style="text-transform:uppercase;letter-spacing:0.2em;font-size:12px;color:#22d3ee;">${esc(s.eyebrow)}</div>
      <h2 style="color:#fff;font-size:24px;margin-top:8px;">${esc(s.title)}</h2>
      <p style="margin-top:8px;max-width:640px;line-height:1.6;color:#cbd5e1;">${esc(s.body)}</p>
    </section>`,
      )
      .join("\n    ")}
    <section id="pricing" style="margin-top:36px;">
      <div style="text-transform:uppercase;letter-spacing:0.2em;font-size:12px;color:#22d3ee;">Pricing</div>
      <h2 style="color:#fff;font-size:24px;margin-top:8px;">Upgrade only when the product earns the click.</h2>
      <ul style="margin-top:12px;padding-left:18px;line-height:1.7;color:#cbd5e1;">
        ${pricing.map(([name, price, body]) => `<li><strong style="color:#fff;">${esc(name)} — ${esc(price)}:</strong> ${esc(body)}</li>`).join("\n        ")}
      </ul>
    </section>
  </main>
  <footer style="border-top:1px solid rgba(255,255,255,0.1);padding:24px 20px;color:#64748b;">
    AI Advantage Sports — execution-first sports betting intelligence. Bet responsibly; 21+.
  </footer>
</div>`;

const ROOT_EMPTY = '<div id="root"></div>';

try {
  const html = await readFile(indexPath, "utf8");
  if (!html.includes(ROOT_EMPTY)) {
    console.warn("[prerender] '<div id=\"root\"></div>' not found in dist/index.html; skipping injection.");
    process.exit(0);
  }
  const next = html.replace(ROOT_EMPTY, `<div id="root">${prerenderHtml}</div>`);
  await writeFile(indexPath, next);
  console.log("[prerender] Injected static homepage marketing content into dist/index.html");
} catch (error) {
  console.warn("[prerender] Skipped (non-fatal):", error?.message ?? error);
  process.exit(0);
}
