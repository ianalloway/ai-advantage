import { pathToFileURL } from 'node:url';

export const requiredBillingFlags = [
  'stripeSecretConfigured', 'stripeWebhookConfigured', 'entitlementStoreConfigured',
  'premiumPriceConfigured', 'oneTimePriceConfigured', 'premiumCheckoutReady', 'oneTimeCheckoutReady',
];

// GET only: never creates users, Checkout Sessions, or payments.
export async function checkReadiness(baseUrl, fetcher = fetch) {
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) {
    throw new Error('READINESS_BASE_URL must be an HTTP(S) URL without credentials.');
  }
  const failures = [];
  for (const [path, validate] of [
    ['/api/billing-status', (body) => requiredBillingFlags.filter((key) => body[key] !== true)],
    ['/api/auth/me', (body, response) => [
      ...(body.user !== null ? ['anonymous user must be null'] : []),
      ...(!['redis', 'blobs-strong', 'blobs-eventual'].includes(response.headers.get('x-auth-store'))
        ? ['persistent auth store must be configured'] : []),
    ]],
    ['/api/entitlements/me', (body) => [
      ...(body.configured !== true ? ['entitlement backend must be configured'] : []),
      ...(body.access?.tier !== 'free' ? ['anonymous access must be free'] : []),
    ]],
  ]) {
    try {
      const response = await fetcher(new URL(path, base), {
        method: 'GET', headers: { Accept: 'application/json' },
        redirect: 'error', signal: AbortSignal.timeout(15000),
      });
      if (response.status !== 200) {
        failures.push(`${path}: HTTP ${response.status}`);
        continue;
      }
      const body = await response.json();
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        failures.push(`${path}: invalid JSON object`);
        continue;
      }
      failures.push(...validate(body, response).map((reason) => `${path}: ${reason}`));
    } catch {
      // Do not print response bodies, URLs with query strings, or upstream errors.
      failures.push(`${path}: request failed or invalid JSON`);
    }
  }
  return failures;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.env.READINESS_BASE_URL;
  if (!target) {
    console.error('Set READINESS_BASE_URL explicitly. This check makes read-only requests.');
    process.exitCode = 1;
  } else {
    try {
      const failures = await checkReadiness(target);
      if (failures.length) {
        console.error(`Readiness FAILED:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
        process.exitCode = 1;
      } else {
        console.log('Readiness passed: required configuration flags and anonymous endpoints.');
        console.log('This does not verify Stripe credentials, price validity, webhook delivery, or payment settlement.');
      }
    } catch {
      console.error('Invalid READINESS_BASE_URL. Use an HTTP(S) URL without credentials.');
      process.exitCode = 1;
    }
  }
}
