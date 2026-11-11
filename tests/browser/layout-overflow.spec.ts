import { test, expect } from '@playwright/test';

/**
 * No public route may scroll sideways.
 *
 * There was already an overflow assertion in the suite, but it lived at the end
 * of one checkout test, so it only ever measured /profile. /leaderboard was
 * shipping 117px of horizontal page scroll at phone width: a grid with no
 * explicit base track became a single `auto` column, which floors at its grid
 * item's min-content width, and a staking-plan table inside the card inflated
 * that track to 491px inside a 358px container.
 *
 * Horizontal page scroll is the kind of defect that reads as "the site is
 * broken on my phone" rather than as a bug report, so it is worth checking on
 * every route rather than on whichever one a feature test happened to end on.
 * This runs under both configured projects, so each route is measured at desktop
 * and at Pixel 7 width.
 */

const ROUTES = [
  '/',
  '/daily-picks',
  '/leaderboard',
  '/login',
  '/signup',
  '/profile',
  // The SPA fallback serves the 404 route, which has its own layout.
  '/no-such-page-exists-here',
];

/** Elements extending past the viewport that no ancestor clips — the real culprits. */
async function overflowReport(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    // documentElement.clientWidth, NOT window.innerWidth. Under Playwright's
    // mobile emulation (isMobile: true) innerWidth *grows to the content width*
    // when a page overflows — 508 instead of 412 on Pixel 7 — so comparing
    // scrollWidth against innerWidth is trivially satisfied and can never fail
    // on a phone. clientWidth stays at the real layout viewport.
    const vw = document.documentElement.clientWidth;
    const culprits: string[] = [];
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.right <= vw + 1) continue;
      if (getComputedStyle(el).position === 'fixed') continue;

      let clipped = false;
      let ancestor = el.parentElement;
      while (ancestor) {
        if (/auto|scroll|hidden|clip/.test(getComputedStyle(ancestor).overflowX)) {
          clipped = true;
          break;
        }
        ancestor = ancestor.parentElement;
      }
      if (clipped) continue;

      const cls = typeof el.className === 'string' ? el.className.slice(0, 80) : '';
      culprits.push(`${el.tagName.toLowerCase()}.${cls} (right=${Math.round(rect.right)} > vw=${vw})`);
      if (culprits.length >= 5) break;
    }
    return {
      scrollWidth: document.documentElement.scrollWidth,
      viewport: vw,
      innerWidth: window.innerWidth,
      culprits,
    };
  });
}

for (const route of ROUTES) {
  test(`${route} does not scroll sideways`, async ({ page }) => {
    // The desk calls ESPN on mount. Block it so layout is measured against the
    // deterministic empty state rather than whatever games exist today — and so
    // the test does not depend on network access in CI.
    await page.route('**://site.api.espn.com/**', (r) => r.abort());
    await page.route('**://api.the-odds-api.com/**', (r) => r.abort());

    await page.goto(route, { waitUntil: 'domcontentloaded' });
    // Panels mount and measure after hydration; settle before asserting.
    await page.waitForTimeout(700);

    const report = await overflowReport(page);
    expect(
      report.scrollWidth,
      `${route} overflows horizontally (scrollWidth ${report.scrollWidth} > layout viewport ${report.viewport}; ` +
        `window.innerWidth reports ${report.innerWidth}). ` +
        `Unclipped elements past the edge:\n  ${report.culprits.join('\n  ') || '(none identified)'}`,
    ).toBeLessThanOrEqual(report.viewport + 1);
  });
}
