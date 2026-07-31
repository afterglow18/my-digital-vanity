/**
 * Local IndexedDB database service — replaces the API server.
 * Works identically on iOS (via Capacitor's WKWebView) and web dev.
 *
 * Schema version 1: clothing_items, outfits, outfit_items.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  ClothingItem,
  SavedOutfit,
  CreateClothingData,
  UpdateClothingData,
  WardrobeStats,
} from '@/types/local';

// ── Schema ────────────────────────────────────────────────────────────────────

type OutfitRow = Omit<SavedOutfit, 'items'>;
type OutfitItemRow = {
  id: string;
  outfitId: string;
  clothingItemId: string;
  position: number;
};

interface VanitySchema extends DBSchema {
  clothing: {
    key: string;
    value: ClothingItem;
    indexes: { 'by-category': string; 'by-created': string };
  };
  outfits: {
    key: string;
    value: OutfitRow;
    indexes: { 'by-created': string };
  };
  outfit_items: {
    key: string;
    value: OutfitItemRow;
    indexes: { 'by-outfit': string };
  };
}

// ── Singleton connection ───────────────────────────────────────────────────────

let _dbPromise: Promise<IDBPDatabase<VanitySchema>> | null = null;

function getDB(): Promise<IDBPDatabase<VanitySchema>> {
  if (!_dbPromise) {
    _dbPromise = openDB<VanitySchema>('vanity-db', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('clothing')) {
          const s = db.createObjectStore('clothing', { keyPath: 'id' });
          s.createIndex('by-category', 'category');
          s.createIndex('by-created', 'createdAt');
        }
        if (!db.objectStoreNames.contains('outfits')) {
          const s = db.createObjectStore('outfits', { keyPath: 'id' });
          s.createIndex('by-created', 'createdAt');
        }
        if (!db.objectStoreNames.contains('outfit_items')) {
          const s = db.createObjectStore('outfit_items', { keyPath: 'id' });
          s.createIndex('by-outfit', 'outfitId');
        }
      },
    });
  }
  return _dbPromise;
}

// ── Clothing ──────────────────────────────────────────────────────────────────

export async function dbListClothing(category?: string): Promise<ClothingItem[]> {
  const db = await getDB();
  if (category) {
    const items = (await db.getAllFromIndex('clothing', 'by-category', category))
      .map((item) => ({ ...item, lastUsedDate: item.lastUsedDate ?? null }));
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const items = (await db.getAll('clothing'))
    .map((item) => ({ ...item, lastUsedDate: item.lastUsedDate ?? null }));
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function dbCreateClothing(data: CreateClothingData): Promise<ClothingItem> {
  const db = await getDB();
  const now = new Date().toISOString();
  const item: ClothingItem = {
    id: crypto.randomUUID(),
    name: data.name,
    category: data.category,
    imageObjectPath: data.imageObjectPath ?? null,
    color: data.color ?? null,
    brand: data.brand ?? null,
    size: data.size ?? null,
    season: data.season ?? null,
    occasion: data.occasion ?? null,
    purchasePrice: data.purchasePrice ?? null,
    purchaseDate: data.purchaseDate ?? null,
    notes: data.notes ?? null,
    isFavorite: data.isFavorite ?? false,
    timesWorn: 0,
    lastUsedDate: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('clothing', item);
  return item;
}

export async function dbUpdateClothing(id: string, data: UpdateClothingData): Promise<ClothingItem> {
  const db = await getDB();
  const existing = await db.get('clothing', id);
  if (!existing) throw new Error(`Clothing item ${id} not found`);
  const updated: ClothingItem = {
    ...existing,
    ...data,
    id,
    updatedAt: new Date().toISOString(),
  };
  await db.put('clothing', updated);
  return updated;
}

export async function dbDeleteClothing(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('clothing', id);

  // Remove from all outfits
  const allOI = await db.getAll('outfit_items');
  const tx = db.transaction('outfit_items', 'readwrite');
  await Promise.all(
    allOI
      .filter((oi) => oi.clothingItemId === id)
      .map((oi) => tx.store.delete(oi.id)),
  );
  await tx.done;

  // Update itemIds arrays on affected outfit rows
  const affectedOutfitIds = new Set(
    allOI.filter((oi) => oi.clothingItemId === id).map((oi) => oi.outfitId),
  );
  for (const outfitId of affectedOutfitIds) {
    const row = await db.get('outfits', outfitId);
    if (row) {
      await db.put('outfits', {
        ...row,
        itemIds: (row.itemIds ?? []).filter((i) => i !== id),
      });
    }
  }
}

export async function dbGetWardrobeStats(): Promise<WardrobeStats> {
  const db = await getDB();
  const allItems = await db.getAll('clothing');
  const allOutfits = await db.getAll('outfits');

  const byCategory = (['makeup', 'skincare', 'hair', 'fragrances'] as const).map((cat) => ({
    category: cat,
    count: allItems.filter((i) => i.category === cat).length,
  }));

  return {
    total: allItems.length,
    byCategory,
    favorites: allItems.filter((i) => i.isFavorite).length,
    outfits: allOutfits.length,
  };
}

// ── Outfits ───────────────────────────────────────────────────────────────────

async function hydrateOutfit(
  row: OutfitRow,
  db: IDBPDatabase<VanitySchema>,
): Promise<SavedOutfit> {
  const ois = await db.getAllFromIndex('outfit_items', 'by-outfit', row.id);
  ois.sort((a, b) => a.position - b.position);
  const items = (
    await Promise.all(ois.map((oi) => db.get('clothing', oi.clothingItemId)))
  ).filter((i): i is ClothingItem => i != null)
    .map((item) => ({ ...item, lastUsedDate: item.lastUsedDate ?? null }));
  return { ...row, items };
}

export async function dbListOutfits(): Promise<SavedOutfit[]> {
  const db = await getDB();
  const rows = await db.getAll('outfits');
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)); // newest first
  return Promise.all(rows.map((row) => hydrateOutfit(row, db)));
}

export async function dbCreateOutfit(name: string, itemIds: string[]): Promise<SavedOutfit> {
  const db = await getDB();
  const now = new Date().toISOString();
  const outfitId = crypto.randomUUID();

  const row: OutfitRow = { id: outfitId, name, notes: null, lastUsedDate: null, itemIds, createdAt: now };
  await db.put('outfits', row);

  const tx = db.transaction('outfit_items', 'readwrite');
  await Promise.all(
    itemIds.map((itemId, idx) =>
      tx.store.put({
        id: crypto.randomUUID(),
        outfitId,
        clothingItemId: itemId,
        position: idx,
      }),
    ),
  );
  await tx.done;

  return hydrateOutfit(row, db);
}

export async function dbUpdateOutfit(
  id: string,
  data: { name?: string; notes?: string | null; lastUsedDate?: string | null },
): Promise<void> {
  const db = await getDB();
  const existing = await db.get('outfits', id);
  if (!existing) return;
  await db.put('outfits', { ...existing, ...data });
}

/** Returns today's date as "YYYY-MM-DD" in local time. */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Log an outfit as used today:
 * - Sets outfit.lastUsedDate to today's local date.
 * - Increments timesWorn and sets lastUsedDate on every item in the group.
 */
