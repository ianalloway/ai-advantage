import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock provider boundaries only. Real handlers, password hashes, session lookups,
// checkout identity attribution and entitlement persistence run together.
const sandbox = vi.hoisted(() => ({
  stores: new Map<string, Map<string, unknown>>(),
  create: vi.fn(), retrieve: vi.fn(),
}));
vi.mock("@netlify/blobs", () => ({
  connectLambda: vi.fn(), setEnvironmentContext: vi.fn(),
  getStore: (options: string | { name: string }) => {
    const name = typeof options === "string" ? options : options.name;
    if (!sandbox.stores.has(name)) sandbox.stores.set(name, new Map());
    const data = sandbox.stores.get(name)!;
    return {
      get: async (key: string) => structuredClone(data.get(key) ?? null),
      setJSON: async (key: string, value: unknown) => { data.set(key, structuredClone(value)); },
      delete: async (key: string) => { data.delete(key); },
    };
  },
}));
vi.mock("stripe", () => ({ default: class {
  checkout = { sessions: { create: sandbox.create, retrieve: sandbox.retrieve } };
} }));

import { handler as auth } from "../../netlify/functions/auth";
import { handler as entitlements } from "../../netlify/functions/entitlements";
import createCheckout from "../../api/create-checkout-session";
import verifyCheckout from "../../api/checkout-session";
import funnel from "../../api/funnel";
import { handler as netlifyFunnel } from "../../netlify/functions/funnel";
import { handler as netlifyCreateCheckout } from "../../netlify/functions/create-checkout-session";
import { handler as netlifyVerifyCheckout } from "../../netlify/functions/checkout-session";

const blobs = Buffer.from(JSON.stringify({ url: 'https://blob.invalid', url_uncached: 'https://blob.invalid' })).toString('base64');
const credentials = { email: 'journey@example.test', username: 'journey', password: 'ephemeral-test-password' };
let cookie = '';
const headers = () => ({ host: 'example.test', 'x-forwarded-proto': 'https', cookie });
const event = (route: string, body?: unknown) => ({
  blobs, path: `/api/auth/${route}`, httpMethod: body ? 'POST' : 'GET',
  headers: headers(), body: body ? JSON.stringify(body) : null,
});
function response() {
  return {
    statusCode: 200, body: null as unknown, headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; }, send(body: string) { this.body = body; },
    setHeader(name: string, value: string) { this.headers[name] = value; },
  };
}
function takeCookie(value: string | string[]) {
  const values = Array.isArray(value) ? value : [value];
  for (const entry of values) {
    const pair = entry.split(';')[0];
    const key = pair.split('=')[0];
    cookie = [...cookie.split('; ').filter((part) => part && !part.startsWith(`${key}=`)), pair].join('; ');
  }
}
async function access() {
  return JSON.parse((await entitlements({ blobs, headers: headers(), httpMethod: 'GET' })).body).access.tier;
}

