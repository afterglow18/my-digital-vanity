/**
 * QuickAddSheet
 *
 * Upload flow (with photo cleanup):
 *
 *   pick ──(file chosen)──► cleaning ──► comparing ──► uploading ──► close
 *                                   └──(no subject / error)──► uploading
 *
 * "cleaning"  — Vision framework processes the photo on-device (~1-3 s)
 * "comparing" — user chooses Original or Cleaned before saving
 *
 * Falls back to the original save-immediately flow on web or when the
 * plugin is unavailable.
 */
import React, { useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Check, Sparkles } from "lucide-react";
import { useCreateClothingItem, getListClothingQueryKey } from "@/hooks/useLocalWardrobe";
import type { ClothingItem } from "@/types/local";
import { useQueryClient } from "@tanstack/react-query";
import { encodeToPng } from "@/lib/processImage";
import { PhotoCleanup, blobToBase64, isPhotoCleanupAvailable } from "@/lib/photoCleanup";
import { PhotoCompareSheet } from "@/components/clothing/PhotoCompareSheet";

// ── Types ──────────────────────────────────────────────────────────────────────

type Category = "makeup" | "skincare" | "hair" | "fragrances";

const CATEGORY_LABELS: Record<Category, string> = {
  makeup:     "Makeup",
  skincare:   "Skincare",
  hair:       "Haircare",
  fragrances: "Fragrance",
};

type Phase = "pick" | "cleaning" | "comparing" | "uploading";

interface UploadProgress { done: number; total: number; }

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Compress a Blob to a JPEG data URL capped at 800 px wide. */
async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      const scale  = Math.min(1, 800 / img.naturalWidth);
      canvas.width  = Math.round(img.naturalWidth  * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = reject;
    img.src = url;
  });
}

/** Convert a base64 string (no prefix) to a data URL for display. */
function base64ToDataUrl(b64: string): string {
  return `data:image/jpeg;base64,${b64}`;
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  open:          boolean;
  onOpenChange:  (open: boolean) => void;
  category:      Category;
  existingCount: number;
  onCreated?:    (item: ClothingItem) => void;
}

const PHOTO_TIPS = [
  "Photograph individual products or bundle multiple items together.",
  "Lay everything flat on a plain background.",
  "Take the photo from directly above.",
  "Keep all items fully in frame.",
] as const;

