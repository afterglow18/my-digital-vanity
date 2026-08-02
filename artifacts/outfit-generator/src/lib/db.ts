/**
 * Local database — clothing items, outfits, and settings stored in localStorage.
 *
 * Why localStorage: Reliable on iOS WebKit, no setup complexity,
 * survives app updates, included in iCloud backup automatically.
 *
 * Images are stored separately via imageStorage.ts (Capacitor Filesystem).
 * imageObjectPath stores just the filename (e.g. "tops-1234567890.jpg").
 */

export interface ClothingItem {
  id: number;
  name: string;
  category: string;
  imageObjectPath?: string | null;   // filename only
  color?: string | null;
  brand?: string | null;
  size?: string | null;
  season?: string | null;
  occasion?: string | null;
  purchasePrice?: string | null;
  purchaseDate?: string | null;
  notes?: string | null;
  isFavorite?: boolean | null;
  timesWorn?: number | null;
  lastWornDate?: string | null;  // ISO date "YYYY-MM-DD", local timezone
  // Vision indexer fields (safe default: undefined = unanalyzed)
  visionLabels?:  string[];
  visionText?:    string[];
  visionVersion?: number;        // 0=unanalyzed, 1=iOS, 4=web, 5=web-empty
  createdAt?: string | null;
}

export interface Outfit {
  id: number;
  name: string;
  notes?: string | null;
  items?: ClothingItem[];
  createdAt?: string | null;
  lastWornDate?: string | null;  // ISO date "YYYY-MM-DD", local timezone
}

// Internal format for stored outfits (item IDs, not full objects)
export interface StoredOutfit {
  id: number;
  name: string;
  notes?: string | null;
  itemIds: number[];
  createdAt?: string | null;
  lastWornDate?: string | null;  // ISO date "YYYY-MM-DD", local timezone
}

// ── Storage keys ──────────────────────────────────────────────────────────────
const ITEMS_KEY   = "mdc_clothing_items";
const OUTFITS_KEY = "mdc_outfits";
const SEQ_KEY     = "mdc_seq";

// ── ID counter ────────────────────────────────────────────────────────────────
function nextId(): number {
  const n = parseInt(localStorage.getItem(SEQ_KEY) ?? "0", 10) + 1;
  localStorage.setItem(SEQ_KEY, String(n));
  return n;
}

// ── Clothing Items ─────────────────────────────────────────────────────────────
export function getAllClothingItems(): ClothingItem[] {
  try {
    return JSON.parse(localStorage.getItem(ITEMS_KEY) ?? "[]") as ClothingItem[];
  } catch { return []; }
}

function saveAllClothingItems(items: ClothingItem[]): void {
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
}

export function getClothingItem(id: number): ClothingItem | null {
  return getAllClothingItems().find((i) => i.id === id) ?? null;
}

export function listClothingItems(category?: string): ClothingItem[] {
  const all = getAllClothingItems();
  if (!category) return all;
  return all.filter((i) => i.category === category);
}

export function createClothingItem(
  data: Partial<ClothingItem> & { name: string; category: string },
): ClothingItem {
  const items = getAllClothingItems();
  const item: ClothingItem = {
    ...data,
    id: nextId(),
    timesWorn: data.timesWorn ?? 0,
    createdAt: new Date().toISOString(),
  };
  items.unshift(item);
  saveAllClothingItems(items);
  return item;
}

export function updateClothingItem(
  id: number,
  data: Partial<Omit<ClothingItem, "id" | "createdAt">>,
): ClothingItem | null {
  const items = getAllClothingItems();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...data };
  saveAllClothingItems(items);
  return items[idx];
}

export function deleteClothingItem(id: number): void {
  saveAllClothingItems(getAllClothingItems().filter((i) => i.id !== id));
  // Remove from all outfits too
  const stored = getAllStoredOutfits().map((o) => ({
    ...o,
    itemIds: o.itemIds.filter((iid) => iid !== id),
  }));
  saveAllStoredOutfits(stored);
}

