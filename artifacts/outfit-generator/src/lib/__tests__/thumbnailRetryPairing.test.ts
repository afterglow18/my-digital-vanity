/**
 * thumbnailRetryPairing.test.ts
 *
 * Verifies that the thumbnail ↔ file pairing stays correct through full
 * retry cycles: initial partial failure → user reorders the strip →
 * retry → partial failure again → thumbnails still match the right files.
 *
 * All helpers are imported from retryStripHelpers so regressions in the
 * production code are detected, not just in a shadow copy.
 */

import { describe, it, expect } from "vitest";
import {
  buildRetryThumbMap,
  resolveThumbnails,
  reorderStrip,
} from "../retryStripHelpers";

// ── Basic map lookup ──────────────────────────────────────────────────────────

describe("resolveThumbnails — basic map lookup", () => {
  it("returns the pre-existing thumbnail when the File is in the map", async () => {
    const fileA = new File([], "a.jpg");
    const map = new Map<File, string>([[fileA, "thumb-A"]]);
    const result = await resolveThumbnails([fileA], map, () => "generated");
    expect(result).toEqual(["thumb-A"]);
  });

  it("falls back to generate() when the File is NOT in the map", async () => {
    const fileA = new File([], "a.jpg");
    const fileB = new File([], "b.jpg"); // not in map
    const map = new Map<File, string>([[fileA, "thumb-A"]]);
    const result = await resolveThumbnails([fileA, fileB], map, (f) => `gen-${f.name}`);
    expect(result).toEqual(["thumb-A", "gen-b.jpg"]);
  });

  it("generates all thumbnails when no map is provided (first upload)", async () => {
    const files = [new File([], "x.jpg"), new File([], "y.jpg")];
    const result = await resolveThumbnails(files, undefined, (f) => `gen-${f.name}`);
    expect(result).toEqual(["gen-x.jpg", "gen-y.jpg"]);
  });

  it("works correctly with an async generate function (mirrors the real fileToThumbnail)", async () => {
    // Use an async generator to validate the Promise<string> overload, which is
    // the actual production path (fileToThumbnail returns Promise<string>).
    const [fileA, fileB] = [new File([], "a.jpg"), new File([], "b.jpg")];
    const asyncGenerate = (f: File): Promise<string> =>
      Promise.resolve(`async-${f.name}`);

    // fileA is in the map (cached); fileB must be generated asynchronously.
    const map = new Map<File, string>([[fileA, "cached-A"]]);
    const result = await resolveThumbnails([fileA, fileB], map, asyncGenerate);

    expect(result[0]).toBe("cached-A");   // map hit — not regenerated
    expect(result[1]).toBe("async-b.jpg"); // async generate() was awaited
  });
});

// ── Reorder strip ─────────────────────────────────────────────────────────────

describe("reorderStrip — preserves file ↔ thumbnail pairing", () => {
  it("moving slot 0 to slot 2 keeps each thumb matched to its file", () => {
    const [fileA, fileB, fileC] = [
      new File([], "a.jpg"),
      new File([], "b.jpg"),
      new File([], "c.jpg"),
    ];
    let files  = [fileA, fileB, fileC];
    let thumbs = ["thumb-A", "thumb-B", "thumb-C"];

    // User drags slot 0 (fileA) to slot 2.
    files  = reorderStrip(files,  0, 2);
    thumbs = reorderStrip(thumbs, 0, 2);

    // After: [fileB, fileC, fileA]
    expect(files).toEqual([fileB, fileC, fileA]);
    expect(thumbs).toEqual(["thumb-B", "thumb-C", "thumb-A"]);

    // Each file is still next to its own thumbnail.
    files.forEach((f, i) => {
      const expectedThumb = `thumb-${f.name.replace(".jpg", "").toUpperCase()}`;
      expect(thumbs[i]).toBe(expectedThumb);
    });
  });

  it("moving last slot to first keeps all three pairs correct", () => {
    const [fileA, fileB, fileC] = [
      new File([], "a.jpg"),
      new File([], "b.jpg"),
      new File([], "c.jpg"),
    ];
    let files  = [fileA, fileB, fileC];
    let thumbs = ["thumb-A", "thumb-B", "thumb-C"];

    // reorderStrip([fA,fB,fC], 2→0): removes fC from slot 2, inserts at 0 → [fC, fA, fB]
    files  = reorderStrip(files,  2, 0);
    thumbs = reorderStrip(thumbs, 2, 0);

    expect(files[0]).toBe(fileC);
    expect(thumbs[0]).toBe("thumb-C");
    expect(files[1]).toBe(fileA);
    expect(thumbs[1]).toBe("thumb-A");
    expect(files[2]).toBe(fileB);
    expect(thumbs[2]).toBe("thumb-B");
  });
});

