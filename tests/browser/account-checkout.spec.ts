import { expect, test, type Page } from '@playwright/test';

const user = { id: 'mock-user', email: 'journey@example.test', username: 'journey', displayName: 'Journey', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
const free = { tier: 'free', source: 'manual', label: 'Free access' };
const premium = { tier: 'premium', source: 'stripe', label: 'Mock Pro Monthly' };

async function mockBackend(page: Page) {
  const state = { signedIn: false, paid: false, accountCreated: false, checkout: 'paid', verifyCalls: 0, checkoutCalls: 0, logoutFails: false };
  // No requests reach Stripe, storage, email, live sports providers, or production.
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:4173') return route.abort('blockedbyclient');
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const path = url.pathname;
    const post = route.request().method() === 'POST';
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (path === '/api/auth/signup') {
      expect(route.request().postDataJSON()).toMatchObject({ email: user.email, username: user.username });
      state.accountCreated = true; state.signedIn = true;
      return json({ success: true, user });
    }
    if (path === '/api/auth/login') {
      const input = route.request().postDataJSON();
      if (!state.accountCreated || input.password !== 'ephemeral-test-password') return json({ message: 'Invalid credentials' }, 401);
      state.signedIn = true;
      return json({ success: true, user });
    }
    if (path === '/api/auth/logout') { state.signedIn = false; return json({ success: true }); }
    if (path === '/api/auth/me') return json({ user: state.signedIn ? user : null });
    if (path === '/api/entitlements/me') {
      if (post && state.logoutFails) return json({ success: false, revoked: false }, 503);
      if (post) { state.paid = false; return json({ success: true, revoked: true }); }
      return json({ configured: true, serverVerified: true, access: state.paid ? premium : free });
    }
    if (path === '/api/create-checkout-session') {
      state.checkoutCalls++;
      expect(route.request().postDataJSON()).toMatchObject({ mode: 'premium', customerEmail: user.email, clientReferenceId: user.id });
      if (state.checkout === 'error') return json({ message: 'Mock checkout unavailable' }, 503);
      // A local return URL replaces the hosted Stripe UI; no card details are entered.
      return json({ url: `http://127.0.0.1:4173/profile?checkout=success&session_id=cs_test_browser` });
    }
    if (path === '/api/checkout-session') {
      state.verifyCalls++;
      state.paid = state.checkout === 'paid';
      return json({ paid: state.paid, mode: 'subscription', entitlement: state.paid ? { ...premium, status: 'active' } : null });
    }
    return json({ message: 'Unmocked endpoint' }, 503);
  });
  return state;
}
async function signup(page: Page) {
  await page.goto('/signup');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Username', { exact: true }).fill(user.username);
  await page.getByLabel('Display name').fill(user.displayName);
  await page.getByLabel('Password', { exact: true }).fill('ephemeral-test-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByText('Free account', { exact: true })).toBeVisible();
}
async function logout(page: Page) {
  await page.getByRole('button', { name: 'Log out account' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Free access', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
}

test('signup, bad login, paid return, reload, logout and denied access', async ({ page }) => {
  const state = await mockBackend(page);
  await signup(page);
  await logout(page);
  await page.getByLabel('Email or username').fill(user.username);
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByText('Invalid credentials', { exact: true })).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill('ephemeral-test-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByRole('button', { name: 'Start 7-day Pro trial' }).click();
  await expect(page.getByRole('button', { name: 'Manage billing (portal)' })).toBeVisible();
  expect(state.checkoutCalls).toBe(1);
  expect(state.verifyCalls).toBe(1);
  await expect(page).toHaveURL(/\/profile$/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Manage billing (portal)' })).toBeVisible();
  await logout(page);
  await page.goto('/profile');
  await expect(page.getByRole('button', { name: 'Manage billing (portal)' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible();
});

test('cancelled, unpaid and failed checkout stay free; forged storage does not unlock', async ({ page }) => {
  const state = await mockBackend(page);
  await signup(page);
  await page.evaluate(() => {
    localStorage.setItem('ai_advantage_access_v2', JSON.stringify({ tier: 'premium', source: 'stripe', label: 'Forged access' }));
    localStorage.setItem('ai_advantage_premium', 'true');
  });
  await page.goto('/profile?checkout=cancelled');
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByText('Free account', { exact: true })).toBeVisible();
  expect(state.verifyCalls).toBe(0);
  state.checkout = 'unpaid';
  await page.getByRole('button', { name: 'Start 7-day Pro trial' }).click();
  await expect.poll(() => state.verifyCalls).toBe(1);
  await expect(page.getByText('Free account', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Manage billing (portal)' })).toHaveCount(0);
  state.checkout = 'error';
  await page.getByRole('button', { name: 'Start 7-day Pro trial' }).click();
  await expect(page.getByText('Mock checkout unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start 7-day Pro trial' })).toBeEnabled();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});


test('failed logout is reported and remains locked after backend recovery and reload', async ({ page }) => {
  const state = await mockBackend(page);
  await signup(page);
  state.paid = true;
  await page.reload();
  await expect(page.getByRole('button', { name: 'Manage billing (portal)' })).toBeVisible();
  state.logoutFails = true;
  await page.getByRole('button', { name: 'Log out account' }).click();
  await expect(page.getByText('Logout not confirmed', { exact: true })).toBeVisible();
  await expect(page.getByText('Free access', { exact: true })).toBeVisible();
  state.logoutFails = false;
  // The mock backend still holds the paid session; the client must stay locked.
  expect(state.paid).toBe(true);
  await page.reload();
  await expect(page.getByText('Free access', { exact: true })).toBeVisible();
  await page.getByLabel('Email or username').fill(user.username);
  await page.getByLabel('Password', { exact: true }).fill('ephemeral-test-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Manage billing (portal)' })).toBeVisible();
});
