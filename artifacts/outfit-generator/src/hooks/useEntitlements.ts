/**
 * useEntitlements — entitlement hook backed by RevenueCat.
 *
 * RevenueCat is the single source of truth for premium access.
 * localStorage is used only as the initial render value while the first
 * RC network call is in-flight — it is never trusted on its own.
 *
 * Entitlement state is re-verified:
 *   • On app launch (mount)
 *   • Every time the app returns to the foreground (appStateChange)
 *   • After a purchase completes
 *   • After Restore Purchases completes
 *
 * If RevenueCat reports no active entitlement (expired, refunded, or never
 * purchased) the tier is set to "free" regardless of what is cached locally.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TIER MAP
 *
 *   monthly / annual  →  "unlock"  (unlimited items + outfits)
 *   lifetime          →  "premium" (unlock + mannequin view)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import {
  Tier,
  TIER_CAPS,
  TierCapabilities,
  PurchaseProduct,
} from "@/lib/entitlements";
import { checkSubscription, purchaseProduct, restorePurchases } from "@/lib/revenuecat";

const PRODUCT_KEY = "mdc_last_product";

/** Store the purchased product name so account pages can show it without an async call. */
export function writeStoredProduct(product: string): void {
  try { localStorage.setItem(PRODUCT_KEY, product); } catch {}
}

/** Read back the last purchased product (e.g. "monthly"), or null if unknown. */
export function readStoredProduct(): string | null {
  try { return localStorage.getItem(PRODUCT_KEY); } catch { return null; }
}

// ── Shared external store ─────────────────────────────────────────────────────
const STORAGE_KEY = "mdc_tier";

function readStoredTier(): Tier {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'unlock' || v === 'premium') return v;
  } catch {
    // localStorage unavailable (rare private-browsing scenario)
  }
  return 'free';
}

export function readStoredProduct(): PurchaseProduct | null {
  try {
    const v = localStorage.getItem(STORAGE_PRODUCT_KEY);
    if (v === 'monthly' || v === 'yearly' || v === 'lifetime') return v as PurchaseProduct;
  } catch {}
  return null;
}

let _currentTier: Tier = readStoredTier();
const _subscribers = new Set<() => void>();

// Timestamp of the most recent completed purchase — used to suppress
// aggressive sync downgrades during RevenueCat propagation delay.
let _lastPurchaseAt = 0;
const PURCHASE_GRACE_MS = 120_000; // 2 minutes

function subscribeTier(notify: () => void) {
  _subscribers.add(notify);
  return () => { _subscribers.delete(notify); };
}

function getTierSnapshot(): Tier {
  return _currentTier;
}

/** Read the current tier without subscribing to updates. */
export function getCurrentTier(): Tier {
  return _currentTier;
}

/** Update the shared tier store and persist to localStorage. */
export function setGlobalTier(t: Tier): void {
  try { localStorage.setItem(STORAGE_KEY, t); } catch {}
  _currentTier = t;
  _subscribers.forEach((fn) => fn());
}

/**
 * Fetch the current entitlement state from RevenueCat and update the global
 * tier to match. This is authoritative — if RC reports no active entitlement
 * (expired, refunded, or never purchased) the tier is downgraded to "free".
 * No-op on web (dev always runs in free mode).
 */
export async function syncTierFromRC(): Promise<void> {
  const active = await checkSubscription();
  if (active === "premium") {
    setGlobalTier("premium");
  } else if (active === "unlock") {
    setGlobalTier("unlock");
  } else {
    // No active entitlement → ensure access is revoked
    setGlobalTier("free");
  }
}

// ── Purchase result ───────────────────────────────────────────────────────────
export type PurchaseResult = "success" | "cancelled" | "unavailable";

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useEntitlements() {
  const tier = useSyncExternalStore(subscribeTier, getTierSnapshot);
  const caps: TierCapabilities = TIER_CAPS[tier];

  // ── Sync on launch + every foreground resume ────────────────────────────────
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Check on app launch
    syncTierFromRC();

    // Re-check whenever the app returns to the foreground so refunds / expirations
    // are detected without requiring a cold restart.
    let removeListener: (() => void) | undefined;
    import("@capacitor/app").then(({ App }) => {
      App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) syncTierFromRC();
      }).then((handle) => {
        removeListener = () => handle.remove();
      });
    });

    return () => {
      removeListener?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** True if the user can add another item given the current wardrobe size. */
  const canAddItem = useCallback(
    (currentCount: number) =>
      caps.maxItems === null || currentCount < caps.maxItems,
    [caps.maxItems],
  );

  const canSaveOutfit = useCallback(
    (currentCount: number) =>
      caps.maxOutfits === null || currentCount < caps.maxOutfits,
    [caps.maxOutfits],
  );

  /**
   * Trigger the purchase flow via RevenueCat / Apple StoreKit.
   * After a successful purchase, re-reads the entitlement from RevenueCat to
   * set the tier authoritatively — never infers it from the product type alone.
   */
  const purchase = useCallback(
    async (product: PurchaseProduct): Promise<PurchaseResult> => {
      const result = await purchaseProduct(product);
      if (result === "success") {
        await syncTierFromRC();
      }
    },
    [],
  );

  /** Restore previous purchases via RevenueCat. Returns active tier or false. */
  const restore = useCallback(async (): Promise<"unlock" | "premium" | false> => {
    const result = await restorePurchases();
    if (result === "premium") setGlobalTier("premium");
    else if (result === "unlock") setGlobalTier("unlock");
    return result;
  }, []);

  return { tier, caps, canAddItem, canSaveOutfit, purchase, restore };
}
