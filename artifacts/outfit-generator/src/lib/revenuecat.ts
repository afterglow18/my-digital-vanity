/**
 * RevenueCat client — wraps @revenuecat/purchases-capacitor.
 *
 * Works in browser (test store) and native iOS (App Store).
 * Entitlement: "unlock"
 * Packages:    $rc_monthly | $rc_annual ($rc_yearly) | $rc_lifetime
 *
 * CRITICAL: initRevenueCat() returns a Promise. All SDK calls internally
 * await _initPromise via ensureInitialized() so there is no race condition
 * between configure() and the first getOfferings()/getCustomerInfo() call.
 */
import { Purchases } from "@revenuecat/purchases-capacitor";
import type { PurchasesPackage, PurchasesOfferings } from "@revenuecat/purchases-capacitor";
import { Capacitor } from "@capacitor/core";
import type { PurchaseProduct, Tier } from "@/types/local";

const TEST_KEY = import.meta.env.VITE_REVENUECAT_TEST_API_KEY as string | undefined;
// RC iOS public keys are distributed in every app bundle — safe to hardcode.
// The env var is tried first so the key can still be rotated via Codemagic
// without a code change; the hardcoded value is the fallback.
const IOS_KEY  =
  (import.meta.env.VITE_REVENUECAT_IOS_API_KEY as string | undefined) ||
  "appl_ZhdCoWtbocoFgCAlmYmHzWmPzWN";

export const ENTITLEMENT_ID = "unlock";

/** RC package identifiers for each of our product keys */
const PACKAGE_RC_ID: Record<string, string> = {
  monthly:  "$rc_monthly",
  yearly:   "$rc_annual",   // our key "yearly" = RC package type "ANNUAL"
  lifetime: "$rc_lifetime",
};

/** Which tier each product unlocks */
export const PRODUCT_TIER_MAP: Record<PurchaseProduct, Tier> = {
  monthly:  "unlock",
  yearly:   "unlock",
  lifetime: "unlock",
  premium:  "premium",
};

// ── Init promise ──────────────────────────────────────────────────────────────

let _initPromise: Promise<void> | null = null;
let _initDone = false;

/**
 * Initialize RevenueCat. Returns a Promise that resolves when configure()
 * has finished. Safe to call multiple times — subsequent calls return the
 * same Promise so there is no duplicate configure race.
 * No-op on web (returns immediately resolved Promise).
 */
export function initRevenueCat(): Promise<void> {
  if (_initDone) return Promise.resolve();
  if (_initPromise) return _initPromise;

  if (!Capacitor.isNativePlatform()) {
    console.log("[RevenueCat] Web environment — SDK skipped (expected in dev/preview)");
    _initDone = true;
    return Promise.resolve();
  }

  const apiKey = IOS_KEY ?? TEST_KEY;
  if (!apiKey) {
    console.warn("[RevenueCat] No API key found — in-app purchases disabled");
    _initDone = true;
    return Promise.resolve();
  }

  console.log("[RevenueCat] Configuring... (key prefix:", apiKey.slice(0, 8) + "...)");

  _initPromise = Purchases.configure({ apiKey })
    .then(() => {
      _initDone = true;
      console.log("[RevenueCat] Configure complete ✓");
    })
    .catch((e: unknown) => {
      // Don't block callers forever on a configure error — mark done and log
      _initDone = true;
      console.error("[RevenueCat] Configure error:", e);
    });

  return _initPromise;
}

/** Await RC initialization before any SDK call. */
async function ensureInitialized(): Promise<void> {
  if (_initDone) return;
  if (_initPromise) return _initPromise;
  // If initRevenueCat() was never called (e.g. timing edge), init now
  return initRevenueCat();
}

// ── Package type ──────────────────────────────────────────────────────────────

export interface RCPackage {
  /** Our internal product key */
  product: PurchaseProduct;
  /** Native package object — pass directly to purchasePackage() */
  pkg: PurchasesPackage;
  /** Localised price string from StoreKit e.g. "$1.99" */
  priceString: string;
}

/**
 * Fetch all available packages from the current RevenueCat offering.
 *
 * - Awaits RC init before calling the SDK (no race condition).
 * - Falls back to the first available offering if no default is set.
 * - Uses a three-tier package lookup per product so nothing is missed.
 * - Returns [] on web (dev always runs in free mode).
 * - Throws on failure so callers can show error + retry UI.
 */
