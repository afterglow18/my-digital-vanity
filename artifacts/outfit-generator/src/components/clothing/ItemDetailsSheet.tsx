/**
 * ItemDetailsSheet — full-screen overlay showing a clothing item's details.
 * Every field is optional and editable. A "Save" button appears only when
 * the form is dirty. Delete is always available.
 */
import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Heart, Trash2, Save, ChevronDown, Sparkles, Loader2, CheckCircle2,
  Shirt, Check, BookmarkPlus,
} from "lucide-react";
import { AddToLookbookSheet } from './AddToLookbookSheet';
import {
  removeBackground,
  blobToDataUrl,
  dataUrlToBlob,
} from "@/lib/backgroundRemoval";
import { saveImage, deleteImage } from "@/lib/imageStorage";
import {
  ClothingItem,
  ClothingItemUpdateCategory,
  useUpdateClothingItem,
  useDeleteClothingItem,
  getListClothingQueryKey,
  getListOutfitsQueryKey,
} from "@/lib/local-api";
import { useQueryClient } from "@tanstack/react-query";
import { getImageUrl } from "@/lib/utils";
import { removeBackground } from "@/lib/backgroundRemoval";
import type { RemovalProgress } from "@/lib/backgroundRemoval";
import { PhotoCompareSheet } from "./PhotoCompareSheet";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEASON_OPTIONS   = ["", "Spring", "Summer", "Fall", "Winter", "All Season"];
const OCCASION_OPTIONS = ["", "Casual", "Work", "Formal", "Sport", "Special Event"];
const CATEGORY_OPTIONS = ["makeup", "skincare", "hair", "fragrances"];

