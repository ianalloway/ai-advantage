import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  const data = new Map<string, string>();
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  });
});
afterEach(() => { vi.unstubAllGlobals(); });
const paid = { tier: 'premium', source: 'stripe', label: 'Mock premium' };

describe('client paid feature denial', () => {
  it('clears in-memory paid feature gates immediately on account logout, even if logout transport fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ configured: true, access: paid }))));
    const stripe = await import('../../src/lib/stripe');
    const auth = await import('../../src/lib/auth');
    await stripe.syncEntitlementAccess();
    expect(stripe.hasFeatureAccess('exports')).toBe(true);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Mock network offline')));
    auth.signOutSiteUser();
    expect(stripe.getAccessState().tier).toBe('free');
    expect(stripe.hasFeatureAccess('premium_board')).toBe(false);
    expect(stripe.hasFeatureAccess('exports')).toBe(false);
    expect(localStorage.getItem('ai_advantage_access_v2')).toBeNull();
  });

  it('does not let an entitlement response started before logout restore paid access', async () => {
    let resolve: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
    const stripe = await import('../../src/lib/stripe');
    const pending = stripe.syncEntitlementAccess();
    stripe.clearAccess();
    resolve!(new Response(JSON.stringify({ configured: true, access: paid })));
    await pending;
    expect(stripe.hasFeatureAccess('exports')).toBe(false);
    expect(stripe.getAccessState().tier).toBe('free');
  });

  it('locks previously paid features if the entitlement refresh fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ configured: true, access: paid }))));
    const stripe = await import('../../src/lib/stripe');
    await stripe.syncEntitlementAccess();
    expect(stripe.hasFeatureAccess('exports')).toBe(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
    await expect(stripe.syncEntitlementAccess()).rejects.toThrow();
    expect(stripe.hasFeatureAccess('exports')).toBe(false);
  });
});
