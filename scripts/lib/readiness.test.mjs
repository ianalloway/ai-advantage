import { describe, expect, it, vi } from 'vitest';
import { checkReadiness, requiredBillingFlags } from '../check-readiness.mjs';

function fixture(overrides = {}, authStore = 'blobs-strong') {
  return vi.fn(async (url) => {
    const bodies = {
      '/api/billing-status': Object.fromEntries(requiredBillingFlags.map((key) => [key, true])),
      '/api/auth/me': { user: null },
      '/api/entitlements/me': { configured: true, access: { tier: 'free' } },
      ...overrides,
    };
    return new Response(JSON.stringify(bodies[url.pathname]), {
      headers: { 'content-type': 'application/json', 'x-auth-store': authStore },
    });
  });
}

describe('strict read-only readiness gate', () => {
  it('accepts complete configuration and uses only anonymous GETs', async () => {
    const fetcher = fixture();
    expect(await checkReadiness('https://example.test', fetcher)).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [, init] of fetcher.mock.calls) {
      expect(init.method).toBe('GET');
      expect(init.body).toBeUndefined();
      expect(init.headers).toEqual({ Accept: 'application/json' });
    }
  });
  it.each(requiredBillingFlags)('fails when %s is false, absent, or a truthy string', async (flag) => {
    for (const value of [false, undefined, 'true']) {
      const status = Object.fromEntries(requiredBillingFlags.map((key) => [key, true]));
      status[flag] = value;
      expect(await checkReadiness('https://example.test', fixture({ '/api/billing-status': status })))
        .toContain(`/api/billing-status: ${flag}`);
    }
  });
  it('rejects local or missing auth storage and anonymous paid access', async () => {
    for (const mode of ['none', 'local', '']) {
      expect(await checkReadiness('https://example.test', fixture({}, mode)))
        .toContain('/api/auth/me: persistent auth store must be configured');
    }
    expect(await checkReadiness('https://example.test', fixture({
      '/api/entitlements/me': { configured: false, access: { tier: 'premium' } },
    }))).toHaveLength(2);
  });
  it('fails closed on HTTP errors, malformed bodies and network failures without echoing data', async () => {
    for (const fetcher of [
      async () => new Response('secret response', { status: 503 }),
      async () => new Response('not json'),
      async () => new Response('null'),
      async () => { throw new Error('sensitive upstream detail'); },
    ]) {
      const failures = await checkReadiness('https://example.test', fetcher);
      expect(failures).toHaveLength(3);
      expect(failures.join()).not.toMatch(/secret|sensitive/);
    }
  });
});
