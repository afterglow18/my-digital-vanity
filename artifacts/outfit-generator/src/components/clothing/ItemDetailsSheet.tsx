/**
 * ItemDetailsSheet — full-screen overlay showing a clothing item's details.
 * Every field is optional and editable. A "Save" button appears only when
 * the form is dirty. Delete is always available.
 */
import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Heart, Trash2, Save, ChevronDown, Sparkles, Loader2, Check } from "lucide-react";
import type { ClothingItem, ClothingItemUpdateCategory } from "@/types/local";
import { useUpdateClothingItem, useDeleteClothingItem, getListClothingQueryKey } from "@/hooks/useLocalWardrobe";
import { getListOutfitsQueryKey, useListOutfits, useAddItemToOutfit, useRemoveItemFromOutfit } from "@/hooks/useLocalOutfits";
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

// ── Component ─────────────────────────────────────────────────────────────────

interface ItemDetailsSheetProps {
  item: ClothingItem | null;
  onClose: () => void;
  onDeleted?: () => void;
  /** When true, show "Add to Lookbook" instead of "Clean Up Photo".
   *  Pass as true from search results and the favorites page. */
  showAddToLookbook?: boolean;
}

interface FormState {
  name: string; brand: string; color: string; size: string;
  season: string; occasion: string; purchasePrice: string;
  purchaseDate: string; notes: string; isFavorite: boolean; category: string;
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
    form.category      !== (item.category      ?? "")
  );
}

export function ItemDetailsSheet({ item, onClose, onDeleted, showAddToLookbook = false }: ItemDetailsSheetProps) {
  const [form, setForm]                   = useState<FormState | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [timesUsedInput, setTimesUsedInput] = useState("0");
  const [showLookbookPicker, setShowLookbookPicker] = useState(false);

  // Local image URL — starts from item, updates immediately when user picks a cleaned version
  const [localImageUrl, setLocalImageUrl] = useState<string | null>(null);

  // Generation counter — incremented whenever a cleanup is started or cancelled so a
  // stale WASM result can't re-open the compare sheet after the user already saved.
  const cleanupIdRef = useRef(0);

  // Photo cleanup state
  const [cleanupProcessing, setCleanupProcessing] = useState(false);
  const [cleanupError, setCleanupError]           = useState<string | null>(null);
  const [removalProgress, setRemovalProgress]     = useState<RemovalProgress | null>(null);
  const [compareData, setCompareData] = useState<{
    originalDataUrl: string;
    cleanedDataUrl: string;
    hadSubject: boolean;
  } | null>(null);

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
        },
      },
      { onSuccess: () => { invalidate(); onClose(); } },
    );
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
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[65] flex flex-col max-w-md mx-auto bg-[#f9f4ee] overflow-y-auto"
    >
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 pb-3
                      bg-white border-b-2 border-black flex-shrink-0"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
        <h2 className="font-display font-bold text-xl uppercase tracking-tight">Item Details</h2>
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
              src={getImageUrl(localImageUrl ?? item.imageObjectPath)!}
              alt={item.name}
              className="w-full h-full object-contain"
            />
          </div>

          {/* Photo action button — Clean Up Photo OR Add to Lookbook */}
          {item.imageObjectPath && (
            <div className="px-4 py-2 bg-white border-t-2 border-black/10 flex flex-col gap-1.5">
              {showAddToLookbook ? (
                <button
                  onClick={() => setShowLookbookPicker(true)}
                  className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm
                             font-bold uppercase border-2 border-black bg-white
                             shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                             active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
                >
                  <span className="text-base leading-none">💄</span>
                  Add to Lookbook
                </button>
              ) : (
                <>
                  <button
                    onClick={handleCleanUpPhoto}
                    disabled={cleanupProcessing || alreadyCleaned}
                    className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm
                               font-bold uppercase border-2 border-black bg-white
                               shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                               active:translate-y-0.5 active:translate-x-0.5 active:shadow-none
                               transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {cleanupProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {removalProgress?.stage === "loading"
                          ? `Downloading… ${removalProgress.pct}%`
                          : "Removing background…"}
                      </>
                    ) : alreadyCleaned ? (
                      <>
                        <Check className="w-4 h-4" />
                        Background Removed
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Clean Up Photo
                      </>
                    )}
                  </button>
                  {cleanupError && (
                    <p className="text-center text-xs text-red-600 font-medium">{cleanupError}</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* PhotoCompareSheet overlay */}
      <AnimatePresence>
        {compareData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex flex-col max-w-md mx-auto"
          >
            <PhotoCompareSheet
              originalDataUrl={compareData.originalDataUrl}
              cleanedDataUrl={compareData.cleanedDataUrl}
              hadSubject={compareData.hadSubject}
              bgProcessing={cleanupProcessing}
              removalProgress={removalProgress}
              cleanupError={cleanupError}
              onSelect={handleCompareSelect}
              onCancel={() => { setCompareData(null); setCleanupError(null); }}
            />
          </motion.div>
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
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Category" value={form.category}
                       onChange={patch("category") as (v: string) => void} options={CATEGORY_OPTIONS} />
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-black/40">Times Used</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={timesUsedInput}
              onChange={(e) => setTimesUsedInput(e.target.value)}
              onBlur={() => {
                const parsed = Math.max(0, parseInt(timesUsedInput, 10) || 0);
                setTimesUsedInput(String(parsed));
                if (parsed !== (item.timesWorn ?? 0)) {
                  updateItem.mutate(
                    { id: item.id, data: { timesWorn: parsed } },
                    { onSuccess: invalidate },
                  );
                }
              }}
              className="w-full border-2 border-black rounded-lg px-3 py-2 text-sm font-medium
                         bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
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
  );
}
