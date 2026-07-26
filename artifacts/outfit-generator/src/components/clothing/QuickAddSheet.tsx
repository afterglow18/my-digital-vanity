/**
 * QuickAddSheet
 *
 * On native iOS — always shows comparison after photo capture:
 *
 *   pick ──(file chosen)──► cleaning ──► comparing ──► uploading ──► close
 *
 * "cleaning"  — Vision processes the photo on-device (~1-3 s)
 * "comparing" — user sees Original vs Cleaned side by side before saving
 *               If Vision fails, Cleaned panel shows a graceful unavailable state
 *               "Retake" button sends the user back to pick
 *
 * On web — photos save immediately (Vision not available).
 * Multi-file upload — photos save immediately (no comparison step).
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

async function fileToThumbnail(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      const SIZE = 120;
      const scale = Math.min(SIZE / img.naturalWidth, SIZE / img.naturalHeight, 1);
      canvas.width  = Math.round(img.naturalWidth  * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.75));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(""); };
    img.src = url;
  });
}

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

function base64ToDataUrl(b64: string): string {
  return `data:image/jpeg;base64,${b64}`;
}

/** Returns true if the error is an IndexedDB / browser storage quota error. */
function isQuotaError(err: unknown): boolean {
  if (err instanceof DOMException) {
    // Standard name check (Firefox, Chrome modern)
    if (err.name === "QuotaExceededError") return true;
    // Legacy numeric code (Safari, older Chrome)
    if (err.code === 22) return true;
  }
  if (err instanceof Error) {
    if (err.name === "QuotaExceededError") return true;
    if (err.message.toLowerCase().includes("quota")) return true;
  }
  return false;
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
  const [phase,              setPhase]             = useState<Phase>("pick");
  const [errorMsg,           setErrorMsg]          = useState<string | null>(null);
  const [progress,           setProgress]          = useState<UploadProgress | null>(null);
  const [failedFiles,        setFailedFiles]        = useState<File[]>([]);
  const [failedThumbnails,   setFailedThumbnails]   = useState<string[]>([]);

  // Comparison state
  const [originalDataUrl, setOriginalDataUrl] = useState<string>("");
  const [cleanedDataUrl,  setCleanedDataUrl]  = useState<string>("");
  const [hadSubject,      setHadSubject]      = useState(false);
  const [cleanupError,    setCleanupError]    = useState<string | null>(null);
  const pendingMeta = useRef<{ countOffset: number } | null>(null);

  const cameraInputRef  = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const createItem  = useCreateClothingItem();
  const queryClient = useQueryClient();

  const handleClose = useCallback(() => {
    setPhase("pick");
    setErrorMsg(null);
    setFailedFiles([]);
    setFailedThumbnails([]);
    setOriginalDataUrl("");
    setCleanedDataUrl("");
    setCleanupError(null);
    pendingMeta.current = null;
    onOpenChange(false);
  }, [onOpenChange]);

  const saveDataUrl = useCallback(async (dataUrl: string, countOffset: number): Promise<true | false | "quota"> => {
    const label    = CATEGORY_LABELS[category];
    const n        = existingCount + countOffset + 1;
    const autoName = n === 1 ? label : `${label} ${n}`;
    return new Promise<true | false | "quota">((resolve) => {
      createItem.mutate(
        { data: { name: autoName, category, imageObjectPath: dataUrl } },
        {
          onSuccess: (createdItem) => {
            queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
            if (onCreated) onCreated(createdItem);
            resolve(true);
          },
          onError: (err) => resolve(isQuotaError(err) ? "quota" : false),
        },
      );
    });
  }, [category, existingCount, createItem, queryClient, onCreated]);

  /**
   * Core single-file handler.
   * On native iOS: always transitions to "comparing" so the user can
   * review (and choose Original or Cleaned) before anything is saved.
   * On web: saves immediately.
   */
  const handleFile = useCallback(async (file: File, countOffset = 0): Promise<"comparing" | true | false | "quota"> => {
    let png: Blob;
    try {
      png = await encodeToPng(file);
    } catch (err) {
      console.error("[QuickAdd] PNG encoding failed:", err);
      return false;
    }

    const origDataUrl = await blobToDataUrl(png);

    // Always show comparison for single-file captures on all platforms.
    // On native iOS: Vision runs and produces a cleaned version.
    // On web: the cleaned panel shows a friendly "not available" message.
    let cleanedUrl   = origDataUrl;
    let subjectFound = false;
    let visionErr: string | null = isPhotoCleanupAvailable()
      ? null
      : "Clean Up is only available in the iOS app.";

    if (isPhotoCleanupAvailable()) {
      try {
        const b64    = await blobToBase64(png, 1200);
        const result = await PhotoCleanup.processPhoto({ imageData: b64 });
        cleanedUrl   = base64ToDataUrl(result.cleanedImageData);
        subjectFound = result.hadSubject;
      } catch (err) {
        console.warn("[PhotoCleanup] Plugin error:", err);
        visionErr = "Clean Up couldn't run on this photo.";
      }
    }

    setOriginalDataUrl(origDataUrl);
    setCleanedDataUrl(cleanedUrl);
    setHadSubject(subjectFound);
    setCleanupError(visionErr);
    pendingMeta.current = { countOffset };
    setPhase("comparing");
    return "comparing";
  }, [saveDataUrl]);

  const handleCompareSelect = useCallback(async (chosenDataUrl: string) => {
    const meta = pendingMeta.current;
    if (!meta) return;
    setPhase("uploading");
    setProgress({ done: 0, total: 1 });
    const result = await saveDataUrl(chosenDataUrl, meta.countOffset);
    setProgress({ done: 1, total: 1 });
    if (result === true) {
      handleClose();
    } else {
      setPhase("pick");
      setProgress(null);
      setErrorMsg(
        result === "quota"
          ? "Your device storage is full — free up space and try again."
          : "Could not save the photo. Please try again.",
      );
    }
  }, [saveDataUrl, handleClose]);

  const handleRetake = useCallback(() => {
    setOriginalDataUrl("");
    setCleanedDataUrl("");
    setCleanupError(null);
    pendingMeta.current = null;
    setPhase("pick");
  }, []);

  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setErrorMsg(null);
    setPhase(files.length === 1 ? "cleaning" : "uploading");
    setProgress({ done: 0, total: files.length });

    if (files.length === 1) {
      const result = await handleFile(files[0], 0);
      if (result === "comparing") return; // hand off to comparison UI
      if (result !== true) {
        setErrorMsg(
          result === "quota"
            ? "Your device storage is full — free up space and try again."
            : "Could not save the photo. Please try again.",
        );
        setPhase("pick");
      } else {
        handleClose();
      }
      setProgress(null);
      return;
    }

    // Multiple files — save all directly, skip comparison
    const succeeded: File[] = [];
    const errored:   File[] = [];
    let anyQuotaError = false;
    for (let i = 0; i < files.length; i++) {
      setProgress({ done: i, total: files.length });
      const ok = await handleFile(files[i], i);
      if (ok === true) {
        succeeded.push(files[i]);
      } else {
        if (ok === "quota") anyQuotaError = true;
        errored.push(files[i]);
      }
    }
    setProgress(null);
    if (succeeded.length === 0) {
      const thumbs = await Promise.all(errored.map((f) => fileToThumbnail(f)));
      setFailedThumbnails(thumbs);
      setFailedFiles(errored);
      setErrorMsg(
        anyQuotaError
          ? "Your device storage is full — free up space and try again."
          : "Could not save the photos. Please try again.",
      );
      setPhase("pick");
    } else if (errored.length > 0) {
      // Partial failure — keep sheet open so the user can retry just the failures
      const thumbs = await Promise.all(errored.map((f) => fileToThumbnail(f)));
      setFailedThumbnails(thumbs);
      setErrorMsg(
        anyQuotaError
          ? `${succeeded.length} of ${files.length} photo${files.length !== 1 ? "s" : ""} saved. ` +
            `Device storage is full — free up space to add the rest.`
          : `${succeeded.length} of ${files.length} photo${files.length !== 1 ? "s" : ""} saved. ` +
            `${errored.length} couldn't be added.`,
      );
      setFailedFiles(errored);
      setPhase("pick");
    } else {
      setFailedFiles([]);
      setFailedThumbnails([]);
      handleClose();
    }
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
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
                    {errorMsg}
                  </p>

                  {/* Thumbnail strip for failed photos */}
                  {failedThumbnails.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollSnapType: "x mandatory" }}>
                      {failedThumbnails.map((thumb, idx) => {
                        const file = failedFiles[idx];
                        return (
                          <div
                            key={idx}
                            className="flex-shrink-0 flex flex-col items-center gap-1"
                            style={{ scrollSnapAlign: "start", width: 72 }}
                          >
                            <div className="relative w-16 h-16 rounded-xl border-2 border-amber-400 overflow-hidden bg-amber-50">
                              {thumb ? (
                                <img
                                  src={thumb}
                                  alt={file?.name ?? `Photo ${idx + 1}`}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-2xl">🖼️</div>
                              )}
                              {/* Remove button */}
                              <button
                                onClick={() => {
                                  const nextFiles  = failedFiles.filter((_, i) => i !== idx);
                                  const nextThumbs = failedThumbnails.filter((_, i) => i !== idx);
                                  setFailedFiles(nextFiles);
                                  setFailedThumbnails(nextThumbs);
                                  if (nextFiles.length === 0) setErrorMsg(null);
                                }}
                                aria-label="Remove photo from retry"
                                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black border-2 border-white flex items-center justify-center
                                           active:scale-90 transition-transform"
                              >
                                <X className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                              </button>
                            </div>
                            <p className="text-[10px] text-amber-700 text-center leading-tight max-w-[72px] truncate px-0.5">
                              {file?.name ?? `Photo ${idx + 1}`}
                            </p>
                            <p className="text-[10px] text-amber-500 text-center leading-tight">
                              Failed to save
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {failedFiles.length > 0 && (
                    <button
                      onClick={() => {
                        const filesToRetry = [...failedFiles];
                        setErrorMsg(null);
                        setFailedThumbnails([]);
                        setFailedFiles([]);
                        handleFiles(filesToRetry);
                      }}
                      className="w-full py-2.5 border-2 border-black rounded-xl bg-primary font-display font-bold text-sm uppercase tracking-tight
                                 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                                 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
                    >
                      Retry {failedFiles.length} failed photo{failedFiles.length !== 1 ? "s" : ""}
                    </button>
                  )}
                </div>
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
                  className="flex items-start gap-2 px-3 py-2.5 rounded-xl border-2"
                  style={{ background: "#FFF0F6", borderColor: "#E8B0B8" }}
                >
                  <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#D0909A" }} />
                  <div>
                    <p className="text-xs font-semibold leading-snug" style={{ color: "#9A5060" }}>
                      <span className="font-black">Clean Up Photo</span> — background removal &amp; auto-enhance run on‑device.
                    </p>
                    <p className="text-xs leading-snug mt-0.5" style={{ color: "#B07080" }}>
                      A before/after comparison appears when adding a single photo.
                    </p>
                  </div>
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
                <span className="text-5xl animate-pulse">✨</span>
              </div>
              <div className="text-center">
                <p className="font-display font-bold text-2xl uppercase tracking-tight">
                  {progress && progress.total > 1
                    ? `Cleaning ${progress.done + 1} of ${progress.total}…`
                    : "Cleaning up…"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Processing your photo on‑device
                </p>
              </div>
            </motion.div>
          )}

          {/* ── COMPARING ── */}
          {phase === "comparing" && originalDataUrl && (
            <motion.div
              key="comparing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <PhotoCompareSheet
                originalDataUrl={originalDataUrl}
                cleanedDataUrl={cleanedDataUrl || originalDataUrl}
                hadSubject={hadSubject}
                cleanupError={cleanupError}
                cancelLabel="Retake"
                onSelect={handleCompareSelect}
                onCancel={handleRetake}
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
