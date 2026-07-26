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
import React, { useRef, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Check, Sparkles, GripHorizontal } from "lucide-react";
import { useCreateClothingItem, getListClothingQueryKey } from "@/hooks/useLocalWardrobe";
import type { ClothingItem } from "@/types/local";
import { useQueryClient } from "@tanstack/react-query";
import { encodeToPng } from "@/lib/processImage";
import { removeBackground } from "@/lib/backgroundRemoval";
import { PhotoCompareSheet } from "@/components/clothing/PhotoCompareSheet";
import { buildRetryStripState } from "@/lib/retryStripHelpers";

// ── Types ──────────────────────────────────────────────────────────────────────

type Category = "makeup" | "skincare" | "hair" | "fragrances";

const CATEGORY_LABELS: Record<Category, string> = {
  makeup:     "Makeup",
  skincare:   "Skincare",
  hair:       "Haircare",
  fragrances: "Fragrance",
};

type Phase = "pick" | "encoding" | "preview" | "uploading";

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
  const [dragIndex,          setDragIndex]          = useState<number | null>(null);
  const [dragOverIndex,      setDragOverIndex]      = useState<number | null>(null);
  const thumbRowRef    = useRef<HTMLDivElement>(null);
  const autoScrollRef  = useRef<number | null>(null);

  // Comparison state
  const [originalDataUrl, setOriginalDataUrl] = useState<string>("");
  const [cleanedDataUrl,  setCleanedDataUrl]  = useState<string>("");
  const [hadSubject,      setHadSubject]      = useState(false);
  const [cleanupError,    setCleanupError]    = useState<string | null>(null);
  const pendingMeta = useRef<{ countOffset: number } | null>(null);
  // Generation counter — each new photo bumps this; every async step checks it
  // before writing state so a slow first removal never clobbers a fast second one.
  const bgGenRef = useRef(0);
  const [bgProcessing, setBgProcessing] = useState(false);

  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);

  const cameraInputRef  = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Reset all per-session state each time the sheet opens. Also cancels any
  // in-flight removal left over from a previous session (bgGenRef guard).
  useEffect(() => {
    if (!open) return;
    bgGenRef.current += 1;
    setBgProcessing(false);
    setPhase("pick");
    setErrorMsg(null);
    setProgress(null);
    setFailedFiles([]);
    setFailedThumbnails([]);
    setOriginalDataUrl("");
    setCleanedDataUrl("");
    setHadSubject(false);
    setCleanupError(null);
    setShowAbandonConfirm(false);
    pendingMeta.current = null;
  }, [open]);

  const createItem  = useCreateClothingItem();
  const queryClient = useQueryClient();

  // ── Drag-to-reorder handlers for failed thumbnail strip ───────────────────

  const handleThumbPointerDown = useCallback((idx: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragIndex(idx);
    setDragOverIndex(idx);
  }, []);

  const handleThumbRowPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragIndex === null || !thumbRowRef.current) return;
    const container = thumbRowRef.current;
    const containerRect = container.getBoundingClientRect();

    // ── Auto-scroll when pointer is near the left or right edge ──────────────
    const SCROLL_ZONE  = 56; // px from edge that triggers scrolling
    const SCROLL_SPEED = 10; // px per animation frame

    if (autoScrollRef.current !== null) {
      cancelAnimationFrame(autoScrollRef.current);
      autoScrollRef.current = null;
    }

    let delta = 0;
    if (e.clientX < containerRect.left + SCROLL_ZONE) {
      delta = -SCROLL_SPEED;
    } else if (e.clientX > containerRect.right - SCROLL_ZONE) {
      delta = SCROLL_SPEED;
    }

    if (delta !== 0) {
      const tick = () => {
        if (!thumbRowRef.current) return;
        thumbRowRef.current.scrollLeft += delta;
        autoScrollRef.current = requestAnimationFrame(tick);
      };
      autoScrollRef.current = requestAnimationFrame(tick);
    }

    // ── Hit-test: getBoundingClientRect() is in viewport coords, matching clientX ──
    const children = Array.from(container.children) as HTMLElement[];
    for (let i = 0; i < children.length; i++) {
      const rect = children[i].getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right) {
        setDragOverIndex(i);
        break;
      }
    }
  }, [dragIndex]);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRef.current !== null) {
      cancelAnimationFrame(autoScrollRef.current);
      autoScrollRef.current = null;
    }
  }, []);

  /** Cancel an in-progress drag without reordering (Escape or pointer cancel). */
  const cancelDrag = useCallback(() => {
    stopAutoScroll();
    setDragIndex(null);
    setDragOverIndex(null);
  }, [stopAutoScroll]);

  // Cancel the drag when the user presses Escape.
  useEffect(() => {
    if (dragIndex === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelDrag();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dragIndex, cancelDrag]);

  const handleThumbRowPointerUp = useCallback(() => {
    stopAutoScroll();
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      setFailedFiles(prev => {
        const next = [...prev];
        const [moved] = next.splice(dragIndex, 1);
        next.splice(dragOverIndex, 0, moved);
        return next;
      });
      setFailedThumbnails(prev => {
        const next = [...prev];
        const [moved] = next.splice(dragIndex, 1);
        next.splice(dragOverIndex, 0, moved);
        return next;
      });
    }
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, dragOverIndex, stopAutoScroll]);

  const confirmClose = useCallback(() => {
    bgGenRef.current += 1;   // cancel any in-flight removal
    setBgProcessing(false);  // MUST reset — close can happen mid-removal
    setShowAbandonConfirm(false);
    setPhase("pick");
    setErrorMsg(null);
    setProgress(null);
    setFailedFiles([]);
    setFailedThumbnails([]);
    setOriginalDataUrl("");
    setCleanedDataUrl("");
    setHadSubject(false);
    setCleanupError(null);
    pendingMeta.current = null;
    onOpenChange(false);
  }, [onOpenChange]);

  const handleClose = useCallback(() => {
    if (failedFiles.length > 0) {
      setShowAbandonConfirm(true);
      return;
    }
    confirmClose();
  }, [failedFiles.length, confirmClose]);

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
   * Single-file handler: switches to "encoding" immediately so the user sees a
   * spinner right away, then shows the preview screen as soon as the original is
   * ready. Background removal runs in the background while the user can already
   * see and interact with the preview.
   *
   * Generation counter (bgGenRef) ensures that if the user picks a second photo
   * before the first removal finishes, the stale result is silently discarded.
   */
  const handleFile = useCallback(async (file: File): Promise<void> => {
    setErrorMsg(null);
    const myGen = ++bgGenRef.current;
    setOriginalDataUrl("");
    setCleanedDataUrl("");
    setHadSubject(false);
    setCleanupError(null);
    setBgProcessing(false);
    // Switch to "encoding" BEFORE any await — gives instant feedback.
    setPhase("encoding");

    let png: Blob;
    try {
      png = await encodeToPng(file);
    } catch (err) {
      if (bgGenRef.current !== myGen) return;
      console.error("[QuickAdd] PNG encoding failed:", err);
      setErrorMsg("Could not read that photo. Please try again.");
      setPhase("pick");
      return;
    }
    if (bgGenRef.current !== myGen) return;

    const origDataUrl = await blobToDataUrl(png);
    if (bgGenRef.current !== myGen) return;

    // Pre-decode the image into the browser bitmap cache while the encoding
    // spinner is still showing. WebKit decoding a cold base64 PNG takes 1-2 s
    // on device and leaves the compare sheet white if we switch phase first.
    // By waiting for onload here, the <img> paints instantly when phase="preview".
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload  = () => resolve();
      img.onerror = () => resolve(); // never block on a decode error
      img.src = origDataUrl;
    });
    if (bgGenRef.current !== myGen) return;

    // Show original immediately — preview screen appears without waiting for removal.
    pendingMeta.current = { countOffset: 0 };
    setOriginalDataUrl(origDataUrl);
    setPhase("preview");

    // Background removal runs while the user already sees the original.
    setBgProcessing(true);
    try {
      const cleanedUrl = await removeBackground(origDataUrl);
      if (bgGenRef.current !== myGen) return;
      setCleanedDataUrl(cleanedUrl);
      setHadSubject(true);
    } catch (err) {
      if (bgGenRef.current !== myGen) return;
      console.warn("[BackgroundRemoval] Failed:", err);
      setCleanupError("Clean Up couldn't run on this photo.");
    } finally {
      if (bgGenRef.current === myGen) setBgProcessing(false);
    }
  }, []);

  /**
   * Direct-save handler for multi-file uploads and retries.
   * Encodes and saves immediately — no comparison step.
   */
  const handleFileDirect = useCallback(async (file: File, countOffset: number): Promise<true | false | "quota"> => {
    let png: Blob;
    try {
      png = await encodeToPng(file);
    } catch {
      return false;
    }
    try {
      const dataUrl = await blobToDataUrl(png);
      return saveDataUrl(dataUrl, countOffset);
    } catch {
      return false;
    }
  }, [saveDataUrl]);

  const handleCompareSelect = useCallback(async (chosenDataUrl: string) => {
    const meta = pendingMeta.current;
    if (!meta) return;
    bgGenRef.current += 1;  // cancel any still-running removal
    setBgProcessing(false);
    setPhase("uploading");
    setProgress({ done: 0, total: 1 });
    const result = await saveDataUrl(chosenDataUrl, meta.countOffset);
    setProgress({ done: 1, total: 1 });
    if (result === true) {
      handleClose();
    } else {
      setPhase("preview");
      setProgress(null);
      setErrorMsg(
        result === "quota"
          ? "Your device storage is full — free up space and try again."
          : "Could not save the photo. Please try again.",
      );
    }
  }, [saveDataUrl, handleClose]);

  const handleRetake = useCallback(() => {
    bgGenRef.current += 1;  // cancel in-flight removal
    setBgProcessing(false);
    setOriginalDataUrl("");
    setCleanedDataUrl("");
    setHadSubject(false);
    setCleanupError(null);
    pendingMeta.current = null;
    setPhase("pick");
  }, []);

  const handleFiles = useCallback(async (
    files: File[],
    existingThumbnailMap?: Map<File, string>,
  ) => {
    if (files.length === 0) return;
    setErrorMsg(null);

    // Single file — show preview immediately, removal runs in background.
    if (files.length === 1) {
      await handleFile(files[0]);
      return;
    }

    // Multiple files — encode and save directly, no comparison step.
    setPhase("uploading");
    setProgress({ done: 0, total: files.length });
    const succeeded: File[] = [];
    const errored:   File[] = [];
    let anyQuotaError = false;
    for (let i = 0; i < files.length; i++) {
      setProgress({ done: i, total: files.length });
      const ok = await handleFileDirect(files[i], i);
      if (ok === true) {
        succeeded.push(files[i]);
      } else {
        if (ok === "quota") anyQuotaError = true;
        errored.push(files[i]);
      }
    }
    setProgress(null);
    const stripState = buildRetryStripState({
      succeededCount: succeeded.length,
      failedCount:    errored.length,
      totalAttempted: files.length,
      anyQuotaError,
    });
    if (stripState.clearFailed) {
      setFailedFiles([]);
      setFailedThumbnails([]);
      handleClose();
    } else {
      // Reuse pre-existing thumbnails where available (preserves any
      // custom order the user set before hitting Retry), only regenerate
      // for files that don't have a cached thumbnail yet.
      const thumbs = await Promise.all(
        errored.map((f) => existingThumbnailMap?.get(f) ?? fileToThumbnail(f)),
      );
      setFailedThumbnails(thumbs);
      setFailedFiles(errored);
      setErrorMsg(stripState.errorMsg);
      setPhase("pick");
    }
  }, [handleFile, handleFileDirect, handleClose]);

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
      {/* Header — hidden during preview (PhotoCompareSheet has its own) */}
      {phase !== "preview" && (
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

      {/* Body — plain conditionals, no AnimatePresence. Any AnimatePresence wrapper
           around phase conditionals creates an exit-animation window where no child
           is mounted, producing a blank screen between every phase change regardless
           of mode, initial, or transition duration. The outer motion.div slide-in is fine. */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">

          {/* ── PICK ── */}
          {phase === "pick" && (
            <div className="flex flex-col p-5 gap-5 overflow-y-auto">
              {errorMsg && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
                    {errorMsg}
                  </p>

                  {/* Thumbnail strip for failed photos — drag to reorder */}
                  {failedThumbnails.length > 0 && (
                    <>
                      {failedThumbnails.length > 1 && (
                        <p className="text-[10px] text-amber-600 text-center leading-tight -mb-1">
                          Drag thumbnails to reorder before retrying
                        </p>
                      )}
                      <div
                        ref={thumbRowRef}
                        className="flex gap-2 overflow-x-auto pb-1 touch-pan-x select-none"
                        style={{ scrollSnapType: "x mandatory" }}
                        onPointerMove={handleThumbRowPointerMove}
                        onPointerUp={handleThumbRowPointerUp}
                        onPointerCancel={cancelDrag}
                      >
                        {failedThumbnails.map((thumb, idx) => {
                          const file       = failedFiles[idx];
                          const isDragging = dragIndex === idx;
                          const isTarget   = dragOverIndex === idx && dragIndex !== null && dragIndex !== idx;
                          return (
                            <div
                              key={idx}
                              className="flex-shrink-0 flex flex-col items-center gap-1 transition-opacity"
                              style={{
                                scrollSnapAlign: "start",
                                width: 72,
                                opacity: isDragging ? 0.4 : 1,
                                cursor: dragIndex !== null ? "grabbing" : "grab",
                              }}
                              onPointerDown={handleThumbPointerDown(idx)}
                            >
                              <div
                                className={[
                                  "relative w-16 h-16 rounded-xl border-2 overflow-hidden bg-amber-50 transition-all",
                                  isTarget
                                    ? "border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.4)]"
                                    : "border-amber-400",
                                ].join(" ")}
                              >
                                {thumb ? (
                                  <img
                                    src={thumb}
                                    alt={file?.name ?? `Photo ${idx + 1}`}
                                    className="w-full h-full object-cover pointer-events-none"
                                    draggable={false}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-2xl">🖼️</div>
                                )}
                                {/* Remove button */}
                                <button
                                  onPointerDown={e => e.stopPropagation()}
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
                                {/* Position badge */}
                                {failedThumbnails.length > 1 && (
                                  <div className="absolute bottom-0.5 left-0.5 w-4 h-4 rounded-full bg-black/60 flex items-center justify-center">
                                    <span className="text-white font-bold leading-none" style={{ fontSize: 8 }}>
                                      {idx + 1}
                                    </span>
                                  </div>
                                )}
                              </div>
                              {/* Drag handle */}
                              {failedThumbnails.length > 1 && (
                                <GripHorizontal className="w-3.5 h-3.5 text-amber-400 -mt-0.5 pointer-events-none" />
                              )}
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
                    </>
                  )}

                  {failedFiles.length > 0 && (
                    <button
                      onClick={() => {
                        const filesToRetry = [...failedFiles];
                        // Build a File → thumbnail map so handleFiles can
                        // reuse existing thumbnails for any files that fail
                        // again, preserving the user's custom ordering.
                        const thumbMap = new Map<File, string>(
                          failedFiles.map((f, i) => [f, failedThumbnails[i]]),
                        );
                        setErrorMsg(null);
                        setFailedThumbnails([]);
                        setFailedFiles([]);
                        handleFiles(filesToRetry, thumbMap);
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

              {/* Clean Up badge — shown on all platforms (JS/WASM, no native plugin) */}
              <div
                className="flex items-start gap-2 px-3 py-2.5 rounded-xl border-2"
                style={{ background: "#FFF0F6", borderColor: "#E8B0B8" }}
              >
                <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#D0909A" }} />
                <div>
                  <p className="text-xs font-semibold leading-snug" style={{ color: "#9A5060" }}>
                    <span className="font-black">Clean Up Photo</span> — background removal runs on‑device.
                  </p>
                  <p className="text-xs leading-snug mt-0.5" style={{ color: "#B07080" }}>
                    A before/after comparison appears when adding a single photo.
                  </p>
                </div>
              </div>

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
            </div>
          )}

          {/* ── ENCODING — full-screen spinner shown immediately after photo is picked ── */}
          {phase === "encoding" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
              <div
                className="w-28 h-28 rounded-3xl border-4 border-black flex items-center justify-center"
                style={{ background: "#FFF0F6", boxShadow: "6px 6px 0 #000" }}
              >
                <Loader2 className="w-12 h-12 animate-spin" />
              </div>
              <div className="text-center">
                <p className="font-display font-bold text-2xl uppercase tracking-tight">
                  Processing…
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Getting your photo ready
                </p>
              </div>
            </div>
          )}

          {/* ── PREVIEW — original visible immediately; cleaned slot fills in when ready ── */}
          {phase === "preview" && (
            <div className="flex-1 flex flex-col min-h-0">
              <PhotoCompareSheet
                originalDataUrl={originalDataUrl}
                cleanedDataUrl={cleanedDataUrl}
                hadSubject={hadSubject}
                cleanupError={cleanupError}
                bgProcessing={bgProcessing}
                cancelLabel="Retake"
                onSelect={handleCompareSelect}
                onCancel={handleRetake}
              />
            </div>
          )}

          {/* ── UPLOADING ── */}
          {phase === "uploading" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
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
            </div>
          )}

      </div>

      {/* Abandon-confirmation overlay */}
      <AnimatePresence>
        {showAbandonConfirm && (
          <motion.div
            key="abandon-confirm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex items-end justify-center"
            style={{ background: "rgba(0,0,0,0.45)" }}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="w-full max-w-md bg-white border-t-4 border-black rounded-t-3xl p-6 flex flex-col gap-4"
              style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}
            >
              <div className="text-center">
                <p className="font-display font-bold text-lg uppercase tracking-tight leading-snug">
                  Leave without retrying?
                </p>
                <p className="text-sm text-black/60 mt-1">
                  {failedFiles.length === 1
                    ? "1 photo wasn't saved and will be discarded."
                    : `${failedFiles.length} photos weren't saved and will be discarded.`}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowAbandonConfirm(false)}
                  className="flex-1 py-3 border-2 border-black rounded-xl bg-white font-display font-bold text-sm uppercase tracking-tight
                             shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                             active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
                >
                  Keep retrying
                </button>
                <button
                  onClick={confirmClose}
                  className="flex-1 py-3 border-2 border-black rounded-xl bg-black text-white font-display font-bold text-sm uppercase tracking-tight
                             shadow-[3px_3px_0px_0px_rgba(0,0,0,0.4)]
                             active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
                >
                  Discard & close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
