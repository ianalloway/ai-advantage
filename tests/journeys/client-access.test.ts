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
    const logout = auth.signOutSiteUser();
    expect(stripe.getAccessState().tier).toBe('free');
    expect(stripe.hasFeatureAccess('premium_board')).toBe(false);
    expect(stripe.hasFeatureAccess('exports')).toBe(false);
    expect(localStorage.getItem('ai_advantage_access_v2')).toBeNull();
    expect(await logout).toMatchObject({ success: false });
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

function deferredResponse() {
  let resolve!: (response: Response) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const accessResponse = (access: unknown) => new Response(JSON.stringify({ configured: true, access }));
const freeAccess = { tier: 'free', source: 'manual', label: 'Free access' };

it.each(['anonymous first', 'authenticated first'])('prefers the post-login refresh when %s completes', async (order) => {
  const anonymous = deferredResponse();
  const authenticated = deferredResponse();
  vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(anonymous.promise).mockReturnValueOnce(authenticated.promise));
  const stripe = await import('../../src/lib/stripe');
  const a = stripe.syncEntitlementAccess();
  const b = stripe.syncEntitlementAccess();
  if (order === 'anonymous first') {
    anonymous.resolve(accessResponse(freeAccess)); await a;
    authenticated.resolve(accessResponse(paid)); await b;
  } else {
    authenticated.resolve(accessResponse(paid)); await b;
    anonymous.resolve(accessResponse(freeAccess)); await a;
  }
  expect(stripe.getAccessState().tier).toBe('premium');
});

it('ignores late bootstrap errors after explicit login and a newer focus refresh', async () => {
  const bootstrap = deferredResponse();
  const login = deferredResponse();
  const focus = deferredResponse();
  vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(bootstrap.promise).mockReturnValueOnce(login.promise).mockReturnValueOnce(focus.promise));
  const stripe = await import('../../src/lib/stripe');
  const a = stripe.syncEntitlementAccess().catch(() => null);
  stripe.resumeAccessSession();
  const b = stripe.syncEntitlementAccess();
  const c = stripe.syncEntitlementAccess();
  focus.resolve(accessResponse(paid)); await c;
  login.resolve(accessResponse(freeAccess)); await b;
  bootstrap.reject(new Error('late bootstrap error')); await a;
  expect(stripe.getAccessState().tier).toBe('premium');
});

it.each(['503', 'network'])('keeps access locked during logout and after %s failure/recovery/reload', async (failure) => {
  const logout = deferredResponse();
  const fetcher = vi.fn().mockReturnValueOnce(logout.promise);
  vi.stubGlobal('fetch', fetcher);
  let stripe = await import('../../src/lib/stripe');
  const pending = stripe.signOutAccessSession();
  expect(await stripe.syncEntitlementAccess()).toMatchObject({ tier: 'free' });
  expect(fetcher).toHaveBeenCalledTimes(1);
  if (failure === '503') logout.resolve(new Response(JSON.stringify({ success: false, revoked: false }), { status: 503 }));
  else logout.reject(new Error('offline'));
  expect(await pending).toMatchObject({ success: false });
  fetcher.mockResolvedValue(accessResponse(paid));
  expect(await stripe.syncEntitlementAccess()).toMatchObject({ tier: 'free' });
  vi.resetModules(); // Same browser storage, freshly loaded modules.
  stripe = await import('../../src/lib/stripe');
  expect(await stripe.syncEntitlementAccess()).toMatchObject({ tier: 'free' });
  expect(fetcher).toHaveBeenCalledTimes(1);
  stripe.resumeAccessSession(); // Explicit reauthentication is allowed to restore access.
  expect(await stripe.syncEntitlementAccess()).toMatchObject({ tier: 'premium' });
});

it('does not let an older paid refresh overwrite a newer denial', async () => {
  const older = deferredResponse();
  const newer = deferredResponse();
  vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise));
  const stripe = await import('../../src/lib/stripe');
  const a = stripe.syncEntitlementAccess();
  const b = stripe.syncEntitlementAccess();
  newer.resolve(accessResponse(freeAccess)); await b;
  older.resolve(accessResponse(paid)); await a;
  expect(stripe.getAccessState().tier).toBe('free');
});

it('does not let an older focus error clear a newer paid response in the same session', async () => {
  const older = deferredResponse();
  const newer = deferredResponse();
  vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise));
  const stripe = await import('../../src/lib/stripe');
  const a = stripe.syncEntitlementAccess().catch(() => null);
  const b = stripe.syncEntitlementAccess();
  newer.resolve(accessResponse(paid)); await b;
  older.reject(new Error('late focus error')); await a;
  expect(stripe.getAccessState().tier).toBe('premium');
});