export async function fetchPackages(): Promise<RCPackage[]> {
  if (!Capacitor.isNativePlatform()) {
    console.log("[RevenueCat] fetchPackages: web — returning []");
    return [];
  }

  await ensureInitialized();

  console.log("[RevenueCat] Fetching offerings...");
  let offerings: PurchasesOfferings;
  try {
    offerings = await Purchases.getOfferings();
  } catch (e) {
    console.error("[RevenueCat] getOfferings() threw:", e);
    throw e;
  }

  // Prefer the dashboard-selected default offering; fall back to first available
  const current =
    offerings.current ??
    (offerings.all ? (Object.values(offerings.all)[0] ?? null) : null);

  if (!current) {
    const allKeys = offerings.all ? Object.keys(offerings.all) : [];
    console.error(
      "[RevenueCat] No offering available.",
      "All offerings:", allKeys.length ? allKeys : "none",
      "→ In RevenueCat dashboard: set a Default offering and ensure products are synced with App Store Connect.",
    );
    throw new Error(
      "No offering found in RevenueCat. Ensure a Default offering is configured in the dashboard.",
    );
  }

  console.log(
    `[RevenueCat] Offering '${current.identifier}' loaded.`,
    `Packages: ${current.availablePackages.map(p => `${p.identifier}(${p.packageType})`).join(", ")}`,
  );

  const products: PurchaseProduct[] = ["monthly", "yearly", "lifetime"];
  const result: RCPackage[] = [];

  for (const product of products) {
    const rcId = PACKAGE_RC_ID[product];

    // Three-tier lookup:
    // 1. RC offering shortcut property (.monthly / .annual / .lifetime) —
    //    matches by packageType regardless of package identifier string
    // 2. RC package identifier ($rc_monthly / $rc_annual / $rc_lifetime)
    // 3. packageType string match (safety net for custom identifiers)
    const shortcut =
      product === "yearly"   ? current.annual   :
      product === "lifetime" ? current.lifetime  :
                               current.monthly;

    const pkg =
      shortcut ??
      current.availablePackages.find(p => p.identifier === rcId) ??
      current.availablePackages.find(p => p.packageType === rcId) ??
      null;

    if (pkg) {
      result.push({ product, pkg, priceString: pkg.product.priceString });
      console.log(
        `[RevenueCat] ✓ '${product}': ${pkg.product.priceString}`,
        `(identifier: ${pkg.identifier}, type: ${pkg.packageType}, storeId: ${pkg.product.identifier})`,
      );
    } else {
      console.warn(
        `[RevenueCat] ✗ Package '${product}' not found.`,
        `Tried shortcut, identifier '${rcId}'.`,
        `Available: ${current.availablePackages.map(p => `${p.identifier}/${p.packageType}`).join(", ")}`,
        `→ Ensure the package is added to the offering in the RevenueCat dashboard.`,
      );
    }
  }

  if (result.length === 0) {
    throw new Error(
      "Offering found but no monthly/yearly/lifetime packages present. " +
      "Add packages to the current offering in the RevenueCat dashboard.",
    );
  }

  console.log(`[RevenueCat] fetchPackages complete — ${result.length}/3 packages loaded.`);
  return result;
}

/**
 * Fetch the offering and find the package for a single product.
 * Uses ensureInitialized() so it is safe to call at any time.
 */
export async function getPackageForProduct(
  product: PurchaseProduct,
): Promise<PurchasesPackage | null> {
  if (!Capacitor.isNativePlatform()) return null;
  await ensureInitialized();

  const rcId = PACKAGE_RC_ID[product] ?? ("$rc_" + product);
  console.log(`[RevenueCat] getPackageForProduct('${product}') — RC id: ${rcId}`);

  let offerings: PurchasesOfferings;
  try {
    offerings = await Purchases.getOfferings();
  } catch (e) {
    console.error("[RevenueCat] getOfferings() threw in getPackageForProduct:", e);
    return null;
  }

  const current =
    offerings.current ??
    (offerings.all ? (Object.values(offerings.all)[0] ?? null) : null);

  if (!current) {
    console.error("[RevenueCat] getPackageForProduct: no offering found");
    return null;
  }

  const shortcut =
    product === "yearly"   ? current.annual   :
    product === "lifetime" ? current.lifetime  :
                             current.monthly;

  const pkg =
    shortcut ??
    current.availablePackages.find((p: PurchasesPackage) => p.identifier === rcId) ??
    current.availablePackages.find((p: PurchasesPackage) => p.packageType === rcId) ??
    null;

  if (!pkg) {
    console.warn(
      `[RevenueCat] getPackageForProduct('${product}'): not found.`,
      `Available: ${current.availablePackages.map((p: PurchasesPackage) => p.identifier).join(", ")}`,
    );
  }

  return pkg;
}

/** Check whether the user currently has the entitlement active. */
export async function getActiveEntitlement(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  await ensureInitialized();
  const { customerInfo } = await Purchases.getCustomerInfo();
  const active = ENTITLEMENT_ID in (customerInfo.entitlements?.active ?? {});
  console.log(
    `[RevenueCat] getActiveEntitlement: ${active}`,
    `Active entitlements: ${Object.keys(customerInfo.entitlements?.active ?? {}).join(", ") || "none"}`,
  );
  return active;
}

/**
 * Purchase a pre-fetched package. Guards with ensureInitialized() so it is
 * safe to call at any point after initRevenueCat() is invoked.
 * Returns the raw customerInfo so callers can inspect entitlements.
 */
export async function purchaseRCPackage(pkg: PurchasesPackage): Promise<import("@revenuecat/purchases-capacitor").CustomerInfo> {
  await ensureInitialized();
  console.log(`[RevenueCat] purchasePackage — identifier: ${pkg.identifier}, storeProduct: ${pkg.product.identifier}`);
  const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
  console.log(
    `[RevenueCat] Purchase complete. Active entitlements: ${Object.keys(customerInfo.entitlements?.active ?? {}).join(", ") || "none"}`,
  );
  return customerInfo;
}

/** Restore previous purchases and return whether the entitlement is now active. */
export async function restoreAndCheck(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  await ensureInitialized();
  console.log("[RevenueCat] Restoring purchases...");
  const { customerInfo } = await Purchases.restorePurchases();
  const active = ENTITLEMENT_ID in (customerInfo.entitlements?.active ?? {});
  console.log(
    `[RevenueCat] Restore result: ${active}`,
    `Active entitlements: ${Object.keys(customerInfo.entitlements?.active ?? {}).join(", ") || "none"}`,
  );
  return active;
}
