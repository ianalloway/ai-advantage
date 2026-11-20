import { expect, test } from '@playwright/test';

test('reviews archive months in UTC and combines the month with the sport filter', async ({ page }) => {
  const games = [
    ['Spring game', 'NBA', '2026-03-01T00:30:00+01:00', 'won'],
    ['Baseball game', 'MLB', '2026-03-01T00:00:00Z', 'lost'],
    ['Undated legacy game', 'NBA', '', 'pending'],
  ];
  const rows = games.map(([eventLabel, sportLabel, commenceTime, ledgerOutcome], index) => ({
    id: String(index), eventLabel, sportLabel, commenceTime, ledgerOutcome,
    sport: sportLabel.toLowerCase(), lastSeenAt: '2026-04-10T12:00:00Z', snapshotCount: 1,
    recommendedSide: 'Home team', sideLocation: 'Home', modelProb: 0.6, entryOdds: 100,
    executionWindow: 'Today', executionAdjustedEdge: 4, suggestedStake: 10, kellyPct: 0.01,
  }));
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:4173') return route.abort();
    if (url.pathname === '/api/execution-ledger') return route.fulfill({ json: { rows, full: false } });
    if (url.pathname === '/api/sports-lines') return route.fulfill({ json: { games: [] } });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} });
    return route.continue();
  });
  await page.goto('/leaderboard');
  const month = page.getByRole('combobox', { name: /Archive game month/ });
  await expect(month.locator('option')).toHaveText(['All months', 'March 2026', 'February 2026']);
  await expect(page.getByText('3 stored rows · 2 settled · 1 win')).toBeVisible();
  await month.selectOption('2026-02');
  await expect(page.getByText('1 stored row · 1 settled · 1 win')).toBeVisible();
  await expect(page.getByRole('cell', { name: /Spring game/ })).toBeAttached();
  await expect(page.getByRole('cell', { name: /Baseball game/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'MLB', exact: true }).click();
  await expect(page.getByText('No archived games match these filters.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cumulative Profit Performance Curve' })).toHaveCount(0);
  await month.selectOption('');
  await expect(page.getByText('1 stored row · 1 settled · 0 wins')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cumulative Profit Performance Curve' })).toBeVisible();
});
