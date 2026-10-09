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

export async function planLegacyEmailBindings(
  store: EntitlementStore,
  accounts: LegacyAccount[],
  cutoff: Date,
): Promise<LegacyBinding[]> {
  const before = (iso: string) => new Date(iso).getTime() < cutoff.getTime();
  const plans = await Promise.all(
    accounts
      .filter((account) => account.id && account.email && before(account.createdAt))
      .map(async (account) => {
        const purchases = await findActiveEntitlementsByPurchaseEmail(store, account.email);
        return purchases
          .filter((purchase) => !purchase.userId && before(purchase.activatedAt))
          .map((purchase) => ({
            userId: account.id,
            email: account.email,
            entitlementId: purchase.id,
            tier: purchase.tier,
            accountCreatedAt: account.createdAt,
            purchaseActivatedAt: purchase.activatedAt,
            accountPredatesPurchase: new Date(account.createdAt) < new Date(purchase.activatedAt),
          }));
      }),
  );
  return plans.flat();
}

export async function applyLegacyEmailBindings(
  store: EntitlementStore,
  plan: LegacyBinding[],
  exclude: ReadonlySet<string> = new Set(),
) {
  const applied: LegacyBinding[] = [];
  for (const binding of plan) {
    if (exclude.has(binding.entitlementId)) continue;
    if (await bindEntitlementToUser(store, binding.entitlementId, binding.userId)) applied.push(binding);
  }
  return applied;
}
