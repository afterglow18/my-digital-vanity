/**
 * local-api.ts — drop-in replacement for @workspace/api-client-react.
 *
 * All hooks share the same call signatures as the generated API client so
 * pages only need one import-line change.  Under the hood, queryFns read
 * from localStorage via db.ts and images are managed via imageStorage.ts.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type ClothingItem,
  type Outfit,
  getClothingItem,
  listClothingItems,
  createClothingItem,
  updateClothingItem,
  deleteClothingItem,
  getWardrobeStats,
  listOutfits,
  createOutfit,
  updateOutfit,
  deleteOutfit,
  addItemToOutfit,
  removeItemFromOutfit,
  generateOutfitItems,
} from "./db";
import { deleteImage } from "./imageStorage";

// Re-export types so pages can import them from here
export type { ClothingItem, Outfit };

// Compatibility type aliases (used in some components)
export type ClothingItemUpdateCategory = string;
export type ListClothingCategory = string;

// ── Query key factories ────────────────────────────────────────────────────────

export function getListClothingQueryKey(params?: { category?: string }): unknown[] {
  return params?.category ? ["clothing", params.category] : ["clothing"];
}

export function getListOutfitsQueryKey(): unknown[] {
  return ["outfits"];
}

export function getGetClothingItemQueryKey(id: number): unknown[] {
  return ["clothing", "item", id];
}

// ── Clothing hooks ─────────────────────────────────────────────────────────────

export function useListClothing(
  params?: { category?: string },
  options?: { query?: { queryKey?: unknown[]; enabled?: boolean } },
) {
  const queryKey = options?.query?.queryKey ?? getListClothingQueryKey(params);
  return useQuery({
    queryKey,
    queryFn: () => listClothingItems(params?.category),
    enabled: options?.query?.enabled ?? true,
  });
}

export function useGetClothingItem(
  id: number,
  options?: { query?: { queryKey?: unknown[]; enabled?: boolean } },
) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getGetClothingItemQueryKey(id),
    queryFn: () => getClothingItem(id),
    enabled: options?.query?.enabled ?? true,
  });
}

export function useCreateClothingItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      data,
    }: {
      data: Partial<ClothingItem> & { name: string; category: string };
    }) => createClothingItem(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useUpdateClothingItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<ClothingItem> }) =>
      updateClothingItem(id, data),
    onSuccess: (_result, { id }) => {
      queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetClothingItemQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
    },
  });
}

export function useDeleteClothingItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      const item = getClothingItem(id);
      if (item?.imageObjectPath) await deleteImage(item.imageObjectPath);
      deleteClothingItem(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useGetWardrobeStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: () => getWardrobeStats(),
  });
}

// ── Outfit hooks ───────────────────────────────────────────────────────────────

export function useListOutfits(
  _query?: unknown,
  options?: { query?: { enabled?: boolean } },
) {
  return useQuery({
    queryKey: getListOutfitsQueryKey(),
    queryFn: () => listOutfits(),
    enabled: options?.query?.enabled ?? true,
  });
}

export function useSaveOutfit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ data }: { data: { name: string; itemIds: number[] } }) =>
      createOutfit(data.name, data.itemIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
    },
  });
}

export function useDeleteOutfit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      deleteOutfit(id);
    },
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
      id: number;
      data: { name?: string; notes?: string | null; lastWornDate?: string | null };
    }) => updateOutfit(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
    },
  });
}

export function useAddItemToOutfit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, itemId }: { id: number; itemId: number }) =>
      addItemToOutfit(id, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
    },
  });
}

export function useRemoveItemFromOutfit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, itemId }: { id: number; itemId: number }) =>
      removeItemFromOutfit(id, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
    },
  });
}

// ── Generate outfit (local random pick per category) ──────────────────────────

export function useGenerateOutfit() {
  return useMutation({
    mutationFn: async ({
      data,
    }: {
      data: { excludeCategories: string[] };
    }): Promise<{ items: ClothingItem[] }> => {
      // Small delay so the slot-machine animation has time to spin
      await new Promise((r) => setTimeout(r, 600));
      return { items: generateOutfitItems(data.excludeCategories) };
    },
  });
}
