/**
 * Pure helpers for the failed-photo retry strip in QuickAddSheet.
 *
 * Extracted so they can be unit-tested without a DOM or React context.
 */

// ── Thumbnail-map helpers ─────────────────────────────────────────────────────

/**
 * Build the File → thumbnail map that the Retry button passes to handleFiles.
 * Mirrors the `new Map(failedFiles.map(...))` expression in the Retry onClick.
 */
export function buildRetryThumbMap(files: File[], thumbs: string[]): Map<File, string> {
  return new Map(files.map((f, i) => [f, thumbs[i]]));
}

/**
 * For each file in `erroredFiles`, return its thumbnail from `existingMap`
 * when present (preserving custom order and avoiding redundant re-generation),
 * or call `generate(file)` to produce a fresh thumbnail.
 *
 * `generate` may be async (e.g. `fileToThumbnail` in production, or a
 * synchronous stub in tests). All results are resolved in parallel via
 * `Promise.all`.
 *
 * Mirrors the `errored.map((f) => existingThumbnailMap?.get(f) ?? fileToThumbnail(f))`
 * expression inside `handleFiles`.
 */
export async function resolveThumbnails(
  erroredFiles: File[],
  existingMap: Map<File, string> | undefined,
  generate: (f: File) => string | Promise<string>,
): Promise<string[]> {
  return Promise.all(
    erroredFiles.map((f) => existingMap?.get(f) ?? generate(f)),
  );
}

/**
 * Apply the drag-to-reorder splice to an array, returning a new array.
 * Mirrors the splice logic in `handleThumbRowPointerUp`.
 */
export function reorderStrip<T>(arr: T[], fromIdx: number, toIdx: number): T[] {
  const next = [...arr];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  return next;
}

export interface UploadBatchResult {
  succeededCount: number;
  failedCount: number;
  totalAttempted: number;
  anyQuotaError: boolean;
}

export interface RetryStripState {
  /** null means no error banner should be shown */
  errorMsg: string | null;
  /** true when the failed-file list should be cleared (all succeeded) */
  clearFailed: boolean;
}

/**
 * Derive the error message and clear-failed flag from a completed upload batch.
 *
 * Maps 1-to-1 with the corresponding branches in `handleFiles`.
 */
export function buildRetryStripState(result: UploadBatchResult): RetryStripState {
  const { succeededCount, failedCount, totalAttempted, anyQuotaError } = result;

  if (failedCount === 0) {
    // Everything succeeded — close the sheet, no error.
    return { errorMsg: null, clearFailed: true };
  }

  if (succeededCount === 0) {
    // Total failure.
    const n = failedCount;
    const errorMsg = anyQuotaError
      ? "Your device storage is full — free up space and try again."
      : `0 of ${n} photo${n !== 1 ? "s" : ""} saved. Please try again.`;
    return { errorMsg, clearFailed: false };
  }

  // Partial failure — keep the sheet open so the user can retry the remainder.
  const n = totalAttempted;
  const errorMsg = anyQuotaError
    ? `${succeededCount} of ${n} photo${n !== 1 ? "s" : ""} saved. ` +
      `Device storage is full — free up space to add the rest.`
    : `${succeededCount} of ${n} photo${n !== 1 ? "s" : ""} saved. ` +
      `${failedCount} couldn't be added.`;
  return { errorMsg, clearFailed: false };
}

/**
 * After the user removes some photos from the failed strip, re-derive what
 * the error message should look like for the remaining failures.
 *
 * Returns null when the strip should be dismissed (no more failures left).
 */
export function errorMsgForRemainingFailures(remainingCount: number): string | null {
  if (remainingCount <= 0) return null;
  return `${remainingCount} photo${remainingCount !== 1 ? "s" : ""} couldn't be added. ` +
         `Retry or remove them.`;
}
