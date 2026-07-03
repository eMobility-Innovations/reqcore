/**
 * Configures the Stripe Customer Portal so customers can switch between plans.
 *
 * Why this exists
 * ---------------
 * Our plans are single-price tiers (one recurring price each, no seats / line
 * items — see server/utils/billing/stripe-plans.ts). When an org with an active
 * subscription switches tiers, @better-auth/stripe's `subscription.upgrade`
 * routes the change through a Customer Portal `subscription_update_confirm`
 * flow rather than a direct API update. If the portal's "Switch plans" feature
 * is disabled, Stripe rejects that session with:
 *
 *   "This subscription cannot be updated because the subscription update
 *    feature in the portal configuration is disabled."
 *
 * better-auth always uses the account's DEFAULT portal configuration (it never
 * passes a `configuration` id), so this script enables `subscription_update`
 * (and the products customers may move between) on that default config.
 *
 * It is idempotent — safe to re-run. Run it once per Stripe mode:
 *   npx tsx server/scripts/configure-stripe-portal.ts            (uses STRIPE_SECRET_KEY from .env)
 *   STRIPE_SECRET_KEY=sk_live_... npx tsx server/scripts/configure-stripe-portal.ts
 */

import Stripe from "stripe";

const processWithLoadEnv = process as NodeJS.Process & {
  loadEnvFile?: (path?: string) => void;
};

if (
  !process.env.STRIPE_SECRET_KEY &&
  typeof processWithLoadEnv.loadEnvFile === "function"
) {
  try {
    processWithLoadEnv.loadEnvFile(".env");
  } catch {
    // .env is optional in hosted environments
  }
}

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error("STRIPE_SECRET_KEY is not set. Add it to .env or pass it inline.");
  process.exit(1);
}

// The six price ids that make up the self-serve plans. Customers must be able to
// switch freely between every one of these, so they all go in the portal's
// allowed-products list.
const PRICE_ENV_KEYS = [
  "STRIPE_PRICE_SOLO_MONTHLY",
  "STRIPE_PRICE_SOLO_ANNUAL",
  "STRIPE_PRICE_TEAM_MONTHLY",
  "STRIPE_PRICE_TEAM_ANNUAL",
  "STRIPE_PRICE_SCALE_MONTHLY",
  "STRIPE_PRICE_SCALE_ANNUAL",
] as const;

async function main() {
  const stripe = new Stripe(secretKey!);
  const mode = secretKey!.startsWith("sk_live_") ? "LIVE" : "TEST";
  console.info(`[stripe-portal] Configuring ${mode} customer portal…`);

  const priceIds = PRICE_ENV_KEYS.map((key) => {
    const value = process.env[key];
    if (!value) {
      console.error(`Missing ${key} in env — cannot configure the portal without every plan price.`);
      process.exit(1);
    }
    return value;
  });

  // Stripe's subscription_update feature lists *products*, each with the prices
  // a customer may switch to. Resolve every price → its product, then group.
  const pricesByProduct = new Map<string, Set<string>>();
  for (const priceId of priceIds) {
    const price = await stripe.prices.retrieve(priceId);
    const productId = typeof price.product === "string" ? price.product : price.product.id;
    const set = pricesByProduct.get(productId) ?? new Set<string>();
    set.add(priceId);
    pricesByProduct.set(productId, set);
  }

  const products: Stripe.BillingPortal.ConfigurationUpdateParams.Features.SubscriptionUpdate.Product[] =
    [...pricesByProduct.entries()].map(([product, prices]) => ({
      product,
      prices: [...prices],
    }));

  console.info(
    `[stripe-portal] ${products.length} product(s), ${priceIds.length} price(s) eligible for switching.`,
  );

  // better-auth uses the account's default portal configuration. Find it.
  const configs = await stripe.billingPortal.configurations.list({ limit: 100 });
  const defaultConfig = configs.data.find((c) => c.is_default);

  const subscriptionUpdate: Stripe.BillingPortal.ConfigurationCreateParams.Features.SubscriptionUpdate =
    {
      enabled: true,
      default_allowed_updates: ["price"],
      proration_behavior: "create_prorations",
      products,
    };

  if (defaultConfig) {
    const updated = await stripe.billingPortal.configurations.update(defaultConfig.id, {
      features: { subscription_update: subscriptionUpdate },
    });
    console.info(
      `[stripe-portal] ✓ Updated default portal config ${updated.id} — "Switch plans" is now enabled.`,
    );
  } else {
    // No portal configuration exists yet (fresh account). Create one; the first
    // configuration becomes the account default automatically.
    const created = await stripe.billingPortal.configurations.create({
      business_profile: {
        headline: "Manage your Reqcore subscription",
      },
      features: {
        subscription_update: subscriptionUpdate,
        subscription_cancel: { enabled: true, mode: "at_period_end" },
        payment_method_update: { enabled: true },
        invoice_history: { enabled: true },
      },
    });
    console.info(
      `[stripe-portal] ✓ Created default portal config ${created.id} — "Switch plans" is enabled.`,
    );
  }

  console.info("[stripe-portal] Done. Plan switching will now work for existing subscribers.");
}

main().catch((err) => {
  console.error("[stripe-portal] Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