function formatLastUsed(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${m}/${d}/${String(y).slice(2)}`;
}

function Field({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        className="w-full border-2 border-black rounded-lg px-3 py-2 text-sm font-medium
                   bg-white focus:outline-none focus:ring-2 focus:ring-primary
                   placeholder:font-normal placeholder:text-black/25"
      />
    </div>
  );
}

function SelectField({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none border-2 border-black rounded-lg px-3 py-2 pr-8
                     text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
        >
          {options.map((o) => (
            <option key={o} value={o}>{o || `— ${label} —`}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-black/40" />
      </div>
    </div>
  );
}

// ── BgCompareOverlay ──────────────────────────────────────────────────────────

interface BgCompareOverlayProps {
  originalDataUrl: string;
  cleanedDataUrl:  string;
  onSave:   (choice: "original" | "cleaned") => void;
  onCancel: () => void;
}

function BgCompareOverlay({
  originalDataUrl,
  cleanedDataUrl,
  onSave,
  onCancel,
}: BgCompareOverlayProps) {
  const [selected, setSelected] = useState<"original" | "cleaned">("cleaned");

  const CHECKER = {
    backgroundImage: "repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%)",
    backgroundSize: "16px 16px",
  } as React.CSSProperties;

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[75] flex flex-col max-w-md mx-auto bg-[#f9f4ee]"
    >
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 py-3
                   bg-white border-b-2 border-black"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
      >
        <div>
          <h2 className="font-display font-bold text-xl uppercase tracking-tight">
            Choose a Version
          </h2>
          <p className="text-xs text-black/40 font-medium">Tap a photo to select it</p>
        </div>
        <button
          onClick={onCancel}
          className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                     bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                     active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Side-by-side panels */}
      <div className="flex-1 flex gap-3 p-4 min-h-0">
        {(["original", "cleaned"] as const).map((side) => {
          const isSelected = selected === side;
          const url        = side === "original" ? originalDataUrl : cleanedDataUrl;
          return (
            <button
              key={side}
              onClick={() => setSelected(side)}
              className={`relative flex-1 flex flex-col rounded-2xl overflow-hidden border-2
                          transition-all duration-150 focus:outline-none
                          ${isSelected
                            ? "border-[#f472b6] shadow-[0_0_0_3px_#f472b6]"
                            : "border-black/20"}`}
            >
              {/* Image */}
              <div className="flex-1 min-h-0 w-full" style={CHECKER}>
                <img
                  src={url}
                  alt={side}
                  className="w-full h-full object-contain"
                  draggable={false}
                />
              </div>

              {/* Label bar */}
              <div
                className={`flex-shrink-0 py-2 text-center text-xs font-bold uppercase tracking-wide
                             ${isSelected
                               ? "bg-[#f472b6] text-white"
                               : "bg-white text-black/60 border-t border-black/10"}`}
              >
                {side === "original" ? "Original" : "Cleaned ✨"}
              </div>

              {/* Selection checkmark */}
              {isSelected && (
                <div className="absolute top-2 right-2 bg-[#f472b6] rounded-full p-0.5 shadow">
                  <CheckCircle2 className="w-5 h-5 text-white" fill="white" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div
        className="flex-shrink-0 px-4 py-4 bg-white border-t-2 border-black flex flex-col gap-2"
        style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={() => onSave(selected)}
          className="w-full btn-brutalist py-3 rounded-xl flex items-center justify-center gap-2 text-sm"
        >
          <Sparkles className="w-4 h-4" />
          {selected === "cleaned" ? "Save Cleaned Version" : "Save Original"}
        </button>
        <button
          onClick={onCancel}
          className="w-full py-3 rounded-xl text-sm font-bold uppercase border-2 border-black/20
                     text-black/40 hover:text-black hover:border-black/40 transition-all"
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ItemDetailsSheetProps {
  item: ClothingItem | null;
  onClose: () => void;
  onDeleted?: () => void;
  /** When true (search results, favorites): show "Add to Lookbook" instead of "Clean Up Photo".
   *  "Wearing Today" always shows regardless. */
  showAddToLookbook?: boolean;
}

interface FormState {
  name: string;
  brand: string;
  color: string;
  size: string;
  season: string;
  occasion: string;
  purchasePrice: string;
  purchaseDate: string;
  notes: string;
  isFavorite: boolean;
  category: string;
  timesWorn: string;
}

function toForm(item: ClothingItem): FormState {
  return {
    name:          item.name          ?? "",
    brand:         item.brand         ?? "",
    color:         item.color         ?? "",
    size:          item.size          ?? "",
    season:        item.season        ?? "",
    occasion:      item.occasion      ?? "",
    purchasePrice: item.purchasePrice ?? "",
    purchaseDate:  item.purchaseDate  ?? "",
    notes:         item.notes         ?? "",
    isFavorite:    item.isFavorite    ?? false,
    category:      item.category      ?? "",
    timesWorn:     String(item.timesWorn ?? 0),
  };
}

function isDirty(form: FormState, item: ClothingItem): boolean {
  return (
    form.name          !== (item.name          ?? "") ||
    form.brand         !== (item.brand         ?? "") ||
    form.color         !== (item.color         ?? "") ||
    form.size          !== (item.size          ?? "") ||
    form.season        !== (item.season        ?? "") ||
    form.occasion      !== (item.occasion      ?? "") ||
    form.purchasePrice !== (item.purchasePrice ?? "") ||
    form.purchaseDate  !== (item.purchaseDate  ?? "") ||
    form.notes         !== (item.notes         ?? "") ||
    form.isFavorite    !== (item.isFavorite    ?? false) ||
    form.category      !== (item.category      ?? "")  ||
    form.timesWorn     !== String(item.timesWorn ?? 0)
  );
}

export function ItemDetailsSheet({ item, onClose, onDeleted, showAddToLookbook = false }: ItemDetailsSheetProps) {
  const [form, setForm]           = useState<FormState | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [bgRemoving, setBgRemoving] = useState(false);
  const [bgError,    setBgError]    = useState<string | null>(null);
  // compare overlay: holds both data URLs while user picks
  const [compareState, setCompareState] = useState<{
    originalDataUrl: string;
    cleanedDataUrl:  string;
  } | null>(null);
  // optimistic display URL — set immediately on save so there is no flash
  const [localImageUrl, setLocalImageUrl] = useState<string | null>(null);
  // track whether a background save is in progress (for cleanup on unmount)
  const bgSaveAbortRef = useRef(false);
  // set to true when the user skips while analysis is still running
  const bgAnalysisAbortRef = useRef(false);

  // ── Wearing Today (item-level) ────────────────────────────────────────────
  const [showLookbookSheet, setShowLookbookSheet] = useState(false);
  const [itemWornToday, setItemWornToday] = useState(false);
  const prevItemWornRef = useRef<{ timesWorn: number; lastWornDate: string | null } | null>(null);

  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const formatShortDate = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return `${m}/${d}/${String(y).slice(2)}`;
  };

  const handleWearItem = () => {
    if (!item) return;
    const newTimesWorn = (item.timesWorn ?? 0) + 1;
    prevItemWornRef.current = { timesWorn: item.timesWorn ?? 0, lastWornDate: item.lastWornDate ?? null };
    setItemWornToday(true);
    setForm((prev) => prev ? { ...prev, timesWorn: String(newTimesWorn) } : prev);
    updateItem.mutate(
      { id: item.id, data: { timesWorn: newTimesWorn, lastWornDate: todayStr } },
      { onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
      }},
    );
  };

  const handleUnwearItem = () => {
    if (!item || !prevItemWornRef.current) return;
    const prev = prevItemWornRef.current;
    setItemWornToday(false);
    setForm((f) => f ? { ...f, timesWorn: String(prev.timesWorn) } : f);
    updateItem.mutate(
      { id: item.id, data: { timesWorn: prev.timesWorn, lastWornDate: prev.lastWornDate } },
      { onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
      }},
    );
    prevItemWornRef.current = null;
  };

  const updateItem  = useUpdateClothingItem();
  const deleteItem  = useDeleteClothingItem();
  const queryClient = useQueryClient();
  const { data: outfits } = useListOutfits();
  const addToOutfit      = useAddItemToOutfit();
  const removeFromOutfit = useRemoveItemFromOutfit();

  useEffect(() => {
    if (item) {
      setForm(toForm(item));
      setTimesUsedInput(String(item.timesWorn ?? 0));
    }
    setLocalImageUrl(null);
    setShowDeleteConfirm(false);
    setCleanupError(null);
    setCleanupProcessing(false);
    setRemovalProgress(null);
    setCompareData(null);
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // After background save completes the query re-fetches with a new imageObjectPath.
  // Clear the optimistic local URL so the freshly-stored file takes over.
  useEffect(() => {
    setLocalImageUrl(null);
  }, [item?.imageObjectPath]);

  if (!item || !form) return null;

  const dirty = isDirty(form, item);
  const patch = (key: keyof FormState) => (value: string | boolean) =>
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);

  // Cleaned images are stored as PNG; originals are JPEG. Disable the button once cleaned.
  const alreadyCleaned = (localImageUrl ?? item.imageObjectPath ?? "").startsWith("data:image/png");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
  };

  const handleSave = () => {
    updateItem.mutate(
      {
        id: item.id,
        data: {
          name:          form.name.trim() || item.name,
          brand:         form.brand.trim() || null,
          color:         form.color.trim() || null,
          size:          form.size.trim() || null,
          season:        form.season || null,
          occasion:      form.occasion || null,
          purchasePrice: form.purchasePrice.trim() || null,
          purchaseDate:  form.purchaseDate.trim() || null,
          notes:         form.notes.trim() || null,
          isFavorite:    form.isFavorite,
          category:      (form.category || item.category) as ClothingItemUpdateCategory,
          timesWorn:     Math.max(0, parseInt(form.timesWorn, 10) || 0),
        },
      },
      { onSuccess: () => { invalidate(); onClose(); } },
    );
  };

  // ── Step 1: run bg removal, then show compare overlay ────────────────────
  const handleCleanUpPhoto = async () => {
    if (!item.imageObjectPath) return;
    const displayUrl = getImageUrl(item.imageObjectPath);
    if (!displayUrl) return;

    bgAnalysisAbortRef.current = false;
    setBgError(null);
    setBgRemoving(true);
    try {
      const srcBlob        = await fetch(displayUrl).then((r) => r.blob());
      const originalDataUrl = await blobToDataUrl(srcBlob);
      const cleanedDataUrl  = await removeBackground(originalDataUrl);
      // User tapped "Keep Original" while WASM was running — discard result
      if (bgAnalysisAbortRef.current) return;
      setCompareState({ originalDataUrl, cleanedDataUrl });
    } catch (err) {
      console.error("[details] bg removal failed:", err);
      setBgError("Could not remove background. Please try again.");
    } finally {
      setBgRemoving(false);
    }
  };

  // ── Step 2: user confirmed their choice in the overlay ────────────────────
  const handleCompareSave = async (choice: "original" | "cleaned") => {
    if (!compareState) return;

    // Immediately update the visible photo — no flash while DB write runs.
    const chosenUrl = choice === "cleaned"
      ? compareState.cleanedDataUrl
      : compareState.originalDataUrl;
    setLocalImageUrl(chosenUrl);
    setCompareState(null);

    if (choice === "original") {
      // Nothing changed in storage — original is already saved.
      return;
    }

    // Save cleaned version in the background.
    bgSaveAbortRef.current = false;
    try {
      const blob        = await dataUrlToBlob(compareState.cleanedDataUrl);
      const newFilename = await saveImage(
        blob,
        `${item.category}-${item.id}-cleaned-${Date.now()}.png`,
      );
      if (bgSaveAbortRef.current) return; // component unmounted
      if (item.imageObjectPath) await deleteImage(item.imageObjectPath);
      updateItem.mutate(
        { id: item.id, data: { imageObjectPath: newFilename } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
            queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
            // imageObjectPath changed → useEffect clears localImageUrl
          },
        },
      );
    } catch (err) {
      console.error("[details] background save failed:", err);
      // The chosen image is still showing optimistically; a silent failure
      // here means the item reverts on next open. Acceptable trade-off.
    }
  };

  const handleDelete = () => {
    deleteItem.mutate(
      { id: item.id },
      {
        onSuccess: () => {
          invalidate();
          onDeleted?.();
          onClose();
        },
      },
    );
  };

  const handleCleanUpPhoto = async () => {
    if (!item.imageObjectPath) return;
    const id = ++cleanupIdRef.current;
    const originalDataUrl = item.imageObjectPath;
    // Open the compare sheet immediately — the right card shows a spinner while removal runs.
    setCompareData({ originalDataUrl, cleanedDataUrl: "", hadSubject: true });
    setCleanupProcessing(true);
    setCleanupError(null);
    setRemovalProgress({ stage: "loading", pct: 0 });
    try {
      const cleanedDataUrl = await removeBackground(
        originalDataUrl,
        (p) => { if (cleanupIdRef.current === id) setRemovalProgress(p); },
      );
      if (cleanupIdRef.current === id) {
        setCompareData({ originalDataUrl, cleanedDataUrl, hadSubject: true });
      }
    } catch (err) {
      console.error("Photo cleanup error:", err);
      if (cleanupIdRef.current === id) {
        setCleanupError("Couldn't clean up this photo. Please try again.");
      }
    } finally {
      if (cleanupIdRef.current === id) {
        setCleanupProcessing(false);
        setRemovalProgress(null);
      }
    }
  };

  const handleCompareSelect = (dataUrl: string) => {
    // Cancel any in-flight removal so its result doesn't re-open the sheet.
    cleanupIdRef.current++;
    setCleanupProcessing(false);
    setRemovalProgress(null);
    // Update the displayed photo immediately — don't wait for the DB round-trip.
    setLocalImageUrl(dataUrl);
    setCompareData(null);
    updateItem.mutate(
      { id: item.id, data: { imageObjectPath: dataUrl } },
      { onSuccess: () => invalidate() },
    );
  };

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[65] flex flex-col max-w-md mx-auto bg-[#f9f4ee] overflow-y-auto"
    >
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3
                      bg-white border-b-2 border-black flex-shrink-0"
           style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
        <h2 className="font-display font-bold text-xl uppercase tracking-tight">
          Item Details
        </h2>
        <div className="flex items-center gap-2">
          {/* Favourite toggle */}
          <button
            onClick={() => {
              const next = !form.isFavorite;
              patch("isFavorite")(next);
              updateItem.mutate(
                { id: item.id, data: { isFavorite: next } },
                { onSuccess: invalidate },
              );
            }}
            className={`w-9 h-9 border-2 border-black rounded-full flex items-center justify-center transition-all
                        ${form.isFavorite
                          ? "bg-red-500 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                          : "bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"}`}
          >
            <Heart
              className="w-4 h-4"
              fill={form.isFavorite ? "white" : "none"}
              stroke={form.isFavorite ? "white" : "currentColor"}
            />
          </button>
          {/* Close */}
          <button
            onClick={onClose}
            className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                       bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                       active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Photo */}
      {item.imageObjectPath && (
        <div className="flex-shrink-0 border-b-2 border-black">
          <div
            className="w-full h-52"
            style={{
              backgroundImage: "repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%)",
              backgroundSize: "16px 16px",
            }}
          >
            <img
              src={localImageUrl ?? getImageUrl(item.imageObjectPath)!}
              alt={item.name}
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      )}

      {/* ── Action buttons (always shown) ── */}
      <div className="flex-shrink-0 border-b-2 border-black px-4 py-2 bg-white flex flex-col gap-2">
        {/* Button 1: Add to Lookbook OR Clean Up Photo */}
        {showAddToLookbook ? (
          <button
            onClick={() => setShowLookbookSheet(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                       border-2 border-black bg-[#f9f4ee] font-bold text-sm uppercase tracking-wide
                       shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                       active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
          >
            <Heart className="w-4 h-4 fill-yellow-400 text-yellow-400" /> Add to Lookbook
          </button>
        ) : (
          item.imageObjectPath && !item.imageObjectPath.includes('-cleaned-') && (
            <>
              <button
                onClick={handleCleanUpPhoto}
                disabled={bgRemoving}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                           border-2 border-black bg-[#f9f4ee] font-bold text-sm uppercase tracking-wide
                           shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                           active:translate-x-0.5 active:translate-y-0.5 active:shadow-none
                           disabled:opacity-50 transition-all"
              >
                {bgRemoving
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing Photo…</>
                  : <><Sparkles className="w-4 h-4" /> Clean Up Photo ✨</>}
              </button>
              {bgRemoving && (
                <button
                  onClick={() => { bgAnalysisAbortRef.current = true; setBgRemoving(false); }}
                  className="w-full py-1.5 text-xs font-semibold text-black/40 hover:text-black/70 transition-colors"
                >
                  Keep Original
                </button>
              )}
              {bgError && <p className="text-xs text-red-600 text-center">{bgError}</p>}
            </>
          )
        )}
      </div>

      {/* ── Form ── */}
      <div className="flex-1 px-4 py-5 flex flex-col gap-4">

        {/* Name */}
        <Field
          label="Item Name"
          value={form.name}
          onChange={patch("name") as (v: string) => void}
          placeholder="e.g. White Linen Shirt"
        />

        {/* Brand + Color */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand"  value={form.brand} onChange={patch("brand") as (v: string) => void} placeholder="Nike, Zara…" />
          <Field label="Color"  value={form.color} onChange={patch("color") as (v: string) => void} placeholder="Navy Blue" />
        </div>

        {/* Size — hidden for accessories */}
        {item.category !== "accessories" && (
          <Field label="Size" value={form.size} onChange={patch("size") as (v: string) => void} placeholder="S, M, L, 32, 8…" />
        )}
      </AnimatePresence>

      {/* Add to Lookbook picker */}
      <AnimatePresence>
        {showLookbookPicker && (
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 240 }}
            className="fixed inset-0 z-[75] flex flex-col max-w-md mx-auto bg-[#f9f4ee]"
          >
            {/* Picker header */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 pb-3
                            bg-white border-b-2 border-black flex-shrink-0"
              style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
              <h2 className="font-display font-bold text-xl uppercase tracking-tight">Add to Lookbook</h2>
              <button
                onClick={() => setShowLookbookPicker(false)}
                className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                           bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                           active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Group list */}
            <div className="flex-1 overflow-y-auto">
              {!outfits || outfits.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-2 text-center px-8">
                  <p className="text-sm font-bold text-black/40 uppercase">No saved looks yet</p>
                  <p className="text-xs text-black/30">Save a look from the Generate page first.</p>
                </div>
              ) : (
                <div className="divide-y divide-black/10">
                  {outfits.map((outfit) => {
                    const isInGroup = outfit.itemIds?.includes(item.id) ?? false;
                    const thumbItems = (outfit.items ?? []).slice(0, 3);
                    return (
                      <button
                        key={outfit.id}
                        onClick={() => {
                          if (isInGroup) {
                            removeFromOutfit.mutate(
                              { id: outfit.id, itemId: item.id },
                              { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() }); } },
                            );
                          } else {
                            addToOutfit.mutate(
                              { id: outfit.id, data: { itemId: item.id } },
                              { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() }); } },
                            );
                          }
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-black/5 active:bg-black/10 transition-colors text-left"
                      >
                        {/* 3-thumbnail strip */}
                        <div className="flex gap-0.5 shrink-0">
                          {Array.from({ length: 3 }).map((_, i) => {
                            const t = thumbItems[i];
                            return (
                              <div key={i} className="w-12 h-12 border-2 border-black overflow-hidden"
                                   style={{ background: "#FDECEF" }}>
                                {t?.imageObjectPath && (
                                  <img src={getImageUrl(t.imageObjectPath)!} alt={t.name}
                                       className="w-full h-full object-contain" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {/* Name */}
                        <span className="flex-1 font-display font-bold text-sm uppercase tracking-tight truncate">
                          {outfit.name}
                        </span>
                        {/* Checkmark */}
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors
                                        ${isInGroup ? "bg-black border-black" : "bg-white border-black/30"}`}>
                          {isInGroup && <Check className="w-3.5 h-3.5 text-white" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Form */}
      <div className="flex-1 px-4 py-5 flex flex-col gap-4">
        <Field label="Item Name" value={form.name} onChange={patch("name") as (v: string) => void}
               placeholder="e.g. Charlotte Tilbury Flawless Filter" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand"  value={form.brand} onChange={patch("brand") as (v: string) => void} placeholder="e.g. NARS" />
          <Field label="Color"  value={form.color} onChange={patch("color") as (v: string) => void} placeholder="Rose Gold" />
        </div>
        <Field label="Size / Volume" value={form.size} onChange={patch("size") as (v: string) => void}
               placeholder="30ml, 50ml, Full Size…" />
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Season"   value={form.season}   onChange={patch("season") as (v: string) => void}   options={SEASON_OPTIONS} />
          <SelectField label="Occasion" value={form.occasion} onChange={patch("occasion") as (v: string) => void} options={OCCASION_OPTIONS} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Purchase Price" value={form.purchasePrice} onChange={patch("purchasePrice") as (v: string) => void} placeholder="$49.99" />
          <Field label="Purchase Date"  value={form.purchaseDate}  onChange={patch("purchaseDate") as (v: string) => void}  type="date" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => patch("notes")(e.target.value)}
            placeholder="Anything worth remembering…"
            rows={3}
            className="w-full border-2 border-black rounded-lg px-3 py-2 text-sm font-medium
                       bg-white focus:outline-none focus:ring-2 focus:ring-primary resize-none
                       placeholder:font-normal placeholder:text-black/25"
          />
        </div>

        {/* Category + Times Worn */}
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Category"
            value={form.category}
            onChange={patch("category") as (v: string) => void}
            options={CATEGORY_OPTIONS}
          />
          <div className="flex flex-col gap-1">
            <Field
              label="Times Worn"
              type="number"
              value={form.timesWorn}
              onChange={patch("timesWorn") as (v: string) => void}
              placeholder="0"
            />
            {item.lastWornDate && (() => {
              const [y, m, d] = item.lastWornDate.split("-").map(Number);
              return (
                <span className="text-[10px] font-semibold text-black/40 pl-1">
                  Last worn: {m}/{d}/{String(y).slice(2)}
                </span>
              );
            })()}
          </div>
        </div>
        {item.lastUsedDate && (
          <div className="flex items-center justify-between border-t border-black/10 pt-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-black/40">Last used</span>
            <span className="text-sm font-semibold text-black/60">
              {formatLastUsed(item.lastUsedDate)}
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 px-4 py-4 bg-white border-t-2 border-black flex-shrink-0 flex flex-col gap-2">
        <AnimatePresence>
          {dirty && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              onClick={handleSave}
              disabled={updateItem.isPending}
              className="w-full btn-brutalist py-3 rounded-xl flex items-center justify-center gap-2 text-sm"
            >
              <Save className="w-4 h-4" />
              {updateItem.isPending ? "Saving…" : "Save Changes"}
            </motion.button>
          )}
        </AnimatePresence>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm
                       font-bold uppercase border-2 border-black/20 text-black/35
                       hover:border-red-500 hover:text-red-600 transition-all"
          >
            <Trash2 className="w-4 h-4" />
            Delete from Vanity Forever
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 py-3 rounded-xl text-sm font-bold uppercase border-2 border-black bg-white
                         shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                         active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteItem.isPending}
              className="flex-1 py-3 rounded-xl text-sm font-bold uppercase border-2 border-red-600
                         bg-red-500 text-white shadow-[2px_2px_0px_0px_rgba(185,28,28,1)]
                         active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all
                         disabled:opacity-50"
            >
              {deleteItem.isPending ? "Deleting…" : "Yes, Delete Forever"}
            </button>
          </div>
        )}
      </div>
    </motion.div>

    {/* ── Compare overlay ── */}
    <AnimatePresence>
      {compareState && (
        <BgCompareOverlay
          originalDataUrl={compareState.originalDataUrl}
          cleanedDataUrl={compareState.cleanedDataUrl}
          onSave={handleCompareSave}
          onCancel={() => setCompareState(null)}
        />
      )}
    </AnimatePresence>

    {/* ── Add to Lookbook sheet ── */}
    <AnimatePresence>
      {showLookbookSheet && (
        <AddToLookbookSheet item={item} onClose={() => setShowLookbookSheet(false)} />
      )}
    </AnimatePresence>
    </>
  );
}