// ── buildRetryThumbMap ────────────────────────────────────────────────────────

describe("buildRetryThumbMap — Retry button map construction", () => {
  it("maps each File to its thumbnail by object identity", () => {
    const fileA = new File([], "a.jpg");
    const fileB = new File([], "b.jpg");
    const map = buildRetryThumbMap([fileA, fileB], ["thumb-A", "thumb-B"]);
    expect(map.get(fileA)).toBe("thumb-A");
    expect(map.get(fileB)).toBe("thumb-B");
  });

  it("a new File with the same name is NOT found in the map (identity, not name)", () => {
    const fileA = new File([], "a.jpg");
    const map = buildRetryThumbMap([fileA], ["thumb-A"]);
    const impostor = new File([], "a.jpg"); // same name, different object
    expect(map.get(impostor)).toBeUndefined();
  });
});

// ── Full retry cycle ──────────────────────────────────────────────────────────

describe("thumbnail ↔ file pairing — full retry cycle", () => {
  it("cycle 1: partial fail → reorder → retry → partial fail again → thumbnails stay paired", async () => {
    // ── Initial batch: 5 files, 3 succeed, fileC and fileE fail ───────────
    const [, , fileC, , fileE] = Array.from({ length: 5 }, (_, i) =>
      new File([], `photo-${String.fromCharCode(65 + i)}.jpg`),
    );

    // First failure: generate thumbnails from scratch (async, like production).
    const failedAfterFirst = [fileC, fileE];
    const thumbsAfterFirst = await resolveThumbnails(
      failedAfterFirst,
      undefined, // no prior map on first upload
      (f) => Promise.resolve(`thumb-${f.name}`),
    );
    expect(thumbsAfterFirst).toEqual(["thumb-photo-C.jpg", "thumb-photo-E.jpg"]);

    // ── User reorders: moves slot 1 (fileE) to slot 0 ─────────────────────
    const retryFiles  = reorderStrip(failedAfterFirst, 1, 0);
    const retryThumbs = reorderStrip(thumbsAfterFirst, 1, 0);

    expect(retryFiles[0]).toBe(fileE);
    expect(retryThumbs[0]).toBe("thumb-photo-E.jpg");
    expect(retryFiles[1]).toBe(fileC);
    expect(retryThumbs[1]).toBe("thumb-photo-C.jpg");

    // ── Retry button builds the map ────────────────────────────────────────
    const thumbMapForRetry = buildRetryThumbMap(retryFiles, retryThumbs);
    expect(thumbMapForRetry.get(fileE)).toBe("thumb-photo-E.jpg");
    expect(thumbMapForRetry.get(fileC)).toBe("thumb-photo-C.jpg");

    // ── Second batch: both files fail again ────────────────────────────────
    const failedAfterRetry = [fileE, fileC];
    const thumbsAfterRetry = await resolveThumbnails(
      failedAfterRetry,
      thumbMapForRetry,
      () => Promise.resolve("REGENERATED"), // must NOT be called — map has both files
    );

    // Each file must still map to its own thumbnail, not its neighbour's.
    expect(thumbsAfterRetry[0]).toBe("thumb-photo-E.jpg"); // fileE → thumb-E
    expect(thumbsAfterRetry[1]).toBe("thumb-photo-C.jpg"); // fileC → thumb-C
  });

  it("cycle 2: same two photos fail twice; map lookup never returns the wrong thumb", async () => {
    const fileX = new File([], "x.jpg");
    const fileY = new File([], "y.jpg");

    // First failure: generate thumbnails asynchronously (mirrors production).
    const firstThumbs = await resolveThumbnails(
      [fileX, fileY],
      undefined,
      (f) => Promise.resolve(`gen-${f.name}`),
    );
    expect(firstThumbs).toEqual(["gen-x.jpg", "gen-y.jpg"]);

    // Build map and retry with reversed order (simulating non-deterministic
    // batch failure order on the second attempt).
    const map1 = buildRetryThumbMap([fileX, fileY], firstThumbs);
    const secondThumbs = await resolveThumbnails(
      [fileY, fileX],
      map1,
      () => Promise.resolve("WRONG-THUMB"),
    );

    // Map is keyed by File identity, not position, so reversed order still
    // returns the correct thumbnails.
    expect(secondThumbs[0]).toBe("gen-y.jpg"); // fileY → gen-y
    expect(secondThumbs[1]).toBe("gen-x.jpg"); // fileX → gen-x
  });

  it("cycle 3: reorder → retry → partial success → remaining file keeps its thumbnail", async () => {
    const [file1, file2, file3] = [
      new File([], "1.jpg"),
      new File([], "2.jpg"),
      new File([], "3.jpg"),
    ];

    // All 3 fail initially.
    let files  = [file1, file2, file3];
    let thumbs = await resolveThumbnails(
      files,
      undefined,
      (f) => Promise.resolve(`t-${f.name}`),
    );
    // ["t-1.jpg", "t-2.jpg", "t-3.jpg"]

    // User drags file2 from slot 1 to slot 0.
    files  = reorderStrip(files,  1, 0);
    thumbs = reorderStrip(thumbs, 1, 0);
    // files: [file2, file1, file3], thumbs: ["t-2.jpg", "t-1.jpg", "t-3.jpg"]

    // Build the map and retry.
    const retryMap = buildRetryThumbMap(files, thumbs);

    // On retry, file2 succeeds; file1 and file3 fail again.
    const stillFailed = [file1, file3];
    const survivingThumbs = await resolveThumbnails(
      stillFailed,
      retryMap,
      () => Promise.resolve("GENERATED"),
    );

    // file1 and file3 must keep their own thumbnails, not each other's.
    expect(survivingThumbs[0]).toBe("t-1.jpg"); // file1 → t-1
    expect(survivingThumbs[1]).toBe("t-3.jpg"); // file3 → t-3
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("thumbnail ↔ file pairing — edge cases", () => {
  it("single file failing twice reuses its thumbnail without regenerating", async () => {
    const file = new File([], "solo.jpg");
    const firstThumbs = await resolveThumbnails(
      [file],
      undefined,
      () => Promise.resolve("gen-solo"),
    );
    expect(firstThumbs).toEqual(["gen-solo"]);

    const map = buildRetryThumbMap([file], firstThumbs);
    const secondThumbs = await resolveThumbnails(
      [file],
      map,
      () => Promise.resolve("SHOULD-NOT-CALL"),
    );
    expect(secondThumbs).toEqual(["gen-solo"]);
  });

  it("map from a previous batch does not bleed into a new batch of fresh files", async () => {
    const oldFile = new File([], "old.jpg");
    const newFile = new File([], "new.jpg"); // different File object, not in map

    const oldMap = buildRetryThumbMap([oldFile], ["old-thumb"]);
    const result = await resolveThumbnails(
      [newFile],
      oldMap,
      (f) => Promise.resolve(`generated-${f.name}`),
    );

    // newFile is not in oldMap → fallback to generate()
    expect(result).toEqual(["generated-new.jpg"]);
  });

  it("multiple reorders in sequence keep pairing consistent throughout", async () => {
    const [fA, fB, fC, fD] = Array.from({ length: 4 }, (_, i) =>
      new File([], `${["A", "B", "C", "D"][i]}.jpg`),
    );
    let files  = [fA, fB, fC, fD];
    let thumbs = ["tA", "tB", "tC", "tD"];

    // Reorder 1: move slot 3 to slot 0.
    files  = reorderStrip(files,  3, 0);
    thumbs = reorderStrip(thumbs, 3, 0);
    // [fD, fA, fB, fC], ["tD", "tA", "tB", "tC"]

    // Reorder 2: move slot 0 to slot 2.
    files  = reorderStrip(files,  0, 2);
    thumbs = reorderStrip(thumbs, 0, 2);
    // [fA, fB, fD, fC], ["tA", "tB", "tD", "tC"]

    // Verify each file is still paired with its own thumbnail.
    const labelOf = (f: File) => f.name.replace(".jpg", ""); // "A", "B", …
    files.forEach((f, i) => {
      expect(thumbs[i]).toBe(`t${labelOf(f)}`);
    });

    // Build map and simulate a retry where all fail again (async generator).
    const map = buildRetryThumbMap(files, thumbs);
    const resolved = await resolveThumbnails(
      files,
      map,
      () => Promise.resolve("GENERATED"),
    );
    files.forEach((f, i) => {
      expect(resolved[i]).toBe(`t${labelOf(f)}`);
    });
  });
});