export function QuickAddSheet({ open, onOpenChange, category, existingCount, onCreated }: Props) {
  const [phase,    setPhase]    = useState<Phase>("pick");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);

  // Comparison state
  const [originalDataUrl, setOriginalDataUrl] = useState<string>("");
  const [cleanedDataUrl,  setCleanedDataUrl]  = useState<string>("");
  const [hadSubject,      setHadSubject]      = useState(false);
  // Pending file metadata for after comparison
  const pendingMeta = useRef<{ countOffset: number } | null>(null);
  const pendingCount = useRef(0);

  const cameraInputRef  = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const createItem  = useCreateClothingItem();
  const queryClient = useQueryClient();

  const handleClose = useCallback(() => {
    setPhase("pick");
    setErrorMsg(null);
    setOriginalDataUrl("");
    setCleanedDataUrl("");
    pendingMeta.current = null;
    onOpenChange(false);
  }, [onOpenChange]);

  /** Save a data URL as a clothing item. */
  const saveDataUrl = useCallback(async (
    dataUrl: string,
    countOffset: number,
  ): Promise<boolean> => {
    const label    = CATEGORY_LABELS[category];
    const n        = existingCount + countOffset + 1;
    const autoName = n === 1 ? label : `${label} ${n}`;
    return new Promise<boolean>((resolve) => {
      createItem.mutate(
        { data: { name: autoName, category, imageObjectPath: dataUrl } },
        {
          onSuccess: (createdItem) => {
            queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
            if (onCreated) onCreated(createdItem);
            resolve(true);
          },
          onError: () => resolve(false),
        },
      );
    });
  }, [category, existingCount, createItem, queryClient, onCreated]);

  /**
   * Core single-file handler.
   * 1. Encode to PNG (normalises orientation).
   * 2. Make a 1200px JPEG for Vision (better results than 800px).
   * 3. On native: run PhotoCleanup plugin.
   *    - If a subject is detected → show comparison.
   *    - Otherwise → save original immediately.
   * 4. On web: save original immediately.
   */
  const handleFile = useCallback(async (file: File, countOffset = 0): Promise<boolean | "comparing"> => {
    let png: Blob;
    try {
      png = await encodeToPng(file);
    } catch (err) {
      console.error("[QuickAdd] PNG encoding failed:", err);
      return false;
    }

    // Always prepare the 800px original for storage / comparison display
    const origDataUrl = await blobToDataUrl(png);

    if (!isPhotoCleanupAvailable()) {
      // Web / dev — skip Vision entirely
      return saveDataUrl(origDataUrl, countOffset);
    }

    // Native path: run Vision cleanup
    try {
      const b64    = await blobToBase64(png, 1200);
      const result = await PhotoCleanup.processPhoto({ imageData: b64 });

      console.log(
        `[PhotoCleanup] supported:${result.supported} hadSubject:${result.hadSubject}`,
      );

      if (result.hadSubject) {
        // Show comparison — defer save until user chooses
        const cleanedUrl = base64ToDataUrl(result.cleanedImageData);
        setOriginalDataUrl(origDataUrl);
        setCleanedDataUrl(cleanedUrl);
        setHadSubject(result.hadSubject);
        pendingMeta.current = { countOffset };
        setPhase("comparing");
        return "comparing";
      }

      // No subject or enhancement-only — save original without comparison
      // (Vision ran but the result is essentially the same as original)
      return saveDataUrl(origDataUrl, countOffset);

    } catch (err) {
      console.warn("[PhotoCleanup] Plugin error — saving original:", err);
      return saveDataUrl(origDataUrl, countOffset);
    }
  }, [saveDataUrl]);

  /** Called from PhotoCompareSheet when user picks original or cleaned. */
  const handleCompareSelect = useCallback(async (chosenDataUrl: string) => {
    const meta = pendingMeta.current;
    if (!meta) return;
    setPhase("uploading");
    setProgress({ done: 0, total: 1 });
    await saveDataUrl(chosenDataUrl, meta.countOffset);
    setProgress({ done: 1, total: 1 });
    handleClose();
  }, [saveDataUrl, handleClose]);

  const handleCompareCancel = useCallback(() => {
    // User cancelled comparison — go back to pick
    setOriginalDataUrl("");
    setCleanedDataUrl("");
    pendingMeta.current = null;
    setPhase("pick");
  }, []);

  /** Handle a batch of files from the file inputs. */
  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setErrorMsg(null);
    setPhase(isPhotoCleanupAvailable() ? "cleaning" : "uploading");
    setProgress({ done: 0, total: files.length });
    pendingCount.current = files.length;

    // Single file: may show comparison
    if (files.length === 1) {
      const result = await handleFile(files[0], 0);
      if (result === "comparing") return; // hand off to comparison UI
      if (!result) {
        setErrorMsg("Could not save the photo. Please try again.");
        setPhase("pick");
      } else {
        handleClose();
      }
      setProgress(null);
      return;
    }

    // Multiple files: skip comparison, save all directly
    let saved = 0;
    for (let i = 0; i < files.length; i++) {
      const ok = await handleFile(files[i], i);
      if (ok && ok !== "comparing") saved++;
      setProgress({ done: i + 1, total: files.length });
    }
    if (saved === 0) {
      setErrorMsg("Could not save the photos. Please try again.");
      setPhase("pick");
    } else {
      handleClose();
    }
    setProgress(null);
  }, [handleFile, handleClose]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) handleFiles(files);
    e.target.value = "";
  };

  if (!open) return null;

  const label = CATEGORY_LABELS[category];

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[70] flex flex-col max-w-md mx-auto bg-[#f9f4ee]"
    >
      {/* Header — hidden during comparing (PhotoCompareSheet has its own) */}
      {phase !== "comparing" && (
        <div
          className="flex items-center justify-between px-4 pb-3 bg-white border-b-2 border-black flex-shrink-0"
          style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
        >
          <h2 className="font-display font-bold text-xl uppercase tracking-tight">
            Add {label}
          </h2>
          {phase === "pick" && (
            <button
              onClick={handleClose}
              className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                         bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                         active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <AnimatePresence mode="wait">

          {/* ── PICK ── */}
          {phase === "pick" && (
            <motion.div
              key="pick"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col p-5 gap-5 overflow-y-auto"
            >
              {errorMsg && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
                  {errorMsg}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex-1 flex flex-col items-center justify-center gap-3 py-8
                             border-4 border-black rounded-2xl bg-primary
                             shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]
                             active:translate-x-1 active:translate-y-1 active:shadow-none
                             transition-all"
                >
                  <span className="text-4xl leading-none">📷</span>
                  <span className="font-display font-bold text-base uppercase tracking-tight text-center leading-tight">
                    Take<br />Photo
                  </span>
                </button>

                <button
                  onClick={() => galleryInputRef.current?.click()}
                  className="flex-1 flex flex-col items-center justify-center gap-3 py-8
                             border-4 border-black rounded-2xl bg-white
                             shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]
                             active:translate-x-1 active:translate-y-1 active:shadow-none
                             transition-all"
                >
                  <span className="text-4xl leading-none">🖼️</span>
                  <span className="font-display font-bold text-base uppercase tracking-tight text-center leading-tight">
                    Upload<br />Photo
                  </span>
                </button>
              </div>

              {/* Clean Up badge — only on native */}
              {isPhotoCleanupAvailable() && (
                <div
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 border-black"
                  style={{ background: "#FFF0F6", borderColor: "#E8B0B8" }}
                >
                  <Sparkles className="w-4 h-4 flex-shrink-0" style={{ color: "#D0909A" }} />
                  <p className="text-xs font-semibold leading-snug" style={{ color: "#9A5060" }}>
                    <span className="font-black">Clean Up Photo</span> — background removal &amp; auto-enhance run on‑device after you add a photo.
                  </p>
                </div>
              )}

              <div className="border-2 border-black rounded-2xl bg-white p-4 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                <p className="font-display font-bold text-sm uppercase tracking-tight mb-3 flex items-center gap-2">
                  <span>📸</span> PHOTO TIPS
                </p>
                <ul className="flex flex-col gap-2">
                  {PHOTO_TIPS.map((tip) => (
                    <li key={tip} className="flex items-start gap-2 text-sm text-black/70 leading-snug">
                      <span className="mt-0.5 w-4 h-4 border-2 border-black rounded-sm bg-primary flex items-center justify-center flex-shrink-0">
                        <Check className="w-2.5 h-2.5" strokeWidth={3} />
                      </span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}

          {/* ── CLEANING ── */}
          {phase === "cleaning" && (
            <motion.div
              key="cleaning"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center gap-5 p-6"
            >
              <div
                className="w-28 h-28 rounded-3xl border-4 border-black flex items-center justify-center"
                style={{ background: "#FFF0F6", boxShadow: "6px 6px 0 #000" }}
              >
                <Sparkles className="w-12 h-12 animate-pulse" style={{ color: "#D0909A" }} />
              </div>
              <div className="text-center">
                <p className="font-display font-bold text-2xl uppercase tracking-tight">
                  Cleaning up…
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Removing background &amp; enhancing on‑device
                </p>
              </div>
            </motion.div>
          )}

          {/* ── COMPARING ── */}
          {phase === "comparing" && originalDataUrl && cleanedDataUrl && (
            <motion.div
              key="comparing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <PhotoCompareSheet
                originalDataUrl={originalDataUrl}
                cleanedDataUrl={cleanedDataUrl}
                hadSubject={hadSubject}
                onSelect={handleCompareSelect}
                onCancel={handleCompareCancel}
              />
            </motion.div>
          )}

          {/* ── UPLOADING ── */}
          {phase === "uploading" && (
            <motion.div
              key="uploading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center gap-5 p-6"
            >
              <div className="w-28 h-28 border-4 border-black rounded-3xl bg-white
                              flex items-center justify-center shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                <Loader2 className="w-12 h-12 animate-spin" strokeWidth={1.5} />
              </div>
              <div className="text-center">
                <p className="font-display font-bold text-2xl uppercase tracking-tight">Saving…</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {progress && progress.total > 1
                    ? `${progress.done} of ${progress.total} photos added.`
                    : "Adding to your vanity."}
                </p>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleInputChange}
      />
    </motion.div>
  );
}
