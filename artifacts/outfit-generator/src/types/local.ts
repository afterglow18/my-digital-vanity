/**
 * Local-first type definitions — replaces all @workspace/api-client-react types.
 * All IDs are UUID strings (no server-side serial integers).
 */

export type ClothingCategory = 'makeup' | 'skincare' | 'hair' | 'fragrances';
/** Kept as alias so existing components that import ClothingItemUpdateCategory still work. */
export type ClothingItemUpdateCategory = ClothingCategory;
/** Kept as alias for useListClothing params. */
export type ListClothingCategory = ClothingCategory;

export interface ClothingItem {
  id: string;
  name: string;
  category: ClothingCategory;
  /** Data URL (both web and native) */
  imageObjectPath: string | null;
  color: string | null;
  brand: string | null;
  size: string | null;
  season: string | null;
  occasion: string | null;
  purchasePrice: string | null;
  purchaseDate: string | null;
  notes: string | null;
  isFavorite: boolean;
  timesWorn: number;
  createdAt: string;
  updatedAt: string;
}

export interface SavedOutfit {
  id: string;
  name: string;
  notes: string | null;
  itemIds: string[];
  items: ClothingItem[];
  createdAt: string;
}

export interface WardrobeStats {
  total: number;
  byCategory: Array<{ category: string; count: number }>;
  favorites: number;
  outfits: number;
}

export type CreateClothingData = {
  name: string;
  category: ClothingCategory;
  imageObjectPath?: string | null;
  color?: string | null;
  brand?: string | null;
  size?: string | null;
  season?: string | null;
  occasion?: string | null;
  purchasePrice?: string | null;
  purchaseDate?: string | null;
  notes?: string | null;
  isFavorite?: boolean;
};

export type UpdateClothingData = Partial<Omit<ClothingItem, 'id' | 'createdAt' | 'updatedAt'>>;

// ── Entitlements ───────────────────────────────────────────────────────────────

export type Tier = 'free' | 'unlock' | 'premium';

export const FREE_ITEM_LIMIT   = 20;
export const FREE_OUTFIT_LIMIT = 5;

export interface TierCapabilities {
  maxItems:   number | null;
  maxOutfits: number | null;
  mannequin:  boolean;
}

export const TIER_CAPS: Record<Tier, TierCapabilities> = {
  free:    { maxItems: FREE_ITEM_LIMIT,  maxOutfits: FREE_OUTFIT_LIMIT, mannequin: false },
  unlock:  { maxItems: null,             maxOutfits: null,              mannequin: false },
  premium: { maxItems: null,             maxOutfits: null,              mannequin: true  },
};

export type PurchaseProduct = 'monthly' | 'yearly' | 'lifetime' | 'premium';

export const PRODUCT_PRICES: Record<PurchaseProduct, string> = {
  monthly:  '$1.99',
  yearly:   '$19.99',
  lifetime: '$9.99',
  premium:  '$9.99',
};

/** Which tier a purchase unlocks */
export const PRODUCT_TIER: Record<PurchaseProduct, Tier> = {
  monthly:  'unlock',
  yearly:   'unlock',
  lifetime: 'unlock',
  premium:  'premium',
};
