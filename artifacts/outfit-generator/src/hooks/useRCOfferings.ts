/**
 * useRCOfferings
 *
 * Fetches the current RevenueCat offering when a paywall mounts.
 * Returns real prices from the store so they are never hardcoded.
 *
 * States:
 *   loading  — waiting for the first fetch
 *   error    — fetch failed (no offering / not configured / network)
 *   ready    — packages available, prices populated from the store
 */
import { useState, useEffect, useCallback } from "react";
import { fetchRCPackages, purchaseRCPackage, type RCPackage } from "@/lib/revenuecat";
import { syncTierFromRC, type PurchaseResult } from "@/hooks/useEntitlements";
import type { PurchaseProduct } from "@/lib/entitlements";

/** Fallback display prices shown only if the store hasn't returned yet. */
const FALLBACK_PRICES: Record<PurchaseProduct, string> = {
  monthly:  "$1.99",
  annual:   "$19.99",
  lifetime: "$9.99",
};

export interface RCOfferingsState {
  loading: boolean;
  /** Set when offerings couldn't be fetched — show a retry button. */
  error: string | null;
  /** Resolved packages with real store prices. Empty while loading. */
  packages: RCPackage[];
  /** Get the display price for a product (real store price or fallback). */
  priceFor: (product: PurchaseProduct) => string;
  /** Trigger a fresh fetch (e.g. after the user taps "Retry"). */
  retry: () => void;
  /** Purchase a product by key using the pre-fetched package. */
  purchase: (product: PurchaseProduct) => Promise<PurchaseResult>;
}

export function useRCOfferings(): RCOfferingsState {
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [packages, setPackages] = useState<RCPackage[]>([]);
  const [tick,     setTick]     = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchRCPackages()
      .then((pkgs) => {
        if (cancelled) return;
        setPackages(pkgs);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[useRCOfferings] fetchRCPackages failed:", msg);
        setError(msg);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [tick]); // re-run on retry

  const retry = useCallback(() => setTick((t) => t + 1), []);

  const priceFor = useCallback(
    (product: PurchaseProduct): string => {
      const found = packages.find((p) => p.product === product);
      return found?.priceString ?? FALLBACK_PRICES[product];
    },
    [packages],
  );

  const purchase = useCallback(
    async (product: PurchaseProduct): Promise<PurchaseResult> => {
      const found = packages.find((p) => p.product === product);
      if (!found) return "unavailable";
      const result = await purchaseRCPackage(found.pkg);
      if (result === "success") await syncTierFromRC();
      return result;
    },
    [packages],
  );

  return { loading, error, packages, priceFor, retry, purchase };
}