export async function dbLogOutfitUsage(id: string, itemIds: string[]): Promise<void> {
  const db = await getDB();
  const row = await db.get('outfits', id);
  if (row) await db.put('outfits', { ...row, lastUsedDate: localToday() });
  const now = new Date().toISOString();
  await Promise.all(
    itemIds.map(async (itemId) => {
      const item = await db.get('clothing', itemId);
      if (item) {
        await db.put('clothing', {
          ...item,
          timesWorn: (item.timesWorn ?? 0) + 1,
          lastUsedDate: localToday(),
          updatedAt: now,
        });
      }
    }),
  );
}

/**
 * Undo today's outfit log:
 * - Restores outfit.lastUsedDate to prevLastUsedDate.
 * - Decrements timesWorn by 1 (floor 0) on every item in the group.
 * - Restores each item's latest remaining usage date when other saved groups
 *   also contain that item.
 */
export async function dbUndoOutfitUsage(
  id: string,
  prevLastUsedDate: string | null,
  itemIds: string[],
): Promise<void> {
  const db = await getDB();
  const row = await db.get('outfits', id);
  if (row) await db.put('outfits', { ...row, lastUsedDate: prevLastUsedDate });
  const allOutfits = await db.getAll('outfits');
  const now = new Date().toISOString();
  await Promise.all(
    itemIds.map(async (itemId) => {
      const item = await db.get('clothing', itemId);
      if (item) {
        const remainingDates = allOutfits
          .filter((outfit) => outfit.id !== id && outfit.itemIds?.includes(itemId))
          .map((outfit) => outfit.lastUsedDate)
          .filter((date): date is string => Boolean(date));
        if (prevLastUsedDate) remainingDates.push(prevLastUsedDate);
        const latestRemainingDate = remainingDates.sort().pop() ?? null;
        await db.put('clothing', {
          ...item,
          timesWorn: Math.max(0, (item.timesWorn ?? 0) - 1),
          lastUsedDate: latestRemainingDate,
          updatedAt: now,
        });
      }
    }),
  );
}

