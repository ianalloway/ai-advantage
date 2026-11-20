import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('browse and search older saved tickets on an empty board', async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:4173') return route.abort();
    if (url.pathname === '/api/sports-lines') return route.fulfill({ json: { games: [] } });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { rows: [] } });
    return route.continue();
  });
  await page.goto('/daily-picks');
  await expect(page.getByText('No lines right now')).toBeVisible();
  await expect.poll(() => page.evaluate(async () =>
    (await indexedDB.databases()).some(db => db.name === 'ai-advantage-terminal'),
  )).toBe(true);

  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('ai-advantage-terminal');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('bet-log', 'readwrite');
      const store = tx.objectStore('bet-log');
      for (let i = 0; i < 201; i++) {
        store.put({
          id: String(i), gameId: String(i), side: i === 0 ? 'Oldest ticket' : `Team ${i}`,
          eventLabel: 'Example event', sport: 'nba', sportLabel: 'NBA', sideLocation: 'Home',
          stake: 10, americanOdds: -110, outcome: 'pending',
          placedAt: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
        });
      }
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }));
  await page.reload();
  await expect(page.getByText('Showing 8 of 201 tickets')).toBeVisible();
  await page.getByRole('button', { name: 'Show older tickets' }).click();
  await expect(page.getByText('Showing 16 of 201 tickets')).toBeVisible();

  const search = page.getByRole('searchbox', { name: 'Search bet history' });
  await search.fill('NBA OLDEST');
  await expect(page.getByText('Showing 1 of 1 ticket', { exact: true })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Stake on Oldest ticket' })).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export full bet log CSV' }).click();
  const file = await (await downloaded).path();
  expect((await readFile(file!, 'utf8')).split('\n')).toHaveLength(202);

  await search.fill('unmatched');
  await expect(page.getByText('No matching tickets')).toBeVisible();
  await search.fill('');
  await expect(page.getByText('Showing 8 of 201 tickets')).toBeVisible();
});
