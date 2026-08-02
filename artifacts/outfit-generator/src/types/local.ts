/**
 * Shared local-first type definitions used across all six modules.
 *
 * ClothingCategory is intentionally `string` here because each module
 * has its own category vocabulary (tops/handbags/shoes/jewelry/vanity/suitcase).
 * Module-specific pages narrow the type locally where needed.
 */

export type ClothingCategory = string;
export type ClothingItemUpdateCategory = ClothingCategory;
export type ListClothingCategory = ClothingCategory;

export interface ClothingItem {
  id: string;
  name: string;
  category: ClothingCategory;
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

// ── Entitlements ──────────────────────────────────────────────────────────────

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

export type PurchaseProduct = 'monthly' | 'annual' | 'yearly' | 'lifetime' | 'premium';

export const PRODUCT_PRICES: Record<string, string> = {
  monthly:  '$1.99',
  annual:   '$19.99',
  yearly:   '$19.99',
  lifetime: '$9.99',
  premium:  '$9.99',
};
