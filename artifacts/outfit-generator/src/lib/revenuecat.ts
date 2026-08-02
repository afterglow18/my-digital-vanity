/**
 * RevenueCat integration — initializes purchases on iOS and wraps
 * the purchase/restore flows. All functions are safe to call on web
 * (they return immediately with sensible defaults).
 */

import { Capacitor } from "@capacitor/core";
import type { PurchasesPackage } from "@revenuecat/purchases-capacitor";

const IOS_KEY  = import.meta.env.VITE_REVENUECAT_IOS_API_KEY  as string | undefined;
const TEST_KEY = import.meta.env.VITE_REVENUECAT_TEST_API_KEY as string | undefined;

// Track initialization so paywalls can await it before fetching offerings.
let _initPromise: Promise<void> | null = null;
let _initDone = false;

/** Initialize RevenueCat. Call once on app startup before first render. */
export async function initializeRevenueCat(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (_initDone) return;
  if (_initPromise) return _initPromise;

  const apiKey = IOS_KEY ?? TEST_KEY;
  if (!apiKey) {
    console.warn("[RevenueCat] No API key configured — in-app purchases unavailable.");
    return;
  }

  _initPromise = (async () => {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    await Purchases.configure({ apiKey });
    _initDone = true;
    console.log("[RevenueCat] Initialized.");
  })();

  return _initPromise;
}

/** Wait for RC to finish initializing before making SDK calls. */
async function ensureInitialized(): Promise<void> {
  if (_initDone) return;
  if (_initPromise) return _initPromise;
  // If initializeRevenueCat() was never called (e.g. timing edge), init now.
  return initializeRevenueCat();
}

// ── Offerings ────────────────────────────────────────────────────────────────

export interface RCPackage {
  /** Our internal product key (monthly | annual | lifetime) */
  product: "monthly" | "annual" | "lifetime";
  /** Native package — passed directly to purchasePackage() */
  pkg: PurchasesPackage;
  /** Localised price string from the store e.g. "$1.99" */
  priceString: string;
}

/**
 * Fetch the current RevenueCat offering and map packages to our product keys.
 *
 * Returns null on web (dev always runs in free mode).
 * Throws on native if offerings cannot be loaded so callers can show a retry.
 */
export async function fetchRCPackages(): Promise<RCPackage[]> {
  if (!Capacitor.isNativePlatform()) return [];

  await ensureInitialized();

  const { Purchases } = await import("@revenuecat/purchases-capacitor");
  const offerings = await Purchases.getOfferings();

  // Use the default (current) offering; fall back to the first available one.
  const offering =
    offerings.current ??
    (offerings.all ? Object.values(offerings.all)[0] ?? null : null);

  if (!offering) {
    console.error(
      "[RevenueCat] No offering available. " +
      "Check that a 'Default' offering is set in the RevenueCat dashboard " +
      "and products are synced with App Store Connect.",
    );
    throw new Error("No offering configured in RevenueCat.");
  }

  const productKeys: Array<"monthly" | "annual" | "lifetime"> = ["monthly", "annual", "lifetime"];

  // Three-tier lookup per plan key:
  // 1. RC shortcut (matches by packageType — works regardless of package identifier)
  // 2. Standard RC package identifier ($rc_*)
  // 3. App Store product identifier (mdc_* — matches even if packageType wasn't set)
  const rcIdentifiers: Record<string, string> = {
    monthly:  "$rc_monthly",
    annual:   "$rc_annual",
    lifetime: "$rc_lifetime",
  };
  const productIdentifiers: Record<string, string> = {
    monthly:  "mdc_monthly",
    annual:   "mdc_annual",
    lifetime: "mdc_lifetime",
  };

  const result: RCPackage[] = [];

  for (const key of productKeys) {
    const shortcut =
      key === "annual"   ? offering.annual   :
      key === "lifetime" ? offering.lifetime  :
                           offering.monthly;

    const pkg =
      shortcut ??
      offering.availablePackages.find((p) => p.identifier === rcIdentifiers[key]) ??
      offering.availablePackages.find((p) => p.product.identifier === productIdentifiers[key]) ??
      null;

    if (pkg) {
      result.push({
        product:     key,
        pkg,
        priceString: pkg.product.priceString,
      });
    } else {
      console.warn(
        `[RevenueCat] Package '${key}' not found. ` +
        `Tried shortcut, identifier '${rcIdentifiers[key]}', ` +
        `and productIdentifier '${productIdentifiers[key]}' ` +
        `in offering '${offering.identifier}'.`,
      );
    }
  }

  if (result.length === 0) {
    throw new Error(
      "Offering found but contains no matching packages. " +
      "Ensure monthly, annual, and lifetime packages are added to the current offering.",
    );
  }

  return result;
}

/**
 * Check whether the user has an active "unlock" or "premium" entitlement.
 * Returns false on web (dev always runs in free mode).
 */
export async function checkSubscription(): Promise<"unlock" | "premium" | false> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await ensureInitialized();
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { customerInfo } = await Purchases.getCustomerInfo();
    if (customerInfo.entitlements.active["premium"]) return "premium";
    if (customerInfo.entitlements.active["unlock"])  return "unlock";
    return false;
  } catch (err) {
    console.error("[RevenueCat] checkSubscription error:", err);
    return false;
  }
}

export type PurchaseResult = "success" | "cancelled" | "unavailable";

/**
 * Purchase a pre-fetched RC package. Always use a package from fetchRCPackages()
 * to avoid a redundant getOfferings() call and to surface errors at paywall-load
 * time rather than at purchase-tap time.
 */
export async function purchaseRCPackage(pkg: PurchasesPackage): Promise<PurchaseResult> {
  if (!Capacitor.isNativePlatform()) {
    console.warn("[RevenueCat] In-app purchases unavailable on web.");
    return "unavailable";
  }
  try {
    await ensureInitialized();
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    if (customerInfo.entitlements.active["premium"]) return "success";
    if (customerInfo.entitlements.active["unlock"])  return "success";
    return "cancelled";
  } catch (err: unknown) {
    const code = String((err as { code?: string })?.code ?? "");
    const msg  = String((err as Error)?.message ?? "");
    if (
      code.includes("PURCHASE_CANCELLED") ||
      code === "1" ||
      msg.toLowerCase().includes("cancel")
    ) {
      return "cancelled";
    }
    console.error("[RevenueCat] purchaseRCPackage error:", err);
    return "unavailable";
  }
}

/**
 * @deprecated Use purchaseRCPackage(pkg) with a pre-fetched package instead.
 * Kept for any callers that haven't migrated yet.
 */
export async function purchaseProduct(
  product: "monthly" | "annual" | "lifetime",
): Promise<PurchaseResult> {
  try {
    const packages = await fetchRCPackages();
    const found = packages.find((p) => p.product === product);
    if (!found) return "unavailable";
    return purchaseRCPackage(found.pkg);
  } catch (err) {
    console.error("[RevenueCat] purchaseProduct error:", err);
    return "unavailable";
  }
}

/** Restore previous purchases. Returns the active tier, or false if none. */
export async function restorePurchases(): Promise<"unlock" | "premium" | false> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await ensureInitialized();
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { customerInfo } = await Purchases.restorePurchases();
    if (customerInfo.entitlements.active["premium"]) return "premium";
    if (customerInfo.entitlements.active["unlock"])  return "unlock";
    return false;
  } catch (err) {
    console.error("[RevenueCat] restorePurchases error:", err);
    return false;
  }
}
