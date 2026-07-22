/**
 * useEntitlements — entitlement hook backed by RevenueCat.
 *
 * localStorage is a fast-read CACHE for instant UI. RevenueCat is always the
 * authority. syncTierFromRevenueCat() is called on launch, foreground return,
 * after purchase, and after restore — so refunds / expiry auto-downgrade.
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { Purchases } from '@revenuecat/purchases-capacitor';
import type { Tier, TierCapabilities, PurchaseProduct } from '@/types/local';
import { TIER_CAPS, PRODUCT_TIER } from '@/types/local';
import {
  ENTITLEMENT_ID,
  PRODUCT_TIER_MAP,
  getPackageForProduct,
  restoreAndCheck,
} from '@/lib/revenuecat';

// ── Shared external store ─────────────────────────────────────────────────────

const STORAGE_KEY         = 'mdc_tier';
const STORAGE_PRODUCT_KEY = 'mdc_active_product';

function readStoredTier(): Tier {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'unlock' || v === 'premium') return v;
  } catch {
    // private browsing
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

/** Promote (or demote) the tier globally and persist. */
export function setGlobalTier(t: Tier, product?: PurchaseProduct): void {
  try {
    localStorage.setItem(STORAGE_KEY, t);
    if (product) localStorage.setItem(STORAGE_PRODUCT_KEY, product);
    else if (t === 'free') localStorage.removeItem(STORAGE_PRODUCT_KEY);
  } catch {}
  _currentTier = t;
  _subscribers.forEach((fn) => fn());
}

/**
 * Ask RevenueCat for the current CustomerInfo and sync the in-app tier.
 * Called on launch, foreground return, after purchase, and after restore.
 * On network/SDK error the cached value is kept — never punish users for
 * a bad connection.  On confirmed no-entitlement, downgrades to free so
 * refunds and expiries take effect automatically.
 */
export async function syncTierFromRevenueCat(): Promise<void> {
  try {
    const { customerInfo } = await Purchases.getCustomerInfo();
    const active = ENTITLEMENT_ID in (customerInfo.entitlements?.active ?? {});
    if (active) {
      // Only upgrade, never silently downgrade premium → unlock from sync
      if (_currentTier === 'free') setGlobalTier('unlock');
    } else {
      // Confirmed no active entitlement — downgrade (handles refunds & expiry).
      // BUT: skip the downgrade during the grace window after a purchase so
      // RevenueCat propagation delay doesn't immediately wipe a real purchase.
      const withinGrace = Date.now() - _lastPurchaseAt < PURCHASE_GRACE_MS;
      if (!withinGrace) {
        setGlobalTier('free');
      }
    }
  } catch {
    // SDK not configured on web, or network failure — keep cached value
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type PurchaseResult = 'success' | 'cancelled' | 'unavailable';

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useEntitlements() {
  const tier = useSyncExternalStore(subscribeTier, getTierSnapshot);
  const caps: TierCapabilities = TIER_CAPS[tier];

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

  const purchase = useCallback(
    async (product: PurchaseProduct): Promise<PurchaseResult> => {
      try {
        const pkg = await getPackageForProduct(product);
        if (!pkg) {
          console.warn('[RevenueCat] Package not found for product:', product);
          return 'unavailable';
        }

        // If purchasePackage completes without throwing, the purchase succeeded.
        // The SDK throws for user-cancelled and payment errors — a clean return
        // means Apple accepted payment regardless of what entitlements.active
        // contains (which can differ if the entitlement ID in the RC dashboard
        // doesn't match ENTITLEMENT_ID, or due to propagation delay).
        await Purchases.purchasePackage({ aPackage: pkg });

        _lastPurchaseAt = Date.now();
        const newTier: Tier = PRODUCT_TIER_MAP[product] ?? PRODUCT_TIER[product] ?? 'unlock';
        setGlobalTier(newTier, product);
        return 'success';
      } catch (err: any) {
        // userCancelled is thrown as an error by the SDK
        if (err?.code === 'PURCHASE_CANCELLED' || err?.userCancelled === true) {
          return 'cancelled';
        }
        console.error('[RevenueCat] Purchase error:', err);
        return 'unavailable';
      }
    },
    [],
  );

  const restore = useCallback(async (): Promise<PurchaseResult> => {
    try {
      const active = await restoreAndCheck();
      if (active) {
        _lastPurchaseAt = Date.now();
        setGlobalTier('unlock');
        return 'success';
      }
      // Restore confirmed no entitlement — downgrade if currently elevated
      setGlobalTier('free');
      return 'cancelled';
    } catch (err) {
      console.error('[RevenueCat] Restore error:', err);
      return 'unavailable';
    }
  }, []);

  return { tier, caps, canAddItem, canSaveOutfit, purchase, restore };
}
