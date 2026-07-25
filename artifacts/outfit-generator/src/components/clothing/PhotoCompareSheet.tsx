/**
 * PhotoCompareSheet — side-by-side Original vs Cleaned comparison.
 *
 * Shown after the Vision plugin processes a photo.  The user taps to select
 * which version to save; the chosen data URL is passed to onSelect.
 *
 * Props:
 *   originalDataUrl  — JPEG data URL of the original photo
 *   cleanedDataUrl   — JPEG data URL of the cleaned (Vision-processed) photo
 *   hadSubject       — whether Vision found a foreground subject
 *   onSelect(dataUrl) — called with the chosen data URL
 *   onCancel         — user dismissed without choosing
 */
import React, { useState } from "react";
import { motion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";

const ROSE      = "#E8B0B8";
const ROSE_DARK = "#D0909A";

interface Props {
  originalDataUrl: string;
  cleanedDataUrl:  string;
  hadSubject:      boolean;
  onSelect:        (dataUrl: string) => void;
  onCancel:        () => void;
}

type Choice = "original" | "cleaned";

export function PhotoCompareSheet({
  originalDataUrl,
  cleanedDataUrl,
  hadSubject,
  onSelect,
  onCancel,
}: Props) {
  const [chosen, setChosen] = useState<Choice>("cleaned");

  const handleSave = () => {
    onSelect(chosen === "cleaned" ? cleanedDataUrl : originalDataUrl);
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
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 pb-3 bg-white border-b-2 border-black flex-shrink-0"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
      >
        <div>
          <h2 className="font-display font-bold text-xl uppercase tracking-tight leading-none">
            Clean Up Photo
          </h2>
          <p className="text-xs text-black/50 font-medium mt-0.5">
            {hadSubject
              ? "Background removed · photo enhanced"
              : "Photo enhanced on-device"}
          </p>
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
                style={{ color: chosen === id ? ROSE_DARK : "#aaa" }}
              >
                {id === "original" ? "Original" : "Cleaned ✨"}
              </span>
            </div>
          ))}
        </div>

        {/* Image cards */}
        <div className="flex gap-3 flex-1 min-h-0">
          {(["original", "cleaned"] as Choice[]).map(id => {
            const src    = id === "original" ? originalDataUrl : cleanedDataUrl;
            const active = chosen === id;
            return (
              <button
                key={id}
                onClick={() => setChosen(id)}
                className="flex-1 relative rounded-2xl overflow-hidden border-4 transition-all active:scale-[0.98]"
                style={{
                  borderColor: active ? ROSE_DARK : "#ddd",
                  boxShadow:   active ? `4px 4px 0 ${ROSE_DARK}` : "none",
                }}
              >
                <img
                  src={src}
                  alt={id}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
                {/* Selected checkmark */}
                {active && (
                  <div
                    className="absolute bottom-2 right-2 w-7 h-7 rounded-full flex items-center justify-center border-2 border-white"
                    style={{ background: ROSE_DARK }}
                  >
                    <Check className="w-4 h-4 text-white" strokeWidth={3} />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Tap hint */}
        <p className="text-center text-[11px] text-black/35 font-medium flex-shrink-0">
          Tap a photo to select it
        </p>
      </div>

      {/* ── CTA ─────────────────────────────────────────────────────────────── */}
      <div
        className="px-4 flex flex-col gap-2 flex-shrink-0 bg-white border-t-2 border-black"
        style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))", paddingTop: 12 }}
      >
        <button
          onClick={handleSave}
          className="w-full py-4 rounded-xl font-black text-base uppercase tracking-wide
                     text-black border-2 border-black transition-all
                     active:translate-y-0.5 active:shadow-none"
          style={{
            background: `linear-gradient(to bottom, ${ROSE}, ${ROSE_DARK})`,
            boxShadow:  "3px 3px 0 rgba(0,0,0,0.85)",
            letterSpacing: "0.05em",
          }}
        >
          {chosen === "cleaned"
            ? "✨ Save Cleaned Version"
            : "Save Original"}
        </button>
        <button
          onClick={onCancel}
          className="text-xs font-bold text-black/40 hover:text-black/60 transition-colors text-center py-1"
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
}
