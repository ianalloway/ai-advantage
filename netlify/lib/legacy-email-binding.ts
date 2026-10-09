import {
  bindEntitlementToUser,
  findActiveEntitlementsByPurchaseEmail,
  type EntitlementStore,
} from "../functions/_lib/entitlements";

/**
 * One-time migration for the end of email-based entitlement lookup.
 *
 * Before the cutoff (the deploy that removed email lookup), an account reached
 * any purchase made with its email. This binds exactly those pre-existing
 * pairs to the account id, so nobody who had access loses it on deploy:
 * an active, still-unbound purchase activated before the cutoff, matched to an
 * account created before the cutoff. Anything created after the cutoff is left
 * to the restore link, which proves email ownership.
 *
 * Email was never verified, so a pair can be a squat that already existed
 * before the deploy. `plan` flags accounts that predate the purchase they
 * would receive so the operator can review and exclude them before applying.
 */
export interface LegacyAccount {
  id: string;
  email: string;
  createdAt: string;
}

export interface LegacyBinding {
  userId: string;
  email: string;
  entitlementId: string;
  tier: string;
  accountCreatedAt: string;
  purchaseActivatedAt: string;
  accountPredatesPurchase: boolean;
}

export interface AmbiguousEmail {
  email: string;
  userIds: string[];
  entitlementIds: string[];
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

/**
 * The bindings email lookup granted at the cutoff. An email shared by more
 * than one account (possible through a signup race) is not bound to anyone and
 * is reported for manual review instead.
 */
export async function planLegacyEmailBindings(
  store: EntitlementStore,
  accounts: LegacyAccount[],
  cutoff: Date,
): Promise<{ plan: LegacyBinding[]; ambiguous: AmbiguousEmail[] }> {
  const before = (iso: string) => new Date(iso).getTime() < cutoff.getTime();
  const byEmail = new Map<string, LegacyAccount[]>();
  for (const account of accounts.filter((candidate) => candidate.id && candidate.email && before(candidate.createdAt))) {
    const email = normalizeEmail(account.email);
    byEmail.set(email, [...(byEmail.get(email) ?? []), account]);
  }

  const plan: LegacyBinding[] = [];
  const ambiguous: AmbiguousEmail[] = [];
  for (const [email, owners] of byEmail) {
    const purchases = (await findActiveEntitlementsByPurchaseEmail(store, email)).filter(
      (purchase) => !purchase.userId && before(purchase.activatedAt),
    );
    if (purchases.length === 0) continue;
    if (owners.length > 1) {
      ambiguous.push({
        email,
        userIds: owners.map((owner) => owner.id),
        entitlementIds: purchases.map((purchase) => purchase.id),
      });
      continue;
    }
    const [account] = owners;
    plan.push(
      ...purchases.map((purchase) => ({
        userId: account.id,
        email,
        entitlementId: purchase.id,
        tier: purchase.tier,
        accountCreatedAt: account.createdAt,
        purchaseActivatedAt: purchase.activatedAt,
        accountPredatesPurchase: new Date(account.createdAt) < new Date(purchase.activatedAt),
      })),
    );
  }
  return { plan, ambiguous };
}

/**
 * Apply exactly the reviewed pairs from a dry run. Each pair is checked against
 * a freshly computed plan, so a pair that no longer qualifies (bound since,
 * expired, now ambiguous) or was never in the plan is skipped and reported.
 */
export async function applyLegacyEmailBindings(
  store: EntitlementStore,
  currentPlan: LegacyBinding[],
  approved: Array<{ entitlementId: string; userId: string }>,
) {
  const qualifying = new Map(currentPlan.map((binding) => [`${binding.entitlementId}|${binding.userId}`, binding]));
  const applied: LegacyBinding[] = [];
  const skipped: Array<{ entitlementId: string; userId: string; reason: string }> = [];
  for (const pair of approved) {
    const binding = qualifying.get(`${pair.entitlementId}|${pair.userId}`);
    if (!binding) {
      skipped.push({ ...pair, reason: "no longer qualifies" });
      continue;
    }
    if (await bindEntitlementToUser(store, binding.entitlementId, binding.userId)) applied.push(binding);
    else skipped.push({ ...pair, reason: "bind refused" });
  }
  return { applied, skipped };
}
