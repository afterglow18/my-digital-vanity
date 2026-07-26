/**
 * Integration test: Retry button visibility as failed photos are removed.
 *
 * Verifies that when a user removes all failed photos from the thumbnail strip
 * one by one, the Retry button disappears after the last removal — ensuring
 * `failedFiles.length` and the button's guard clause stay in sync.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Module mocks (must come before the component import) ─────────────────────

vi.mock("framer-motion", () => ({
  motion: {
    div: React.forwardRef(function MotionDiv(
      { children, className, style, ...rest }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode },
      ref: React.Ref<HTMLDivElement>,
    ) {
      // Strip framer-specific props that would cause React DOM warnings.
      const { initial, animate, exit, transition, variants, ...domProps } = rest as Record<string, unknown>;
      void initial; void animate; void exit; void transition; void variants;
      return <div ref={ref as React.Ref<HTMLDivElement>} className={className} style={style} {...domProps}>{children}</div>;
    }),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/processImage", () => ({
  // Always fail so every file ends up in the errored list.
  encodeToPng: vi.fn().mockRejectedValue(new Error("mock encode failure")),
}));

vi.mock("@/lib/backgroundRemoval", () => ({
  removeBackground: vi.fn(),
}));

vi.mock("@/components/clothing/PhotoCompareSheet", () => ({
  PhotoCompareSheet: () => null,
}));

vi.mock("@/hooks/useLocalWardrobe", () => ({
  useCreateClothingItem: () => ({ mutate: vi.fn(), isPending: false }),
  getListClothingQueryKey: () => ["clothing"],
}));

// ── Import component after mocks are registered ───────────────────────────────

import { QuickAddSheet } from "../QuickAddSheet";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFile(name: string): File {
  return new File(["pixel"], name, { type: "image/jpeg" });
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderSheet(props?: Partial<React.ComponentProps<typeof QuickAddSheet>>) {
  const qc = makeQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <QuickAddSheet
        open={true}
        onOpenChange={vi.fn()}
        category="makeup"
        existingCount={0}
        {...props}
      />
    </QueryClientProvider>,
  );
}

/** Simulate uploading `files` via the hidden gallery <input>. */
async function uploadFiles(files: File[]): Promise<void> {
  // QuickAddSheet renders two hidden file inputs: camera (first) and gallery (second).
  const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
  // Use whichever input exists; in tests the second (gallery) input is fine.
  const input = inputs[1] ?? inputs[0];
  if (!input) throw new Error("No file input found");

  await act(async () => {
    Object.defineProperty(input, "files", {
      value: files,
      configurable: true,
    });
    fireEvent.change(input);
  });
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  // fileToThumbnail uses URL.createObjectURL + an Image whose onload/onerror
  // drives the promise.  Mock both so the Image immediately fires onerror,
  // which resolves the promise with "".
  global.URL.createObjectURL = vi.fn(() => "blob:fake-url");
  global.URL.revokeObjectURL = vi.fn();

  const OriginalImage = global.Image;

  // @ts-ignore – replace with a minimal stub
  global.Image = class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 0;
    naturalHeight = 0;

    set src(_url: string) {
      // Resolve asynchronously (matching real browser behaviour) but quickly.
      queueMicrotask(() => this.onerror?.());
    }

    // Restore when tests are done.
    static _original = OriginalImage;
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();

  // Restore Image.
  const saved = (global.Image as { _original?: typeof Image })._original;
  if (saved) global.Image = saved;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("QuickAddSheet — Retry button hides when all failed photos are removed", () => {
  it("shows Retry for 2 failures, then 1, then hides it after the last removal", async () => {
    renderSheet();

    // Upload 2 files — encodeToPng is mocked to reject, so both end up in
    // the failed strip.
    await uploadFiles([makeFile("photo1.jpg"), makeFile("photo2.jpg")]);

    // Both failed → strip + Retry button should be visible.
    await waitFor(() => {
      expect(screen.getByText(/Retry 2 failed photos/i)).toBeTruthy();
    });

    // Two remove buttons should exist (one per thumbnail).
    let removeButtons = screen.getAllByLabelText("Remove photo from retry");
    expect(removeButtons).toHaveLength(2);

    // ── Remove first photo ────────────────────────────────────────────────────
    fireEvent.click(removeButtons[0]);

    // 1 photo remains → button text updates.
    await waitFor(() => {
      expect(screen.getByText(/Retry 1 failed photo/i)).toBeTruthy();
    });

    // ── Remove second (last) photo ────────────────────────────────────────────
    const lastRemove = screen.getByLabelText("Remove photo from retry");
    fireEvent.click(lastRemove);

    // Retry button must be completely gone — no failed files remain.
    await waitFor(() => {
      expect(screen.queryByText(/Retry/i)).toBeNull();
    });

    // The thumbnail strip should also be gone.
    expect(screen.queryAllByLabelText("Remove photo from retry")).toHaveLength(0);
  });
});
