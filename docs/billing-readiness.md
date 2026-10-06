# Billing readiness and account journeys

Use separate signals for endpoint health, required configuration, and mocked user behavior.
A green health smoke is not evidence that customers can pay and receive access.

## Strict configuration gate (read-only)

```sh
READINESS_BASE_URL=https://aiadvantagesports.com npm run test:readiness
```

The target is mandatory. This script makes only anonymous GET requests, follows no
redirects, uses a 15-second timeout per request, and exits nonzero if any required
flag is false, missing, or not a boolean; an endpoint fails; auth has no persistent
store; or anonymous access is not free. Both monthly and one-time prices, Stripe
secret, webhook secret, entitlement storage, and both checkout-ready flags must
be true. It does not output credentials or response bodies.

This is a **configuration gate**, not an end-to-end payment certification.
`billing-status` reports configuration presence, not whether Stripe accepts a key,
whether prices are active/in the correct mode, whether a dedicated auth pepper is
configured, or whether webhook delivery/storage writes work. The auth check reads
the configured store mode, but does not create an account or prove a storage write.

The existing `npm run test:smoke` remains permissive about missing Stripe
configuration. Its checkout test can create a real Checkout Session when billing
is configured; use the GET-only readiness gate when no live writes are authorized.

## Credential-free automated journeys

```sh
npm ci
npm test                      # includes handler/client journeys and gate regressions
npm run test:journeys          # focused handler/client integration tests
npx tsc -b --force
npm run lint
npx playwright install chromium
npm run test:browser           # builds production UI, starts local preview, runs browser tests
```

Handler journeys run actual auth, checkout, verification, and entitlement code with
in-memory Netlify Blobs and mocked Stripe SDK calls. Password hashing, cookie
creation/revocation, logged-in checkout identity, premium/event grants, and unpaid
or expired checkout denial run together. Credentials and accounts exist only in
memory; unexpected fetches fail. Regression cases replay cookies after logout and
check that failed/late entitlement refreshes cannot preserve or restore access.

Playwright runs the built production UI in desktop Chromium and Pixel 7 mobile
emulation. It exercises signup, invalid and valid login, checkout initiation,
mocked paid return, reload, logout, denial, cancelled/unpaid/error checkout, forged
local storage, and mobile page overflow. Every API request is intercepted; external
browser traffic is blocked. Hosted Stripe checkout is replaced with a local return
URL. No card is submitted and no external account, entitlement, or payment is created.

Existing CI runs `npm test`, including these handler/client/gate regressions, and
checks the new TypeScript tests through the root project references. The separate
Browser journeys CI job installs Chromium and runs `test:browser` on pull requests and the configured branch pushes, using the same intercepted APIs
and blocked external browser traffic as local tests. It needs no application secrets.
Failure traces are retained for seven days. `test:all` retains its existing meaning (Vitest plus
live smoke) and excludes Playwright specs. Browser traces on failure live under
`test-results/` and are ignored by Git.

## Remaining release verification

Before declaring the complete payment flow verified, use an explicitly authorized
Stripe test-mode sandbox and disposable account to check hosted checkout, the
webhook signature and delivery, storage persistence, refresh/re-login, expiry or
cancellation, and logout. Check both monthly and event plans, including interruption
on an actual mobile browser. Provider mocks and device emulation do not prove those
external integrations. Never use live charges as a substitute for test-mode validation.

### Logout failures and concurrent refreshes

Entitlement logout always sends the expiring HttpOnly cookie, including when the
store is unavailable or deletion throws. In that case it returns HTTP 503 with
`success: false` and `revoked: false`: the browser cookie is cleared, but a retained
copy of the old token may still be valid. Server revocation is not claimed.

The client locks access immediately and reports unconfirmed logout in its toast.
A deny-only browser-storage marker blocks background entitlement refreshes across
reloads until explicit sign-in or a newly initiated checkout. It cannot grant
access. This also protects the browser when a transport failure prevents receipt
of the cookie-expiry response. Explicit reauthentication can restore legitimate
paid access. Do not describe a failed revocation as invalidating every token copy.

Refresh ordering uses a latest-request sequence independently of explicit session
invalidation. An ordinary free response does not invalidate a newer authenticated
request. Tests cover both completion orders, overlapping bootstrap/login/focus,
late failures, logout during refresh, backend recovery, and page reload.
