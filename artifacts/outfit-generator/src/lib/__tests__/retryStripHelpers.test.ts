import { describe, it, expect } from "vitest";
import { buildRetryStripState, errorMsgForRemainingFailures } from "../retryStripHelpers";

// ─── buildRetryStripState ────────────────────────────────────────────────────

describe("buildRetryStripState — all succeed", () => {
  it("returns clearFailed=true and no error message when everything uploads", () => {
    const state = buildRetryStripState({
      succeededCount: 5,
      failedCount: 0,
      totalAttempted: 5,
      anyQuotaError: false,
    });
    expect(state.clearFailed).toBe(true);
    expect(state.errorMsg).toBeNull();
  });
});

describe("buildRetryStripState — total failure", () => {
  it("shows '0 of N photos saved' for a multi-photo all-fail", () => {
    const state = buildRetryStripState({
      succeededCount: 0,
      failedCount: 4,
      totalAttempted: 4,
      anyQuotaError: false,
    });
    expect(state.clearFailed).toBe(false);
    expect(state.errorMsg).toBe("0 of 4 photos saved. Please try again.");
  });

  it("uses singular 'photo' for a single failed upload", () => {
    const state = buildRetryStripState({
      succeededCount: 0,
      failedCount: 1,
      totalAttempted: 1,
      anyQuotaError: false,
    });
    expect(state.clearFailed).toBe(false);
    expect(state.errorMsg).toBe("0 of 1 photo saved. Please try again.");
  });

  it("shows quota message when anyQuotaError is true (all fail)", () => {
    const state = buildRetryStripState({
      succeededCount: 0,
      failedCount: 3,
      totalAttempted: 3,
      anyQuotaError: true,
    });
    expect(state.clearFailed).toBe(false);
    expect(state.errorMsg).toBe(
      "Your device storage is full — free up space and try again.",
    );
  });
});

describe("buildRetryStripState — partial failure", () => {
  it("shows 'X of N saved, M couldn't be added' for a partial failure", () => {
    const state = buildRetryStripState({
      succeededCount: 2,
      failedCount: 1,
      totalAttempted: 3,
      anyQuotaError: false,
    });
    expect(state.clearFailed).toBe(false);
    expect(state.errorMsg).toBe("2 of 3 photos saved. 1 couldn't be added.");
  });

  it("reflects the correct count after removing one failed photo and retrying", () => {
    // Scenario: 3 files uploaded → 2 succeeded, 1 failed.
    // User removes the failed photo and retries the remaining 2 (which are
    // currently in failedFiles). On the retry, 1 of those 2 succeeds and 1
    // still fails — totalAttempted is now 2 (the retry batch size).
    const firstAttempt = buildRetryStripState({
      succeededCount: 2,
      failedCount: 1,
      totalAttempted: 3,
      anyQuotaError: false,
    });
    expect(firstAttempt.errorMsg).toBe("2 of 3 photos saved. 1 couldn't be added.");

    // User removes the single failed photo (now failedFiles has 0), leaving
    // errorMsgForRemainingFailures to clear the banner.
    expect(errorMsgForRemainingFailures(0)).toBeNull();
  });

  it("partial failure → user removes one failed photo → retry remaining → correct message", () => {
    // Initial upload: 4 files, 3 succeed, 1 fails.
    const firstAttempt = buildRetryStripState({
      succeededCount: 3,
      failedCount: 1,
      totalAttempted: 4,
      anyQuotaError: false,
    });
    expect(firstAttempt.errorMsg).toBe("3 of 4 photos saved. 1 couldn't be added.");

    // User does NOT remove; hits Retry with 1 failed photo.
    // On retry, the 1 photo succeeds.
    const retry = buildRetryStripState({
      succeededCount: 1,
      failedCount: 0,
      totalAttempted: 1,
      anyQuotaError: false,
    });
    expect(retry.clearFailed).toBe(true);
    expect(retry.errorMsg).toBeNull();
  });

  it("shows quota message for a partial quota failure", () => {
    const state = buildRetryStripState({
      succeededCount: 1,
      failedCount: 2,
      totalAttempted: 3,
      anyQuotaError: true,
    });
    expect(state.clearFailed).toBe(false);
    expect(state.errorMsg).toBe(
      "1 of 3 photos saved. Device storage is full — free up space to add the rest.",
    );
  });
});

