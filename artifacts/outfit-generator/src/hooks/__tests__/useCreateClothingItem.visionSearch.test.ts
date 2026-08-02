/**
 * Test: useCreateClothingItem — inline vision analysis on success
 *
 * Verifies that when a new clothing item is created with an imageObjectPath:
 *   1. analyzeSingleItemVision is called with that path.
 *   2. dbUpdateClothing is called with the vision result before
 *      queryClient.invalidateQueries fires.
 *   3. The item is therefore searchable immediately after the mutation resolves.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ── Module mocks (must be declared before the hook is imported) ───────────────

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));

const mockDbCreateClothing = vi.fn();
const mockDbUpdateClothing = vi.fn();

vi.mock("@/lib/db", () => ({
  dbCreateClothing: (...args: unknown[]) => mockDbCreateClothing(...args),
  dbUpdateClothing: (...args: unknown[]) => mockDbUpdateClothing(...args),
  dbListClothing: vi.fn().mockResolvedValue([]),
  dbDeleteClothing: vi.fn().mockResolvedValue(undefined),
  dbGetWardrobeStats: vi.fn().mockResolvedValue({ totalItems: 0, totalSizeBytes: 0 }),
}));

const mockAnalyzeSingleItemVision = vi.fn();

vi.mock("@/lib/visionAnalysis", () => ({
  analyzeSingleItemVision: (...args: unknown[]) => mockAnalyzeSingleItemVision(...args),
}));

// ── Import hook after mocks are in place ──────────────────────────────────────

import { useCreateClothingItem } from "../useLocalWardrobe";
import type { ClothingItem } from "@/types/local";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useCreateClothingItem — inline vision analysis", () => {
  const IMAGE_PATH = "private/items/shirt-abc123.png";

  const CREATED_ITEM: ClothingItem = {
    id: "item-001",
    name: "Blue Shirt",
    category: "tops",
    imageObjectPath: IMAGE_PATH,
    visionLabels: [],
    visionText: [],
    visionVersion: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const VISION_RESULT = {
    visionLabels: ["shirt", "blue", "cotton"],
    visionText: [],
    visionVersion: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbCreateClothing.mockResolvedValue(CREATED_ITEM);
    mockDbUpdateClothing.mockResolvedValue({ ...CREATED_ITEM, ...VISION_RESULT });
    mockAnalyzeSingleItemVision.mockResolvedValue(VISION_RESULT);
  });

  it("calls analyzeSingleItemVision with the new item's imageObjectPath", async () => {
    const qc = makeQueryClient();
    const { result } = renderHook(() => useCreateClothingItem(), {
      wrapper: wrapper(qc),
    });

    await act(async () => {
      result.current.mutate({ data: { name: "Blue Shirt", category: "tops", imageObjectPath: IMAGE_PATH } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockAnalyzeSingleItemVision).toHaveBeenCalledOnce();
    expect(mockAnalyzeSingleItemVision).toHaveBeenCalledWith(IMAGE_PATH);
  });

  it("calls dbUpdateClothing with the vision result", async () => {
    const qc = makeQueryClient();
    const { result } = renderHook(() => useCreateClothingItem(), {
      wrapper: wrapper(qc),
    });

    await act(async () => {
      result.current.mutate({ data: { name: "Blue Shirt", category: "tops", imageObjectPath: IMAGE_PATH } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockDbUpdateClothing).toHaveBeenCalledOnce();
    expect(mockDbUpdateClothing).toHaveBeenCalledWith(CREATED_ITEM.id, VISION_RESULT);
  });

  it("calls dbUpdateClothing before queryClient.invalidateQueries so the item is searchable immediately", async () => {
    const qc = makeQueryClient();
    const callOrder: string[] = [];

    mockDbUpdateClothing.mockImplementation(async () => {
      callOrder.push("dbUpdateClothing");
      return { ...CREATED_ITEM, ...VISION_RESULT };
    });

    const invalidateSpy = vi.spyOn(qc, "invalidateQueries").mockImplementation(async () => {
      callOrder.push("invalidateQueries");
    });

    const { result } = renderHook(() => useCreateClothingItem(), {
      wrapper: wrapper(qc),
    });

    await act(async () => {
      result.current.mutate({ data: { name: "Blue Shirt", category: "tops", imageObjectPath: IMAGE_PATH } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(callOrder).toEqual(["dbUpdateClothing", "invalidateQueries"]);
    invalidateSpy.mockRestore();
  });

  it("sets visionLabels and visionVersion on the stored item before invalidation", async () => {
    const qc = makeQueryClient();
    let capturedUpdate: unknown;

    mockDbUpdateClothing.mockImplementation(async (_id: string, data: unknown) => {
      capturedUpdate = data;
      return { ...CREATED_ITEM, ...(data as object) };
    });

    const { result } = renderHook(() => useCreateClothingItem(), {
      wrapper: wrapper(qc),
    });

    await act(async () => {
      result.current.mutate({ data: { name: "Blue Shirt", category: "tops", imageObjectPath: IMAGE_PATH } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(capturedUpdate).toMatchObject({
      visionLabels: expect.arrayContaining(["shirt", "blue"]),
      visionVersion: expect.any(Number),
    });
    expect((capturedUpdate as typeof VISION_RESULT).visionVersion).toBeGreaterThan(0);
  });

  it("skips vision analysis when the item has no imageObjectPath", async () => {
    const itemWithoutImage: ClothingItem = { ...CREATED_ITEM, imageObjectPath: undefined };
    mockDbCreateClothing.mockResolvedValue(itemWithoutImage);

    const qc = makeQueryClient();
    const { result } = renderHook(() => useCreateClothingItem(), {
      wrapper: wrapper(qc),
    });

    await act(async () => {
      result.current.mutate({ data: { name: "Blue Shirt", category: "tops" } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockAnalyzeSingleItemVision).not.toHaveBeenCalled();
    expect(mockDbUpdateClothing).not.toHaveBeenCalled();
  });
});
