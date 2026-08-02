/**
 * Entitlement tier definitions — single source of truth for limits and capabilities.
 *
 * Tiers:
 *   "free"    — default; up to FREE_ITEM_LIMIT items, FREE_OUTFIT_LIMIT saved outfits.
 *   "unlock"  — monthly or annual subscriber; unlimited items + outfits.
 *   "premium" — lifetime owner; unlimited + mannequin view.
 */

export type Tier = "free" | "unlock" | "premium";

/** Adjust these constants to run promotions or A/B tests without touching logic. */
export const FREE_ITEM_LIMIT   = 20;
export const FREE_OUTFIT_LIMIT = 5;

export interface TierCapabilities {
  /** Maximum clothing items, or null for unlimited. */
  maxItems:   number | null;
  /** Maximum saved outfits, or null for unlimited. */
  maxOutfits: number | null;
  /** Access to the interactive 3D mannequin view. */
  mannequin:  boolean;
}

export const TIER_CAPS: Record<Tier, TierCapabilities> = {
  free:    { maxItems: FREE_ITEM_LIMIT,  maxOutfits: FREE_OUTFIT_LIMIT, mannequin: false },
  unlock:  { maxItems: null,             maxOutfits: null,              mannequin: false },
  premium: { maxItems: null,             maxOutfits: null,              mannequin: true  },
};

/** Subscription products available for purchase. */
export type PurchaseProduct = "monthly" | "annual" | "lifetime";

export const PRODUCT_PRICES: Record<PurchaseProduct, { display: string; sub: string }> = {
  monthly:  { display: "$1.99",  sub: "/ month"   },
  annual:   { display: "$19.99", sub: "/ year"    },
  lifetime: { display: "$9.99",  sub: "one-time"  },
};
