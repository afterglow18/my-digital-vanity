/**
 * Pure helpers for the failed-photo retry strip in QuickAddSheet.
 *
 * Extracted so they can be unit-tested without a DOM or React context.
 */

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
