import { beforeEach, describe, expect, it, vi } from 'vitest';
const boundary = vi.hoisted(() => ({ getStore: vi.fn() }));
vi.mock('../../netlify/functions/_lib/entitlements', async (original) => ({
  ...await original<typeof import('../../netlify/functions/_lib/entitlements')>(),
  getEntitlementStore: boundary.getStore,
}));
vi.mock('../../netlify/functions/_lib/auth-session', () => ({ getCurrentSiteUserFromEvent: async () => null }));
import { handler } from '../../netlify/functions/entitlements';
import { createEntitlementSession, entitlementSessionCookie, upsertEntitlement, type EntitlementStore } from '../../netlify/functions/_lib/entitlements';

beforeEach(() => { vi.clearAllMocks(); });
describe('logout during storage failure', () => {
  it.each(['unavailable', 'delete throws'])('expires the cookie when %s and stays free after backend recovery', async (failure) => {
    const data = new Map<string, unknown>();
    const store: EntitlementStore = {
      mode: 'blobs', get: async <T>(key: string) => data.get(key) as T ?? null,
      set: async (key, value) => { data.set(key, value); },
      setIfAbsent: async (key, value) => { if (data.has(key)) return false; data.set(key, value); return true; },
      delete: vi.fn(async (key) => { data.delete(key); }),
    };
    boundary.getStore.mockReturnValue(store);
    const record = await upsertEntitlement(store, {
      id: 'mock-logout-entitlement', tier: 'premium', source: 'stripe', label: 'Mock premium',
      status: 'active', activatedAt: new Date().toISOString(),
    });
    const session = await createEntitlementSession(store, record);
    const cookie = entitlementSessionCookie({ host: 'example.test' }, session.token, session.maxAge).split(';')[0];
    const event = { headers: { host: 'example.test', cookie }, httpMethod: 'GET' };
    expect(JSON.parse((await handler(event)).body).access.tier).toBe('premium');
    if (failure === 'unavailable') boundary.getStore.mockReturnValue(null);
    else vi.mocked(store.delete).mockRejectedValueOnce(new Error('mock deletion failed'));
    const logout = await handler({ ...event, httpMethod: 'POST' });
    expect(logout.statusCode).toBe(503);
    expect(JSON.parse(logout.body)).toMatchObject({ success: false, revoked: false, access: { tier: 'free' } });
    expect(logout.headers['Set-Cookie']).toContain('Max-Age=0');
    expect(logout.headers['Set-Cookie']).toContain('HttpOnly');
    expect(logout.headers['Set-Cookie']).toContain('Secure');

    boundary.getStore.mockReturnValue(store);
    // A browser applies expiry even on a 503, so the next request has no cookie.
    expect(JSON.parse((await handler({ ...event, headers: { host: 'example.test', cookie: '' } })).body).access.tier).toBe('free');
    // Be honest: a retained token was not revoked while storage was unavailable.
    expect(JSON.parse((await handler(event)).body).access.tier).toBe('premium');
    const retry = await handler({ ...event, httpMethod: 'POST' });
    expect(retry.statusCode).toBe(200);
    expect(JSON.parse((await handler(event)).body).access.tier).toBe('free');
  });
});
