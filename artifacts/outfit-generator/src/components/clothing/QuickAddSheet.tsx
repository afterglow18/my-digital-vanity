/**
 * QuickAddSheet
 *
 * Upload flow:
 *   pick ──(file chosen)──► uploading ──► close
 *
 * Images are encoded to JPEG (≤2048 px) and saved to Capacitor Filesystem
 * (Documents dir) via imageStorage.ts — no server upload required.
 *
 * Camera:
 *   On native iOS/iPadOS, uses @capacitor/camera (Camera.getPhoto) which
 *   presents the picker correctly as a popover on iPad and handles permissions.
 *   Falls back to <input capture> only on web.
 */
import React, { useRef, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Check, RotateCcw } from "lucide-react";
import {
  removeBackground,
  blobToDataUrl,
  dataUrlToBlob,
} from "@/lib/backgroundRemoval";
import {
  useCreateClothingItem,
  getListClothingQueryKey,
} from "@/lib/local-api";
import { useQueryClient } from "@tanstack/react-query";
import { saveImage } from "@/lib/imageStorage";
import type { ClothingItem } from "@/lib/local-api";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import type { GalleryImageOptions } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";

// ── Types ──────────────────────────────────────────────────────────────────────

type Category = "makeup" | "skincare" | "hair" | "fragrances";

const CATEGORY_LABELS: Record<Category, string> = {
  makeup:     "Makeup",
  skincare:   "Skincare",
  hair:       "Haircare",
  fragrances: "Fragrance",
};

type Phase =
  | "pick"       // two-button landing screen
  | "encoding"   // photo picked; encoding + initial canvas resize in progress
  | "preview"    // encoded photo shown; optional background removal
  | "uploading"; // saving to Filesystem + DB

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Re-encode any image (HEIC, JPEG, PNG, …) to a JPEG capped at 2048 px on the
 * long edge. Keeps files small for reliable storage and fast display.
 */
