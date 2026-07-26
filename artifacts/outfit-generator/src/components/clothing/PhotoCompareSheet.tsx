/**
 * PhotoCompareSheet — side-by-side Original vs Cleaned comparison.
 *
 * Props:
 *   originalDataUrl  — JPEG data URL of the original photo
 *   cleanedDataUrl   — JPEG data URL of the processed photo (ignored when cleanupError set)
 *   hadSubject       — whether Vision found a foreground subject
 *   cleanupError     — when set, Cleaned panel shows a graceful error state
 *   cancelLabel      — label for the dismiss/retake button (default "Cancel")
 *   onSelect(url)    — called with the chosen data URL
 *   onCancel         — user dismissed without choosing
 */
import React, { useState } from "react";
import { motion } from "framer-motion";
import { Check, Sparkles, RotateCcw, Loader2 } from "lucide-react";
import type { RemovalProgress } from "@/lib/backgroundRemoval";

const ROSE      = "#E8B0B8";
const ROSE_DARK = "#D0909A";

interface Props {
  originalDataUrl: string;
  cleanedDataUrl:  string;
  hadSubject:      boolean;
  cleanupError?:   string | null;
  bgProcessing?:   boolean;
  /** Current removal progress — used to show download % on first model load. */
  removalProgress?: RemovalProgress | null;
  cancelLabel?:    string;
  /** Shown above the title when processing a batch, e.g. "Photo 2 of 5" */
  batchProgress?:  string;
  onSelect:        (dataUrl: string) => void;
  onCancel:        () => void;
}

type Choice = "original" | "cleaned";