export function getWardrobeStats(): { byCategory: { category: string; count: number }[] } {
  const counts = new Map<string, number>();
  for (const item of getAllClothingItems()) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }
  return {
    byCategory: Array.from(counts.entries()).map(([category, count]) => ({ category, count })),
  };
}

// ── Outfits ───────────────────────────────────────────────────────────────────
export function getAllStoredOutfits(): StoredOutfit[] {
  try {
    return JSON.parse(localStorage.getItem(OUTFITS_KEY) ?? "[]") as StoredOutfit[];
  } catch { return []; }
}

function saveAllStoredOutfits(outfits: StoredOutfit[]): void {
  localStorage.setItem(OUTFITS_KEY, JSON.stringify(outfits));
}

function hydrateOutfit(stored: StoredOutfit): Outfit {
  const itemMap = new Map(getAllClothingItems().map((i) => [i.id, i]));
  return {
    id: stored.id,
    name: stored.name,
    notes: stored.notes,
    createdAt: stored.createdAt,
    lastWornDate: stored.lastWornDate,
    items: stored.itemIds.map((id) => itemMap.get(id)).filter(Boolean) as ClothingItem[],
  };
}

export function listOutfits(): Outfit[] {
  return getAllStoredOutfits().map(hydrateOutfit);
}

export function createOutfit(name: string, itemIds: number[]): Outfit {
  const stored = getAllStoredOutfits();
  const newOutfit: StoredOutfit = {
    id: nextId(),
    name,
    itemIds,
    createdAt: new Date().toISOString(),
  };
  stored.push(newOutfit);
  saveAllStoredOutfits(stored);
  return hydrateOutfit(newOutfit);
}

export function updateOutfit(
  id: number,
  data: { name?: string; notes?: string | null; lastWornDate?: string | null },
): Outfit | null {
  const stored = getAllStoredOutfits();
  const idx = stored.findIndex((o) => o.id === id);
  if (idx === -1) return null;
  stored[idx] = { ...stored[idx], ...data };
  saveAllStoredOutfits(stored);
  return hydrateOutfit(stored[idx]);
}

export function deleteOutfit(id: number): void {
  saveAllStoredOutfits(getAllStoredOutfits().filter((o) => o.id !== id));
}

export function addItemToOutfit(outfitId: number, itemId: number): Outfit | null {
  const stored = getAllStoredOutfits();
  const idx = stored.findIndex((o) => o.id === outfitId);
  if (idx === -1) return null;
  if (!stored[idx].itemIds.includes(itemId)) {
    stored[idx].itemIds.push(itemId);
    saveAllStoredOutfits(stored);
  }
  return hydrateOutfit(stored[idx]);
}

export function removeItemFromOutfit(outfitId: number, itemId: number): Outfit | null {
  const stored = getAllStoredOutfits();
  const idx = stored.findIndex((o) => o.id === outfitId);
  if (idx === -1) return null;
  stored[idx].itemIds = stored[idx].itemIds.filter((id) => id !== itemId);
  saveAllStoredOutfits(stored);
  return hydrateOutfit(stored[idx]);
}

// ── Outfit generator (local random pick per category) ─────────────────────────
export function generateOutfitItems(excludeCategories: string[] = []): ClothingItem[] {
  const items = getAllClothingItems().filter(
    (i) => !excludeCategories.includes(i.category),
  );
  const byCategory = new Map<string, ClothingItem[]>();
  for (const item of items) {
    const arr = byCategory.get(item.category) ?? [];
    arr.push(item);
    byCategory.set(item.category, arr);
  }
  const result: ClothingItem[] = [];
  for (const categoryItems of byCategory.values()) {
    if (categoryItems.length > 0) {
      result.push(categoryItems[Math.floor(Math.random() * categoryItems.length)]);
    }
  }
  return result;
}
