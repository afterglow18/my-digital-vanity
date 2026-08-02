/**
 * Stripe client removed.
 * Payments are handled exclusively via RevenueCat / Apple In-App Purchases.
 */
export async function getUncachableStripeClient(): Promise<never> {
  throw new Error("Stripe has been removed.");
}

export async function getStripeSync(): Promise<never> {
  throw new Error("Stripe has been removed.");
}