export function PhotoCompareSheet({
  originalDataUrl,
  cleanedDataUrl,
  hadSubject,
  cleanupError,
  bgProcessing = false,
  removalProgress,
  cancelLabel = "Cancel",
  batchProgress,
  onSelect,
  onCancel,
}: Props) {
  // Start on "original" while removal is still running; auto-switch to "cleaned"
  // once the result arrives.
  const [chosen, setChosen] = useState<Choice>("original");

  // Auto-select cleaned version when it becomes available.
  React.useEffect(() => {
    if (cleanedDataUrl && !cleanupError) setChosen("cleaned");
  }, [cleanedDataUrl, cleanupError]);

  const hasClean = !!cleanedDataUrl && !cleanupError;

  const handleSave = () => {
    // Guard: if cleaned isn't ready yet, fall back to original.
    onSelect(chosen === "cleaned" && cleanedDataUrl ? cleanedDataUrl : originalDataUrl);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="flex flex-col h-full"
      style={{ background: "#f9f4ee" }}
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 pb-3 bg-white border-b-2 border-black flex-shrink-0"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
      >
        <div>
          {batchProgress && (
            <p className="text-[10px] font-black uppercase tracking-widest text-black/35 mb-0.5">
              {batchProgress}
            </p>
          )}
          <h2 className="font-display font-bold text-xl uppercase tracking-tight leading-none">
            Remove Background
          </h2>
          <p className="text-xs text-black/50 font-medium mt-0.5">
            {cleanupError
              ? "Background removal unavailable — save original"
              : bgProcessing && removalProgress?.stage === "loading"
                ? `Downloading model… ${removalProgress.pct}%`
                : bgProcessing
                  ? "Removing background…"
                  : hadSubject
                    ? "Background removed · tap to choose"
                    : "Photo enhanced on‑device"}
          </p>
          {/* Download progress bar — only visible during first-time model fetch */}
          {bgProcessing && removalProgress?.stage === "loading" && (
            <div className="mt-1.5 h-1 w-48 max-w-full rounded-full bg-black/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${removalProgress.pct}%`,
                  background: ROSE_DARK,
                }}
              />
            </div>
          )}
        </div>
        <div
          className="flex items-center gap-1 px-2.5 py-1 rounded-full border-2 border-black text-[10px] font-black uppercase tracking-widest"
          style={{ background: ROSE }}
        >
          <Sparkles className="w-3 h-3" />
          On‑device
        </div>
      </div>

      {/* ── Comparison cards ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">

        {/* Labels row */}
        <div className="flex gap-3 flex-shrink-0">
          {(["original", "cleaned"] as Choice[]).map(id => (
            <div key={id} className="flex-1 text-center">
              <span
                className="text-[10px] font-black uppercase tracking-widest"
                style={{
                  color: (id === "cleaned" && (!cleanedDataUrl || !!cleanupError))
                    ? "#ccc"
                    : chosen === id ? ROSE_DARK : "#aaa",
                }}
              >
                {id === "original" ? "Original" : "Cleaned ✨"}
              </span>
            </div>
          ))}
        </div>

        {/* Image cards */}
        <div className="flex gap-3 flex-1 min-h-0">

          {/* Original card — always selectable */}
          <button
            onClick={() => setChosen("original")}
            className="flex-1 relative rounded-2xl overflow-hidden border-4 transition-all active:scale-[0.98]"
            style={{
              borderColor: chosen === "original" ? ROSE_DARK : "#ddd",
              boxShadow:   chosen === "original" ? `4px 4px 0 ${ROSE_DARK}` : "none",
            }}
          >
            <img
              src={originalDataUrl}
              alt="original"
              className="w-full h-full object-cover"
              draggable={false}
            />
            {chosen === "original" && (
              <div
                className="absolute bottom-2 right-2 w-7 h-7 rounded-full flex items-center justify-center border-2 border-white"
                style={{ background: ROSE_DARK }}
              >
                <Check className="w-4 h-4 text-white" strokeWidth={3} />
              </div>
            )}
          </button>

          {/* Cleaned card — three states: image ready / still processing / error */}
          {cleanedDataUrl && !cleanupError ? (
            /* Image available — selectable */
            <button
              onClick={() => setChosen("cleaned")}
              className="flex-1 relative rounded-2xl overflow-hidden border-4 transition-all active:scale-[0.98]"
              style={{
                borderColor: chosen === "cleaned" ? ROSE_DARK : "#ddd",
                boxShadow:   chosen === "cleaned" ? `4px 4px 0 ${ROSE_DARK}` : "none",
              }}
            >
              <img
                src={cleanedDataUrl}
                alt="cleaned"
                className="w-full h-full object-cover"
                draggable={false}
              />
              {chosen === "cleaned" && (
                <div
                  className="absolute bottom-2 right-2 w-7 h-7 rounded-full flex items-center justify-center border-2 border-white"
                  style={{ background: ROSE_DARK }}
                >
                  <Check className="w-4 h-4 text-white" strokeWidth={3} />
                </div>
              )}
            </button>
          ) : bgProcessing && !cleanupError ? (
            /* Still processing — checkerboard with spinner + stage-aware label */
            <div
              className="flex-1 relative rounded-2xl border-4 border-dashed flex flex-col items-center justify-center gap-2 p-3"
              style={{
                borderColor: "#ddd",
                background: "repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%) 0 0 / 12px 12px",
              }}
            >
              <Loader2 className="w-8 h-8 animate-spin" style={{ opacity: 0.4 }} />
              {removalProgress?.stage === "loading" ? (
                <>
                  <p className="text-[11px] font-bold text-black/30 uppercase tracking-wider text-center leading-tight">
                    {removalProgress.pct}%
                  </p>
                  <div className="w-16 h-1 rounded-full bg-black/10 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${removalProgress.pct}%`, background: ROSE_DARK, opacity: 0.5 }}
                    />
                  </div>
                </>
              ) : (
                <p className="text-[11px] font-bold text-black/30 uppercase tracking-wider text-center leading-tight">
                  {removalProgress?.stage === "inferring" ? "Removing…" : "Processing"}
                </p>
              )}
            </div>
          ) : (
            /* Error state — not selectable */
            <div
              className="flex-1 relative rounded-2xl overflow-hidden border-4 border-dashed flex flex-col items-center justify-center gap-2 p-3"
              style={{ borderColor: "#ddd", background: "#f5f5f5" }}
            >
              <Sparkles className="w-8 h-8 opacity-20" />
              <p className="text-[11px] font-bold text-black/30 uppercase tracking-wider text-center leading-tight">
                Unavailable
              </p>
              <p className="text-[10px] text-black/25 text-center leading-snug">
                Couldn't process this photo
              </p>
            </div>
          )}
        </div>

        {/* Tap hint */}
        {bgProcessing && !cleanupError && (
          <p className="text-center text-[11px] text-black/35 font-medium flex-shrink-0">
            This will take a moment…
          </p>
        )}
        {hasClean && !bgProcessing && (
          <p className="text-center text-[11px] text-black/35 font-medium flex-shrink-0">
            Tap a photo to select it
          </p>
        )}
      </div>

      {/* ── CTA ─────────────────────────────────────────────────────────────── */}
      <div
        className="px-4 flex flex-col gap-2 flex-shrink-0 bg-white border-t-2 border-black"
        style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))", paddingTop: 12 }}
      >
        <button
          onClick={handleSave}
          disabled={bgProcessing}
          className="w-full py-4 rounded-xl font-black text-base uppercase tracking-wide
                     text-black border-2 border-black transition-all
                     active:translate-y-0.5 active:shadow-none disabled:opacity-50"
          style={{
            background:  `linear-gradient(to bottom, ${ROSE}, ${ROSE_DARK})`,
            boxShadow:   "3px 3px 0 rgba(0,0,0,0.85)",
            letterSpacing: "0.05em",
          }}
        >
          {bgProcessing
            ? "Processing…"
            : !hasClean
              ? "Save Photo"
              : chosen === "cleaned"
                ? "✨ Save Cleaned Version"
                : "Save Original"}
        </button>
        <button
          onClick={onCancel}
          className="flex items-center justify-center gap-1.5 text-xs font-bold text-black/40 hover:text-black/60 transition-colors text-center py-1"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {cancelLabel}
        </button>
      </div>
    </motion.div>
  );
}