beforeEach(() => {
  sandbox.stores.clear(); vi.clearAllMocks(); cookie = '';
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request in mock journey'); }));
  vi.stubEnv('AUTH_SECRET', 'ephemeral-auth-secret-for-tests-only');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_ephemeral_mock');
  vi.stubEnv('STRIPE_PREMIUM_PRICE_ID', 'price_mock_monthly');
  vi.stubEnv('STRIPE_ONE_TIME_PRICE_ID', 'price_mock_event');
  vi.stubEnv('PUBLIC_APP_URL', 'https://example.test');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('provider-mocked account and checkout journeys', () => {
  it('accepts funnel telemetry without exposing stored checkout IDs through either GET route', async () => {
    const sessionId = 'cs_test_private_checkout';
    const posted = response();
    await funnel({ blobs, method: 'POST', headers: headers(), body: {
      name: 'checkout_started', sessionId,
    } }, posted);
    expect(posted.statusCode).toBe(200);

    const direct = response();
    await funnel({ blobs, method: 'GET', headers: headers() }, direct);
    expect(direct.statusCode).toBe(405);
    expect(JSON.stringify(direct.body)).not.toContain(sessionId);

    const netlify = await netlifyFunnel({ blobs, httpMethod: 'GET', headers: headers(), body: null });
    expect(netlify.statusCode).toBe(405);
    expect(netlify.body).not.toContain(sessionId);
  });

  it.each(['premium', 'one-time'])('signup → login → %s checkout → access → logout → denial', async (mode) => {
    expect(await access()).toBe('free');
    const signup = await auth(event('signup', credentials));
    expect(signup.statusCode).toBe(200);
    const user = JSON.parse(signup.body).user;
    expect(user).not.toHaveProperty('passwordHash');
    expect(signup.headers['Set-Cookie']).toContain('HttpOnly');
    expect(signup.headers['Set-Cookie']).toContain('Secure');
    takeCookie(signup.headers['Set-Cookie']);
    const oldAuthCookie = cookie;
    await auth(event('logout', {}));
    expect(JSON.parse((await auth(event('me'))).body).user).toBeNull();
    expect((await auth(event('login', { login: credentials.email, password: 'wrong-password' }))).statusCode).toBe(401);
    const login = await auth(event('login', { login: credentials.username, password: credentials.password }));
    expect(login.statusCode).toBe(200);
    takeCookie(login.headers['Set-Cookie']);
    expect(cookie).not.toBe(oldAuthCookie);
    expect(await access()).toBe('free');

    sandbox.create.mockResolvedValue({ id: 'cs_test_journey', url: 'https://checkout.stripe.com/mock', mode: mode === 'premium' ? 'subscription' : 'payment' });
    const checkout = response();
    await createCheckout({ blobs, headers: headers(), method: 'POST', body: {
      mode, trial: false, customerEmail: 'forged@example.test', clientReferenceId: 'forged',
    } }, checkout);
    expect(checkout.statusCode).toBe(200);
    expect(checkout.headers['Set-Cookie']).toContain('HttpOnly');
    takeCookie(checkout.headers['Set-Cookie']);
    expect(sandbox.create).toHaveBeenCalledWith(expect.objectContaining({
      customer_email: credentials.email, client_reference_id: user.id,
      mode: mode === 'premium' ? 'subscription' : 'payment',
      line_items: [{ price: mode === 'premium' ? 'price_mock_monthly' : 'price_mock_event', quantity: 1 }],
      cancel_url: 'https://example.test/?checkout=cancelled',
    }));
    expect(await access()).toBe('free'); // Creating a session is not payment.

    const session = {
      id: 'cs_test_journey', mode: mode === 'premium' ? 'subscription' : 'payment',
      client_reference_id: user.id, customer_email: credentials.email,
      subscription: mode === 'premium' ? 'sub_mock' : null, payment_intent: 'pi_mock',
      status: 'complete', payment_status: 'paid',
      metadata: (sandbox.create.mock.calls[0]?.[0] as { metadata: Record<string, string> }).metadata,
    };
    sandbox.retrieve.mockResolvedValue(session);
    const verified = response();
    await verifyCheckout({ blobs, method: 'GET', headers: headers(), query: { session_id: session.id } }, verified);
    expect(verified.body).toMatchObject({ paid: true, entitlement: { status: 'active' } });
    takeCookie(verified.headers['Set-Cookie']);
    expect(await access()).toBe(mode === 'premium' ? 'premium' : 'event');

    const paidCookies = cookie;
    const logout = await auth(event('logout', {}));
    takeCookie(logout.headers['Set-Cookie']);
    const cleared = await entitlements({ blobs, headers: headers(), httpMethod: 'POST' });
    takeCookie(cleared.headers['Set-Cookie']);
    expect(await access()).toBe('free');
    cookie = paidCookies; // A revoked server session must not work even if replayed.
    expect(await access()).toBe('free');
  });

  it('rejects a copied paid guest checkout ID but accepts its originating browser', async () => {
    sandbox.create.mockResolvedValue({ id: 'cs_test_guest', url: 'https://checkout.stripe.com/mock', mode: 'payment' });
    const checkout = await netlifyCreateCheckout({
      blobs, httpMethod: 'POST', headers: { ...headers(), 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'one-time', customerEmail: 'guest@example.test' }),
    });
    expect(checkout.statusCode).toBe(200);
    const checkoutCookie = checkout.headers['Set-Cookie'];
    expect(checkoutCookie).toContain('HttpOnly');
    expect(checkoutCookie).toContain('SameSite=Lax');
    expect(checkoutCookie).toContain('Secure');
    const created = sandbox.create.mock.calls[0]?.[0] as { metadata: Record<string, string> };
    expect(created.metadata.checkout_claim_hash).toMatch(/^[a-f0-9]{64}$/);
    sandbox.retrieve.mockResolvedValue({
      id: 'cs_test_guest', mode: 'payment', status: 'complete', payment_status: 'paid',
      customer_email: 'guest@example.test', customer: 'cus_guest', payment_intent: 'pi_guest',
      metadata: created.metadata,
    });

    const stolen = await netlifyVerifyCheckout({
      blobs, httpMethod: 'GET', headers: headers(), body: null,
      queryStringParameters: { session_id: 'cs_test_guest' },
    });
    expect(stolen.statusCode).toBe(403);
    expect(JSON.parse(stolen.body)).toMatchObject({ code: 'checkout_not_owned' });
    expect(stolen.body).not.toContain('cus_guest');
    expect(stolen.headers['Set-Cookie']).toBeUndefined();

    takeCookie(checkoutCookie);
    const rightful = await netlifyVerifyCheckout({
      blobs, httpMethod: 'GET', headers: headers(), body: null,
      queryStringParameters: { session_id: 'cs_test_guest' },
    });
    expect(rightful.statusCode).toBe(200);
    expect(JSON.parse(rightful.body)).toMatchObject({ paid: true, entitlement: { status: 'active' } });
    expect(rightful.headers['Set-Cookie']).toContain('HttpOnly');
  });

  it('does not redeem a legacy guest checkout ID without an ownership claim', async () => {
    sandbox.retrieve.mockResolvedValue({
      id: 'cs_test_legacy_guest', mode: 'payment', status: 'complete', payment_status: 'paid',
      customer_email: 'victim@example.test', customer: 'cus_victim', payment_intent: 'pi_victim',
    });
    const result = response();
    await verifyCheckout({ blobs, method: 'GET', headers: headers(), query: { session_id: 'cs_test_legacy_guest' } }, result);
    expect(result.statusCode).toBe(403);
    expect(result.headers['Set-Cookie']).toBeUndefined();
  });

  it('lets the original signed-in buyer redeem a legacy checkout but denies another account', async () => {
    const owner = await auth(event('signup', credentials));
    expect(owner.statusCode).toBe(200);
    const ownerId = JSON.parse(owner.body).user.id as string;
    takeCookie(owner.headers['Set-Cookie']);
    const ownerCookie = cookie;
    cookie = '';

    const other = await auth(event('signup', {
      email: 'other@example.test', username: 'other', password: 'other-test-password',
    }));
    expect(other.statusCode).toBe(200);
    takeCookie(other.headers['Set-Cookie']);
    sandbox.retrieve.mockResolvedValue({
      id: 'cs_test_legacy_owner', mode: 'payment', status: 'complete', payment_status: 'paid',
      client_reference_id: ownerId, customer_email: credentials.email,
      customer: 'cus_owner', payment_intent: 'pi_owner',
    });

    const stolen = response();
    await verifyCheckout({ blobs, method: 'GET', headers: headers(), query: { session_id: 'cs_test_legacy_owner' } }, stolen);
    expect(stolen.statusCode).toBe(403);
    expect(stolen.headers['Set-Cookie']).toBeUndefined();

    cookie = ownerCookie;
    const rightful = response();
    await verifyCheckout({ blobs, method: 'GET', headers: headers(), query: { session_id: 'cs_test_legacy_owner' } }, rightful);
    expect(rightful.statusCode).toBe(200);
    expect(rightful.headers['Set-Cookie']).toContain('HttpOnly');
  });

  it.each([
    ['open', 'unpaid'], ['expired', 'unpaid'], ['complete', 'unpaid'],
  ])('denies interrupted checkout (%s / %s)', async (status, payment_status) => {
    sandbox.create.mockResolvedValue({ id: 'cs_test_interrupted', url: 'https://checkout.stripe.com/mock', mode: 'payment' });
    const checkout = response();
    await createCheckout({ blobs, method: 'POST', headers: headers(), body: { mode: 'one-time' } }, checkout);
    takeCookie(checkout.headers['Set-Cookie']);
    const created = sandbox.create.mock.calls[0]?.[0] as { metadata: Record<string, string> };
    sandbox.retrieve.mockResolvedValue({ id: 'cs_test_interrupted', mode: 'payment', status, payment_status, metadata: created.metadata });
    const result = response();
    await verifyCheckout({ blobs, method: 'GET', headers: headers(), query: { session_id: 'cs_test_interrupted' } }, result);
    expect(result.body).toMatchObject({ paid: false, entitlement: null });
    expect(result.headers['Set-Cookie']).toBeUndefined();
    expect(await access()).toBe('free');
  });

  it('returns an actionable checkout error without granting access when Stripe fails', async () => {
    sandbox.create.mockRejectedValue(new Error('Mock provider unavailable'));
    const result = response();
    await createCheckout({ blobs, method: 'POST', headers: headers(), body: { mode: 'premium' } }, result);
    expect(result.statusCode).toBe(500);
    expect(result.body).toMatchObject({ success: false, code: 'stripe_checkout_error' });
    expect(await access()).toBe('free');
  });
});