async function encodeForUpload(input: File | Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(input);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      if (!img.naturalWidth || !img.naturalHeight) {
        reject(new Error(`Image decoded with 0 dimensions (type: ${input.type || "unknown"})`));
        return;
      }

      const MAX_DIM = 2048;
      const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth  * scale);
      const h = Math.round(img.naturalHeight * scale);

      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("canvas.getContext('2d') returned null")); return; }

      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (b) => {
          if (b && b.size > 1000) {
            resolve(b);
          } else {
            reject(new Error(`canvas.toBlob returned ${b?.size ?? 0} bytes — image may be blank`));
          }
        },
        "image/jpeg",
        0.85,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load image (type: ${input.type || "unknown"}, size: ${input.size} bytes)`));
    };

    img.src = url;
  });
}

/**
 * Returns true if the error represents a user cancellation of the camera picker.
 * Capacitor throws different messages across versions/platforms.
 */
function isCameraCancel(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("cancel") ||
    msg.includes("dismiss") ||
    msg.includes("no image picked") ||
    msg.includes("user denied") ||
    msg.includes("user did not") ||
    msg.includes("no photo")
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  open:          boolean;
  onOpenChange:  (open: boolean) => void;
  category:      Category;
  existingCount: number;
  /** Called with the newly created item after a successful save. */
  onCreated?:    (item: ClothingItem) => void;
}

const PHOTO_TIPS = [
  "Lay the item flat or hang it neatly.",
  "Use a plain, consistent background.",
  "Take the photo directly from the front or above, depending on the item.",
  "Make sure the entire item is visible.",
] as const;

export function QuickAddSheet({ open, onOpenChange, category, existingCount, onCreated }: Props) {
  const [phase,    setPhase]    = useState<Phase>("pick");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Preview phase state
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null);
  const [originalUrl,  setOriginalUrl]  = useState<string | null>(null);
  const [cleanedBlob,  setCleanedBlob]  = useState<Blob | null>(null);
  const [cleanedUrl,   setCleanedUrl]   = useState<string | null>(null);
  // JS/WASM background removal works on every platform — always true.
  const bgSupported = true;
  const [bgProcessing, setBgProcessing] = useState(false);
  const [bgFailed,     setBgFailed]     = useState(false);
  // Which version the user has selected — defaults to 'cleaned' once ready
  const [selected, setSelected] = useState<"original" | "cleaned">("original");

  // Generation counter — incremented each time handleFile is called.
  // Every async background-removal chain captures its own generation at start;
  // if the counter has advanced by the time an await resolves, a newer photo
  // has been taken and this result is stale — discard it rather than clobbering
  // the current photo's state.
  const bgGenRef = useRef(0);

  // Multi-photo queue — populated when the user selects several files at once.
  // fileQueueRef holds the blobs; queueIdxRef is the current position.
  // queueIdx/queueTotal are display-only state mirrors of those refs.
  const fileQueueRef  = useRef<Blob[]>([]);
  const queueIdxRef   = useRef(0);
  const [queueIdx,   setQueueIdx]   = useState(0);
  const [queueTotal, setQueueTotal] = useState(0);

  // Clean up object URLs when they change
  useEffect(() => { return () => { if (originalUrl) URL.revokeObjectURL(originalUrl); }; }, [originalUrl]);
  useEffect(() => { return () => { if (cleanedUrl)  URL.revokeObjectURL(cleanedUrl);  }; }, [cleanedUrl]);

  // Only used as a fallback on web (non-native) — native uses Camera.getPhoto
  const cameraInputRef  = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Reset all per-session state each time the sheet opens. Also cancels any
  // in-flight removal left over from a previous session (bgGenRef guard).
  useEffect(() => {
    if (!open) return;
    bgGenRef.current += 1;
    setBgProcessing(false);
    setRemovalProgress(null);
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
    batchQueueRef.current = [];
    setBatchTotal(0);
    setBatchDone(0);
  }, [open]);

  const createItem  = useCreateClothingItem();
  const queryClient = useQueryClient();

  // ── Reset ────────────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    // Advance generation so any in-flight background removal discards its result
    bgGenRef.current += 1;
    // Clear the queue so stale files don't process after close
    fileQueueRef.current = [];
    queueIdxRef.current  = 0;
    setQueueIdx(0);
    setQueueTotal(0);
    setPhase("pick");
    setErrorMsg(null);
    setOriginalBlob(null);
    setOriginalUrl(null);
    setCleanedBlob(null);
    setCleanedUrl(null);
    setBgProcessing(false);  // must reset — close can happen mid-removal
    setBgFailed(false);
    setSelected("original");
    onOpenChange(false);
  }, [onOpenChange]);

  // ── File picked → encode → show preview + auto background removal ────────
  const handleFile = useCallback(async (file: File | Blob) => {
    setErrorMsg(null);

    // Show the "encoding" loading screen immediately — before any async work —
    // so the user sees a full-screen spinner rather than a blank or frozen pick screen.
    const myGen = ++bgGenRef.current;
    setOriginalBlob(null);
    setOriginalUrl(null);
    setCleanedBlob(null);
    setCleanedUrl(null);
    setBgFailed(false);
    setBgProcessing(false);
    setSelected("original");
    setPhase("encoding");

    let jpeg: Blob;
    try {
      jpeg = await encodeForUpload(file);
      console.log(`[quickadd] encoded → JPEG ${jpeg.size}B`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[quickadd] encode failed:", msg);
      if (bgGenRef.current !== myGen) return;
      setErrorMsg(`Could not read the photo: ${msg}`);
      setPhase("pick");
      return;
    }
    if (bgGenRef.current !== myGen) return;

    if (bgGenRef.current !== myGen) return;

    // Encoding done — show the original and switch to the comparison screen
    const url = URL.createObjectURL(jpeg);
    setOriginalBlob(jpeg);
    setOriginalUrl(url);
    setPhase("preview");

    // Kick off background removal (JS/WASM — works on every platform).
    // Generation already captured above; stale results are discarded.
    try {
      const dataUrl  = await blobToDataUrl(jpeg);
      if (bgGenRef.current !== myGen) return; // newer photo taken — bail out

      const resultUrl = await removeBackground(dataUrl);
      if (bgGenRef.current !== myGen) return;

      const resultBlob   = await dataUrlToBlob(resultUrl);
      const resultObjUrl = URL.createObjectURL(resultBlob);
      if (bgGenRef.current !== myGen) { URL.revokeObjectURL(resultObjUrl); return; }

      setCleanedBlob(resultBlob);
      setCleanedUrl(resultObjUrl);
      setSelected("cleaned"); // default to the cleaned version
    } catch (err) {
      if (bgGenRef.current !== myGen) return; // stale — ignore
      console.warn("[quickadd] background removal failed silently:", err);
      setBgFailed(true);
    } finally {
      // Only clear the spinner for our own generation; a newer photo's
      // setBgProcessing(true) must not be cancelled by our finally block.
      if (bgGenRef.current === myGen) setBgProcessing(false);
    }
  }, []);

  // ── Save the chosen version → Filesystem + DB ────────────────────────────
  const handleSave = useCallback(async () => {
    const blob = selected === "cleaned" && cleanedBlob ? cleanedBlob : originalBlob;
    if (!blob) return;
    setErrorMsg(null);
    setPhase("uploading");

    try {
      const isCleaned = selected === "cleaned" && !!cleanedBlob;
      const ext        = isCleaned ? "png" : "jpg";
      const filename   = `${category}-${Date.now()}.${ext}`;
      const imageObjectPath = await saveImage(blob, filename);
      console.log(`[quickadd] saved ${isCleaned ? "cleaned PNG" : "original JPEG"} as ${imageObjectPath}`);

      const label    = CATEGORY_LABELS[category];
      const n        = existingCount + 1;
      const autoName = n === 1 ? label : `${label} ${n}`;

      await new Promise<void>((resolve, reject) => {
        createItem.mutate(
          { data: { name: autoName, category, imageObjectPath } },
          {
            onSuccess: (createdItem) => {
              queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
              if (onCreated) onCreated(createdItem);
              resolve();
            },
            onError: (err) => {
              console.error("[quickadd] createItem failed:", err);
              reject(err);
            },
          },
        );
      });

      // Advance to the next photo in the queue, or close if done.
      const nextIdx = queueIdxRef.current + 1;
      if (nextIdx < fileQueueRef.current.length) {
        queueIdxRef.current = nextIdx;
        setQueueIdx(nextIdx);
        await handleFile(fileQueueRef.current[nextIdx]);
      } else {
        handleClose();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[quickadd] save failed:", msg);
      setErrorMsg(`Save failed: ${msg}`);
      setPhase("preview");
    }
  }, [selected, cleanedBlob, originalBlob, category, existingCount, createItem, queryClient, handleClose, onCreated]);

  // ── Shared native photo helper ─────────────────────────────────────────────
  // Use CameraResultType.Uri (not DataUrl) — DataUrl encodes the full image as
  // base64 on-device before returning it, which can silently fail or OOM on iOS
  // for large images. Uri returns a file path; we fetch webPath as a blob instead.
  // Width/height are omitted — encodeForUpload() already caps at 2048 px.
  const openNativePhoto = useCallback(async (source: CameraSource) => {
    const PHOTO_OPTS = {
      resultType:         CameraResultType.Uri,
      quality:            90,
      correctOrientation: true,
      allowEditing:       false,
    };
    const photo = await Camera.getPhoto({ ...PHOTO_OPTS, source });
    console.log("[quickadd] photo result:", JSON.stringify({ path: photo.path, webPath: photo.webPath, format: photo.format }));
    const url = photo.webPath ?? photo.path;
    if (!url) throw new Error("No photo was returned.");
    const res  = await fetch(url);
    const blob = await res.blob();
    console.log(`[quickadd] fetched blob: ${blob.size}B type=${blob.type}`);
    await handleFile(blob);
  }, [handleFile]);

  // ── Permission denied check (run AFTER a failure, not before) ───────────
  const isPermissionDenied = async (permission: "camera" | "photos"): Promise<boolean> => {
    try {
      const perms = await Camera.checkPermissions();
      return perms[permission] === "denied";
    } catch {
      return false;
    }
  };

  // ── Take Photo (native: Capacitor Camera; web: <input capture>) ──────────
  // Let Camera.getPhoto handle the iOS permission prompt internally — calling
  // requestPermissions() ourselves first causes a view-controller conflict where
  // the permission dialog hasn't fully dismissed before the camera tries to present.
  const handleTakePhoto = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      cameraInputRef.current?.click();
      return;
    }
    try {
      await openNativePhoto(CameraSource.Camera);
    } catch (err: unknown) {
      if (isCameraCancel(err)) return;
      const rawMsg = err instanceof Error ? err.message : String(err);
      const msg = rawMsg.toLowerCase();
      console.warn("[quickadd] Camera failed:", rawMsg);

      // Check if it's a hard permission denial
      if (msg.includes("denied") || msg.includes("permission") || msg.includes("restricted") || await isPermissionDenied("camera")) {
        setErrorMsg("Camera access is off. Go to Settings → My Digital Closet → Camera and enable it, then try again.");
        return;
      }

      // Camera unavailable for another reason — fall back to photo library
      try {
        await openNativePhoto(CameraSource.Photos);
      } catch (fallbackErr: unknown) {
        if (isCameraCancel(fallbackErr)) return;
        const fbRaw = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        const fbMsg = fbRaw.toLowerCase();
        console.error("[quickadd] Photo library fallback also failed:", fbRaw);
        if (fbMsg.includes("denied") || fbMsg.includes("permission") || await isPermissionDenied("photos")) {
          setErrorMsg("Photo library access is off. Go to Settings → My Digital Closet → Photos and allow access, then try again.");
        } else {
          setErrorMsg("Could not open the camera or photo library. Please try again.");
        }
      }
    }
  }, [openNativePhoto]);

  // ── Upload Photo (native: Capacitor pickImages multi-select; web: <input>) ──
  const handleUploadPhoto = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      galleryInputRef.current?.click();
      return;
    }
    try {
      // pickImages allows the user to select multiple photos at once on iOS.
      const opts: GalleryImageOptions = { quality: 90, correctOrientation: true };
      const { photos } = await Camera.pickImages(opts);
      if (!photos || photos.length === 0) return;

      // Fetch each GalleryPhoto as a Blob and load into the queue
      const blobs: Blob[] = [];
      for (const photo of photos) {
        const url = photo.webPath ?? photo.path;
        if (!url) continue;
        const res  = await fetch(url);
        const blob = await res.blob();
        blobs.push(blob);
      }
      if (blobs.length === 0) return;

      fileQueueRef.current = blobs;
      queueIdxRef.current  = 0;
      setQueueIdx(0);
      setQueueTotal(blobs.length);
      await handleFile(blobs[0]);
    } catch (err: unknown) {
      if (isCameraCancel(err)) return;
      const rawMsg = err instanceof Error ? err.message : String(err);
      const msg = rawMsg.toLowerCase();
      console.error("[quickadd] Photo library open failed:", rawMsg);
      if (msg.includes("denied") || msg.includes("permission") || msg.includes("restricted") || await isPermissionDenied("photos")) {
        setErrorMsg("Photo library access is off. Go to Settings → My Digital Closet → Photos and allow access, then try again.");
      } else {
        setErrorMsg("Could not open your photo library. Please try again.");
      }
    }
  }, [openNativePhoto, handleFile]);

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting same file
    if (files.length === 0) return;
    // Store the whole batch and kick off the first photo.
    // handleSave will advance through the rest automatically.
    fileQueueRef.current = files;
    queueIdxRef.current  = 0;
    setQueueIdx(0);
    setQueueTotal(files.length);
    await handleFile(files[0]);
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
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 pb-3 bg-white border-b-2 border-black flex-shrink-0"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
      >
        <h2 className="font-display font-bold text-xl uppercase tracking-tight">
          Add {label}
        </h2>
        {(phase === "pick" || phase === "encoding" || phase === "preview") && (
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

      {/* Body */}
      <div className="flex-1 flex flex-col overflow-y-auto">
          {/* ── PICK ── */}
          {phase === "pick" && (
            <div className="flex flex-col p-5 gap-5">
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
                          return (
                            <div
                              key={idx}
                              className="thumb-item flex-shrink-0 flex flex-col items-center gap-1 transition-opacity"
                              style={{
                                scrollSnapAlign: "start",
                                width: 72,
                                opacity: isDragging ? 0.4 : 1,
                                cursor: dragIndex !== null ? "grabbing" : "grab",
                              }}
                              onPointerDown={handleThumbPointerDown(idx)}
                            >
                              {/* Border highlight is toggled via the .is-drag-target CSS class
                                  applied directly to the parent DOM node to avoid re-renders. */}
                              <div
                                className="thumb-border relative w-16 h-16 rounded-xl border-2 overflow-hidden bg-amber-50 transition-all border-amber-400"
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
                        const thumbMap = buildRetryThumbMap(failedFiles, failedThumbnails);
                        setErrorMsg(null);
                        setFailedThumbnails([]);
                        setFailedFiles([]);
                        handleFiles(filesToRetry, thumbMap, true);
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
                {/* Take Photo — uses Capacitor Camera on native (iPad-safe) */}
                <button
                  onClick={handleTakePhoto}
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
                  onClick={handleUploadPhoto}
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

          {/* ── ENCODING ── */}
          {phase === "encoding" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
              <div className="w-28 h-28 border-4 border-black rounded-3xl bg-white
                              flex items-center justify-center
                              shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                <Loader2 className="w-12 h-12 animate-spin" strokeWidth={1.5} />
              </div>
              <div className="text-center">
                <p className="font-display font-bold text-2xl uppercase tracking-tight">Processing…</p>
                <p className="text-sm text-muted-foreground mt-1">Getting your photo ready.</p>
              </div>
            </div>
          )}

          {/* ── PREVIEW ── */}
          {phase === "preview" && (
            <div className="flex flex-col gap-4 p-5">
              {errorMsg && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
                  {errorMsg}
                </p>
              )}

              {/* ── Side-by-side comparison (always shown) ── */}
              <div className="flex items-center justify-center gap-2">
                <p className="text-xs font-bold uppercase tracking-widest text-black/40 text-center">
                  {bgProcessing ? "This will take a moment…" : bgFailed ? "Original" : "Tap to choose"}
                </p>
                {queueTotal > 1 && (
                  <span className="text-xs font-bold uppercase tracking-widest text-black/30">
                    · {queueIdx + 1} of {queueTotal}
                  </span>
                )}
              </div>

              <div className="flex gap-3">
                {/* Original card */}
                <button
                  onClick={() => setSelected("original")}
                  className={`flex-1 flex flex-col gap-2 rounded-2xl border-4 overflow-hidden
                              transition-all active:scale-[0.97]
                              ${selected === "original"
                                ? "border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                                : "border-black/20 opacity-60"}`}
                >
                  <div className="relative bg-black">
                    <img src={originalUrl!} alt="Original" className="w-full object-contain max-h-44" />
                    {selected === "original" && (
                      <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black
                                      flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
                      </div>
                    )}
                  </div>
                  <span className="font-bold text-xs uppercase tracking-wide text-center pb-2">
                    Original
                  </span>
                </button>

                {/* Cleaned card */}
                <button
                  onClick={() => { if (cleanedUrl) setSelected("cleaned"); }}
                  disabled={!cleanedUrl}
                  className={`flex-1 flex flex-col gap-2 rounded-2xl border-4 overflow-hidden
                              transition-all active:scale-[0.97] disabled:cursor-default
                              ${selected === "cleaned" && cleanedUrl
                                ? "border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                                : "border-black/20 opacity-60"}`}
                >
                  <div className="relative"
                       style={{ background: "repeating-conic-gradient(#d1d5db 0% 25%, white 0% 50%) 0 0 / 12px 12px" }}>
                    {cleanedUrl ? (
                      /* Done — show the result */
                      <>
                        <img src={cleanedUrl} alt="Cleaned" className="w-full object-contain max-h-44" />
                        {selected === "cleaned" && (
                          <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black
                                          flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" strokeWidth={3} />
                          </div>
                        )}
                      </>
                    ) : bgFailed ? (
                      /* Removal failed */
                      <div className="w-full flex flex-col items-center justify-center gap-2 px-3 text-center"
                           style={{ minHeight: "11rem" }}>
                        <span className="text-sm font-bold uppercase tracking-wide text-black/40">
                          Could not remove background
                        </span>
                      </div>
                    ) : (
                      /* Processing — shown while encoding or running the model */
                      <div className="w-full flex flex-col items-center justify-center gap-2 text-black/50"
                           style={{ minHeight: "11rem" }}>
                        <Loader2 className="w-8 h-8 animate-spin" />
                        <span className="text-sm font-bold uppercase tracking-wide">Processing</span>
                      </div>
                    )}
                  </div>
                  <span className="font-bold text-xs uppercase tracking-wide text-center pb-2">
                    Cleaned ✨
                  </span>
                </button>
              </div>

              {/* Save / Retake or Skip */}
              <div className="flex gap-3">
                <button
                  onClick={queueTotal > 1
                    ? async () => {
                        // Skip this photo — advance to next in queue without saving
                        const nextIdx = queueIdxRef.current + 1;
                        if (nextIdx < fileQueueRef.current.length) {
                          queueIdxRef.current = nextIdx;
                          setQueueIdx(nextIdx);
                          await handleFile(fileQueueRef.current[nextIdx]);
                        } else {
                          handleClose();
                        }
                      }
                    : () => setPhase("pick")}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl
                             border-2 border-black bg-white font-bold text-sm uppercase tracking-wide
                             shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                             active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
                >
                  <RotateCcw className="w-4 h-4" />
                  {queueTotal > 1 ? "Skip" : "Retake"}
                </button>
                <button
                  onClick={handleSave}
                  disabled={bgProcessing && selected === "cleaned"}
                  className="flex-[2] flex items-center justify-center gap-1.5 py-3 rounded-xl
                             border-2 border-black bg-primary font-bold text-sm uppercase tracking-wide
                             shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                             active:translate-x-0.5 active:translate-y-0.5 active:shadow-none
                             disabled:opacity-50 transition-all"
                >
                  <Check className="w-4 h-4" />
                  {bgProcessing && selected === "cleaned" ? "Processing…" : "Save to Closet"}
                </button>
              </div>
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
                    ? `Saving ${progress.done + 1} of ${progress.total}…`
                    : "Adding to your wardrobe."}
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
      {/* Camera fallback — only used on web; native uses Camera.getPhoto above */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
      />
      {/* Gallery — opens photo library / file picker (multiple allowed) */}
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