describe("buildRetryStripState — all-fail → remove some → retry remaining", () => {
  it("'0 of 3' on first attempt; after removing 2, retrying 1 that then fails shows '0 of 1'", () => {
    // First attempt: all 3 fail.
    const first = buildRetryStripState({
      succeededCount: 0,
      failedCount: 3,
      totalAttempted: 3,
      anyQuotaError: false,
    });
    expect(first.errorMsg).toBe("0 of 3 photos saved. Please try again.");

    // User removes 2 of the 3 from the strip.
    // Strip now has 1 file; user hits Retry.
    const retry = buildRetryStripState({
      succeededCount: 0,
      failedCount: 1,
      totalAttempted: 1,
      anyQuotaError: false,
    });
    expect(retry.errorMsg).toBe("0 of 1 photo saved. Please try again.");
    expect(retry.clearFailed).toBe(false);
  });

  it("'0 of N' retry with partial success produces the right partial message", () => {
    // All 3 fail initially.
    const first = buildRetryStripState({
      succeededCount: 0,
      failedCount: 3,
      totalAttempted: 3,
      anyQuotaError: false,
    });
    expect(first.errorMsg).toBe("0 of 3 photos saved. Please try again.");

    // User retries all 3; this time 2 succeed, 1 still fails.
    const retry = buildRetryStripState({
      succeededCount: 2,
      failedCount: 1,
      totalAttempted: 3,
      anyQuotaError: false,
    });
    expect(retry.errorMsg).toBe("2 of 3 photos saved. 1 couldn't be added.");
    expect(retry.clearFailed).toBe(false);
  });
});

describe("buildRetryStripState — same photos fail twice in a row", () => {
  it("shows '0 of 2' on retry when both retried photos fail again (not '0 of 5')", () => {
    // Initial upload: 5 photos, 3 succeed, 2 fail.
    const firstAttempt = buildRetryStripState({
      succeededCount: 3,
      failedCount: 2,
      totalAttempted: 5,
      anyQuotaError: false,
    });
    expect(firstAttempt.errorMsg).toBe("3 of 5 photos saved. 2 couldn't be added.");
    expect(firstAttempt.clearFailed).toBe(false);

    // User retries the 2 failed photos; both fail again.
    // totalAttempted is now 2 (the retry batch size), not 5.
    const retryAttempt = buildRetryStripState({
      succeededCount: 0,
      failedCount: 2,
      totalAttempted: 2,
      anyQuotaError: false,
    });
    expect(retryAttempt.errorMsg).toBe("0 of 2 photos saved. Please try again.");
    expect(retryAttempt.clearFailed).toBe(false);
  });
});

// ─── errorMsgForRemainingFailures ────────────────────────────────────────────

describe("errorMsgForRemainingFailures — remove all failures → strip clears", () => {
  it("returns null when remainingCount is 0 (strip should dismiss)", () => {
    expect(errorMsgForRemainingFailures(0)).toBeNull();
  });

  it("returns null for negative values (defensive)", () => {
    expect(errorMsgForRemainingFailures(-1)).toBeNull();
  });

  it("returns a message for a single remaining failure", () => {
    const msg = errorMsgForRemainingFailures(1);
    expect(msg).toContain("1 photo");
    expect(msg).not.toContain("photos");
  });

  it("returns a message for multiple remaining failures", () => {
    const msg = errorMsgForRemainingFailures(3);
    expect(msg).toContain("3 photos");
  });

  it("strip clears after removing the last photo one by one", () => {
    // Simulate removing photos one at a time from a strip of 3.
    expect(errorMsgForRemainingFailures(3)).not.toBeNull();
    expect(errorMsgForRemainingFailures(2)).not.toBeNull();
    expect(errorMsgForRemainingFailures(1)).not.toBeNull();
    expect(errorMsgForRemainingFailures(0)).toBeNull(); // strip should clear
  });
});
