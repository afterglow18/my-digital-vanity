/**
 * local-api.ts — hooks backed by the local IndexedDB/db.ts layer.
 * Keeps the same external API shape so components need minimal changes.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClothingItem, SavedOutfit } from "@/types/local";
import {
  dbListClothing,
  dbCreateClothing,
  dbUpdateClothing,
  dbDeleteClothing,
  dbGetWardrobeStats,
  dbListOutfits,
  dbCreateOutfit,
  dbUpdateOutfit,
  dbDeleteOutfit,
  dbAddItemToOutfit,
  dbRemoveItemFromOutfit,
} from "./db";

// Re-export types
export type { ClothingItem };
export type Outfit = SavedOutfit;

// ── Query key factories ───────────────────────────────────────────────────────

export function getListClothingQueryKey(params?: { category?: string }): unknown[] {
  return params?.category ? ["clothing", params.category] : ["clothing"];
}

export function getListOutfitsQueryKey(): unknown[] {
  return ["outfits"];
}

// ── Clothing hooks ────────────────────────────────────────────────────────────

export function useListClothing(
  params?: { category?: string },
  options?: { query?: { queryKey?: unknown[]; enabled?: boolean } },
) {
  const queryKey = options?.query?.queryKey ?? getListClothingQueryKey(params);
  return useQuery({
    queryKey,
    queryFn: () => dbListClothing(params?.category),
    enabled: options?.query?.enabled ?? true,
  });
}

export function useGetWardrobeStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: () => dbGetWardrobeStats(),
  });
}

export function useCreateClothingItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      data,
    }: {
      data: Partial<ClothingItem> & { name: string; category: string };
    }) => dbCreateClothing(data as Parameters<typeof dbCreateClothing>[0]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useUpdateClothingItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ClothingItem> }) =>
      dbUpdateClothing(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
    },
  });
}

export function useDeleteClothingItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => dbDeleteClothing(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

// ── Outfit hooks ──────────────────────────────────────────────────────────────

export function useListOutfits(
  _query?: unknown,
  options?: { query?: { enabled?: boolean } },
) {
  return useQuery({
    queryKey: getListOutfitsQueryKey(),
    queryFn: () => dbListOutfits(),
    enabled: options?.query?.enabled ?? true,
  });
}

export function useSaveOutfit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ data }: { data: { name: string; itemIds: string[] } }) =>
      dbCreateOutfit(data.name, data.itemIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
    },
  });
}

export function useDeleteOutfit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => dbDeleteOutfit(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
    },
  });
}

export function useRenameOutfit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: { name?: string; notes?: string | null; lastWornDate?: string | null };
    }) => dbUpdateOutfit(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
    },
  });
}

export function useAddItemToOutfit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, itemId }: { id: string; itemId: string }) =>
      dbAddItemToOutfit(id, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
    },
  });
}

export function useRemoveItemFromOutfit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, itemId }: { id: string; itemId: string }) =>
      dbRemoveItemFromOutfit(id, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
    },
  });
}
