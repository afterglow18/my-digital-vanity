/**
 * Local wardrobe hooks — replaces @workspace/api-client-react clothing hooks.
 * Uses React Query backed by IndexedDB (via src/lib/db.ts).
 *
 * Public API is intentionally identical to the old API client hooks so
 * existing pages need minimal changes: just swap the import path.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  dbListClothing,
  dbCreateClothing,
  dbUpdateClothing,
  dbDeleteClothing,
  dbGetWardrobeStats,
} from '@/lib/db';
import { analyzeSingleItemVision } from '@/lib/visionAnalysis';
import type {
  ClothingItem,
  CreateClothingData,
  UpdateClothingData,
  WardrobeStats,
  ClothingCategory,
} from '@/types/local';

// ── Query key factories (match old API client surface) ─────────────────────────

export function getListClothingQueryKey(params?: { category?: string }) {
  return params?.category
    ? ['clothing', 'list', params.category]
    : ['clothing', 'list'];
}

export function getWardrobeStatsQueryKey() {
  return ['clothing', 'stats'];
}

// ── List ──────────────────────────────────────────────────────────────────────

export function useListClothing(
  params: { category?: ClothingCategory | string } = {},
  options?: { query?: { queryKey?: unknown[]; enabled?: boolean } },
) {
  return useQuery<ClothingItem[]>({
    queryKey: options?.query?.queryKey ?? getListClothingQueryKey(params),
    queryFn: () => dbListClothing(params.category),
    enabled: options?.query?.enabled !== false,
    staleTime: 0,
  });
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function useGetWardrobeStats() {
  return useQuery<WardrobeStats>({
    queryKey: getWardrobeStatsQueryKey(),
    queryFn: dbGetWardrobeStats,
    staleTime: 0,
  });
}

// ── Create ────────────────────────────────────────────────────────────────────

export function useCreateClothingItem() {
  const qc = useQueryClient();
  return useMutation<ClothingItem, Error, { data: CreateClothingData }>({
    mutationFn: ({ data }) => dbCreateClothing(data),
    onSuccess: async (newItem) => {
      // Immediately analyze the new item's photo so vision search works right
      // away without waiting for the next cold-start indexer run.
      if (newItem.imageObjectPath) {
        try {
          const result = await analyzeSingleItemVision(newItem.imageObjectPath);
          await dbUpdateClothing(newItem.id, result);
        } catch {
          // Silent failure — useVisionIndexer will retry on next app launch
        }
      }
      qc.invalidateQueries({ queryKey: ['clothing'] });
    },
  });
}

// ── Update ────────────────────────────────────────────────────────────────────

export function useUpdateClothingItem() {
  const qc = useQueryClient();
  return useMutation<
    ClothingItem,
    Error,
    { id: string; data: UpdateClothingData }
  >({
    mutationFn: ({ id, data }) => dbUpdateClothing(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clothing'] });
    },
  });
}

// ── Delete ────────────────────────────────────────────────────────────────────

export function useDeleteClothingItem() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string }>({
    mutationFn: ({ id }) => dbDeleteClothing(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clothing'] });
      qc.invalidateQueries({ queryKey: ['outfits'] });
    },
  });
}

// ── Re-export types consumed by pages ─────────────────────────────────────────
export type { ClothingItem, ClothingCategory as ListClothingCategory };
export type { ClothingCategory as ClothingItemUpdateCategory };