export async function dbDeleteOutfit(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('outfits', id);
  const allOI = await db.getAll('outfit_items');
  const tx = db.transaction('outfit_items', 'readwrite');
  await Promise.all(
    allOI.filter((oi) => oi.outfitId === id).map((oi) => tx.store.delete(oi.id)),
  );
  await tx.done;
}

export async function dbAddItemToOutfit(outfitId: string, clothingItemId: string): Promise<void> {
  const db = await getDB();
  const row = await db.get('outfits', outfitId);
  if (!row) return;

  const allOI = await db.getAll('outfit_items');
  const already = allOI.some(
    (oi) => oi.outfitId === outfitId && oi.clothingItemId === clothingItemId,
  );
  if (already) return;

  const position = allOI.filter((oi) => oi.outfitId === outfitId).length;
  await db.put('outfit_items', {
    id: crypto.randomUUID(),
    outfitId,
    clothingItemId,
    position,
  });
  await db.put('outfits', {
    ...row,
    itemIds: [...(row.itemIds ?? []), clothingItemId],
  });
}

export async function dbRemoveItemFromOutfit(
  outfitId: string,
  clothingItemId: string,
): Promise<void> {
  const db = await getDB();
  const allOI = await db.getAll('outfit_items');
  const tx = db.transaction('outfit_items', 'readwrite');
  await Promise.all(
    allOI
      .filter((oi) => oi.outfitId === outfitId && oi.clothingItemId === clothingItemId)
      .map((oi) => tx.store.delete(oi.id)),
  );
  await tx.done;

  const row = await db.get('outfits', outfitId);
  if (row) {
    await db.put('outfits', {
      ...row,
      itemIds: (row.itemIds ?? []).filter((i) => i !== clothingItemId),
    });
  }
}

// ── Export / Import ───────────────────────────────────────────────────────────

export interface ExportPayload {
  version: 1;
  exportedAt: string;
  clothing: ClothingItem[];
  outfits: OutfitRow[];
  outfit_items: OutfitItemRow[];
}

export async function dbExportAll(): Promise<ExportPayload> {
  const db = await getDB();
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    clothing: await db.getAll('clothing'),
    outfits: await db.getAll('outfits'),
    outfit_items: await db.getAll('outfit_items'),
  };
}

export async function dbImportAll(payload: ExportPayload): Promise<void> {
  const db = await getDB();

  // Clear existing data
  const clearTx = db.transaction(['clothing', 'outfits', 'outfit_items'], 'readwrite');
  await Promise.all([
    clearTx.objectStore('clothing').clear(),
    clearTx.objectStore('outfits').clear(),
    clearTx.objectStore('outfit_items').clear(),
  ]);
  await clearTx.done;

  // Insert imported data
  const importTx = db.transaction(['clothing', 'outfits', 'outfit_items'], 'readwrite');
  await Promise.all([
    ...payload.clothing.map((item) => importTx.objectStore('clothing').put(item)),
    ...payload.outfits.map((row) => importTx.objectStore('outfits').put(row)),
    ...payload.outfit_items.map((oi) => importTx.objectStore('outfit_items').put(oi)),
  ]);
  await importTx.done;
}
