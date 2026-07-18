/**
 * WardrobePage — vanity-bg.png (1024×1536 PNG)
 * Local-first: data comes from IndexedDB via useListClothing / useSaveOutfit.
 */

import React, {
  useEffect, useRef, useState,
  useCallback, RefObject,
} from "react";
import { useLocation } from "wouter";
import {
  useListClothing, getListClothingQueryKey,
} from "@/hooks/useLocalWardrobe";
import {
  useListOutfits, useSaveOutfit, getListOutfitsQueryKey,
} from "@/hooks/useLocalOutfits";
import type { ClothingItem } from "@/types/local";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ClosetRow, ClosetRowHandle } from "@/components/ClosetRow";
import { QuickAddSheet } from "@/components/clothing/QuickAddSheet";
import { ItemDetailsSheet } from "@/components/clothing/ItemDetailsSheet";
import { UpgradeSheet, UpgradeReason } from "@/components/paywall/UpgradeSheet";
import { useQueryClient } from "@tanstack/react-query";
import { useEntitlements } from "@/hooks/useEntitlements";
import { FREE_ITEM_LIMIT } from "@/types/local";

// ── Types ─────────────────────────────────────────────────────────────────────
type RowKey   = "makeup" | "skincare" | "hair" | "fragrances";
type Category = "makeup" | "skincare" | "hair" | "fragrances";

const ROWS: { key: RowKey; btnLabel: string }[] = [
  { key: "makeup",     btnLabel: "+ ADD MAKEUP"     },
  { key: "skincare",   btnLabel: "+ ADD SKINCARE"   },
  { key: "hair",       btnLabel: "+ ADD HAIRCARE"   },
  { key: "fragrances", btnLabel: "+ ADD FRAGRANCES" },
];

// ── Image constants ───────────────────────────────────────────────────────────
const IMG_W = 1024;
const IMG_H = 1536;
const NAV_H = 90;

const LM = {
  doorL: 0.207,
  doorR: 0.801,
  rows: [
    { sectionTop: 0.241, shelfY: 0.344, btnCY: 0.220 },
    { sectionTop: 0.390, shelfY: 0.502, btnCY: 0.367 },
    { sectionTop: 0.547, shelfY: 0.663, btnCY: 0.525 },
    { sectionTop: 0.702, shelfY: 0.805, btnCY: 0.683 },
  ],
  saveAreaY: 0.84,
} as const;

// ── useImageRect ─────────────────────────────────────────────────────────────
interface ImgRect {
  top: number; left: number; width: number; height: number;
  containerH: number; containerW: number;
}

function useImageRect(containerRef: RefObject<HTMLDivElement>): ImgRect {
  const [rect, setRect] = useState<ImgRect>({ top: 0, left: 0, width: 0, height: 0, containerH: 0, containerW: 0 });
  useEffect(() => {
    const compute = () => {
      const c = containerRef.current;
      if (!c) return;
      const cW = c.clientWidth, cH = c.clientHeight;
      // Cover: scale to fill. rL may be negative — used only for UI positioning.
      // The image itself uses left:50%+translateX(-50%) so iOS clips both sides.
      const scale = Math.max(cW / IMG_W, cH / IMG_H);
      const rW = IMG_W * scale, rH = IMG_H * scale;
      const rL = (cW - rW) / 2, rT = (cH - rH) / 2;
      setRect({ top: rT, left: rL, width: rW, height: rH, containerH: cH, containerW: cW });
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [containerRef]);
  return rect;
}

const pH = (ir: ImgRect, f: number) => ir.height * f;
const pW = (ir: ImgRect, f: number) => ir.width  * f;
const pX = (ir: ImgRect, f: number) => ir.left   + ir.width  * f;
const pY = (ir: ImgRect, f: number) => ir.top    + ir.height * f;

// ── Page ──────────────────────────────────────────────────────────────────────
export default function WardrobePage() {
  const containerRef = useRef<HTMLDivElement>(null!);
  const ir = useImageRect(containerRef);

  const rowRefs: Record<RowKey, RefObject<ClosetRowHandle | null>> = {
    makeup:     useRef<ClosetRowHandle | null>(null),
    skincare:   useRef<ClosetRowHandle | null>(null),
    hair:       useRef<ClosetRowHandle | null>(null),
    fragrances: useRef<ClosetRowHandle | null>(null),
  };

  const [centred,       setCentred]       = useState<Partial<Record<RowKey, ClothingItem>>>({});
  const [addCategory,   setAddCategory]   = useState<Category | null>(null);
  const [detailsItem,   setDetailsItem]   = useState<ClothingItem | null>(null);
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason | null>(null);
  const [isSaveOpen,    setIsSaveOpen]    = useState(false);
  const [saveName,      setSaveName]      = useState("");
  const [saveSuccess,   setSaveSuccess]   = useState(false);

  const saveOutfit = useSaveOutfit();

  const { data: makeup     = [] } = useListClothing({ category: "makeup"     }, { query: { queryKey: getListClothingQueryKey({ category: "makeup"     }) } });
  const { data: skincare   = [] } = useListClothing({ category: "skincare"   }, { query: { queryKey: getListClothingQueryKey({ category: "skincare"   }) } });
  const { data: hair       = [] } = useListClothing({ category: "hair"       }, { query: { queryKey: getListClothingQueryKey({ category: "hair"       }) } });
  const { data: fragrances = [] } = useListClothing({ category: "fragrances" }, { query: { queryKey: getListClothingQueryKey({ category: "fragrances" }) } });
  const { data: outfits = [] } = useListOutfits();

  const rowData: Record<RowKey, ClothingItem[]> = { makeup, skincare, hair, fragrances };
  const totalItems = makeup.length + skincare.length + hair.length + fragrances.length;

  const queryClient = useQueryClient();
  const { tier, canAddItem } = useEntitlements();

  useEffect(() => {
    setCentred(prev => {
      const next = { ...prev };
      let changed = false;
      (["makeup", "skincare", "hair", "fragrances"] as RowKey[]).forEach(key => {
        if (rowData[key].length === 0 && next[key] !== undefined) {
          delete next[key]; changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [makeup.length, skincare.length, hair.length, fragrances.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCentredHandlers: Record<RowKey, (item: ClothingItem | null) => void> = {
    makeup:     useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, makeup:     item ?? undefined })), []),
    skincare:   useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, skincare:   item ?? undefined })), []),
    hair:       useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, hair:       item ?? undefined })), []),
    fragrances: useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, fragrances: item ?? undefined })), []),
  };

  const handleAddClick = useCallback((cat: Category) => {
    if (canAddItem(totalItems)) setAddCategory(cat); else setUpgradeReason("items");
  }, [canAddItem, totalItems]);

  const addHandlers: Record<RowKey, () => void> = {
    makeup:     useCallback(() => handleAddClick("makeup"),     [handleAddClick]),
    skincare:   useCallback(() => handleAddClick("skincare"),   [handleAddClick]),
    hair:       useCallback(() => handleAddClick("hair"),       [handleAddClick]),
    fragrances: useCallback(() => handleAddClick("fragrances"), [handleAddClick]),
  };

  const handleItemTap = useCallback((item: ClothingItem) => setDetailsItem(item), []);

  const handleSave = () => {
    if (!saveName.trim()) return;
    const itemIds = Object.values(centred)
      .filter((i): i is ClothingItem => i != null)
      .map(i => i.id);
    saveOutfit.mutate(
      { data: { name: saveName.trim(), itemIds } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
          setSaveSuccess(true);
          setTimeout(() => { setIsSaveOpen(false); setSaveSuccess(false); setSaveName(""); }, 1400);
        },
      },
    );
  };

  const [, navigate] = useLocation();
  const isFree    = tier === "free";
  const itemsLeft = isFree ? Math.max(0, FREE_ITEM_LIMIT - totalItems) : null;
  const ready     = ir.width > 0;

  const sectionHeights = ready
    ? LM.rows.map(lm => pH(ir, lm.shelfY - lm.sectionTop))
    : LM.rows.map(() => 0);

  return (
    <>
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: `calc(100dvh - ${NAV_H}px)`,
        overflow: "hidden",
        transform: "translateZ(0)", // force iOS WKWebView to honour overflow:hidden
        background: "#E8B0B8",
      }}
    >
      {/* Background image — centred via CSS transform; iOS clips transform overflow correctly */}
      <img
        src="/vanity-bg.png?v=11"
        alt="My Digital Vanity"
        style={{
          position: "absolute",
          top:       ready ? ir.top   : 0,
          left:      "50%",
          transform: "translateX(-50%)",
          width:     ready ? ir.width  : "100%",
          height:    ready ? ir.height : "auto",
          display: "block",
          pointerEvents: "none",
          userSelect: "none",
          zIndex: 0,
        }}
      />
      {/* Pink tint overlay — shifts salmon tones toward icon pink */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none",
        background: "rgba(245, 184, 200, 0.30)",
      }} />

      {ready && (
        <>
          {/* Item-count badge (free tier) */}
          {itemsLeft !== null && (
            <button
              onClick={() => setUpgradeReason("items")}
              data-testid="badge-item-count"
              aria-label={`${totalItems} of ${FREE_ITEM_LIMIT} items used — tap to upgrade`}
              style={{
                position: "absolute",
                top: pY(ir, 0.165), left: "50%", transform: "translateX(-50%)",
                zIndex: 25,
                padding: "3px 14px", borderRadius: 20, border: "none",
                background: totalItems >= FREE_ITEM_LIMIT
                  ? "rgba(200,40,40,0.14)"
                  : "rgba(255,255,255,0.55)",
                boxShadow: totalItems >= FREE_ITEM_LIMIT
                  ? "0 0 0 2px rgba(200,40,40,0.40)"
                  : "0 0 0 1.5px rgba(180,100,110,0.28)",
                color: totalItems >= FREE_ITEM_LIMIT ? "#aa0000" : "#7a3a40",
                fontWeight: 700, fontSize: 10,
                letterSpacing: "0.08em", textTransform: "uppercase",
                whiteSpace: "nowrap", cursor: "pointer",
              }}
            >
              {totalItems}/{FREE_ITEM_LIMIT} ITEMS
            </button>
          )}

          {/* 4 shelf rows */}
          {ROWS.map(({ key, btnLabel }, rowIdx) => {
            const lm      = LM.rows[rowIdx];
            const items   = rowData[key];
            const secTop  = pY(ir, lm.sectionTop);
            const secH    = pH(ir, lm.shelfY - lm.sectionTop);
            const carLeft = pX(ir, LM.doorL);
            const carW    = pW(ir, LM.doorR - LM.doorL);
            const btnCY   = pY(ir, lm.btnCY);
            const btnH    = Math.max(32, pH(ir, 0.045));
            const labelY  = pY(ir, lm.btnCY + (lm.sectionTop - lm.btnCY) * 0.08);

            return (
              <React.Fragment key={key}>
                {/* Category label */}
                <button
                  onClick={addHandlers[key]}
                  aria-label={btnLabel}
                  style={{
                    position: "absolute", top: labelY, left: carLeft, width: carW,
                    transform: "translateY(-50%)", zIndex: 23,
                    textAlign: "center", background: "none", border: "none", cursor: "pointer", padding: 0,
                  }}
                >
                  <span style={{
                    fontSize: Math.max(9, pH(ir, 0.013)), fontWeight: 800,
                    letterSpacing: "0.12em", color: "rgba(120,60,70,0.75)",
                    fontFamily: "var(--font-display)", textTransform: "uppercase",
                  }}>
                    {btnLabel}
                  </span>
                </button>

                {/* Item carousel */}
                {items.length > 0 && (
                  <div
                    data-testid={`row-${key}`}
                    style={{
                      position: "absolute", top: secTop, left: carLeft,
                      width: carW, height: secH, zIndex: 10, overflow: "hidden",
                      // iOS WebKit won't clip transformed children via overflow or clipPath alone;
                      // -webkit-mask-image forces a new compositing layer that actually clips.
                      WebkitMaskImage: "linear-gradient(#fff 0 0)",
                      maskImage: "linear-gradient(#fff 0 0)",
                    }}
                  >
                    <ClosetRow
                      ref={rowRefs[key]}
                      items={items}
                      onCenteredItem={setCentredHandlers[key]}
                      onItemTap={handleItemTap}
                      maxPhotoH={Math.max(0, sectionHeights[rowIdx] - 4)}
                    />
                  </div>
                )}

                {/* ADD tap zone */}
                <button
                  onClick={addHandlers[key]}
                  aria-label={btnLabel}
                  data-testid={`add-btn-${key}`}
                  style={{
                    position: "absolute",
                    top:    btnCY - btnH / 2,
                    left:   carLeft, width: carW, height: btnH,
                    zIndex: 22, background: "transparent", border: "none", cursor: "pointer",
                  }}
                />
              </React.Fragment>
            );
          })}

          {/* Person icon → favorites */}
          <button
            onClick={() => navigate("/favorites")}
            data-testid="button-person-icon"
            aria-label="View saved looks"
            style={{
              position: "absolute", top: pY(ir, 0.905), left: pX(ir, 0.195),
              width: pW(ir, 0.110), height: pH(ir, 0.065),
              zIndex: 25, background: "transparent", border: "none", cursor: "pointer",
            }}
          />

          {/* Lipstick icon → upgrade */}
          <button
            onClick={() => setUpgradeReason("items")}
            aria-label="Upgrade to premium"
            style={{
              position: "absolute", top: pY(ir, 0.906), left: pX(ir, 0.670),
              width: pW(ir, 0.130), height: pH(ir, 0.080),
              zIndex: 25, background: "transparent", border: "none", cursor: "pointer",
            }}
          />

          {/* SAVE button */}
          <button
            onClick={() => { setSaveName(""); setIsSaveOpen(true); }}
            aria-label="Save current look"
            style={{
              position: "absolute",
              top:    pY(ir, 0.9466) - pW(ir, 0.0625),
              left:   pX(ir, 0.491)  - pW(ir, 0.0625),
              width:  pW(ir, 0.125), height: pW(ir, 0.125),
              borderRadius: "50%", zIndex: 26,
              background: "linear-gradient(160deg, #E8B0B8 0%, #D0909A 100%)",
              border: "2px solid #D0909A",
              boxShadow: "0 2px 8px rgba(180,100,120,0.25)",
              cursor: "pointer",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: 0, lineHeight: 1.15, padding: 0,
            }}
          >
            <span style={{ fontSize: pW(ir, 0.022), fontWeight: 900, color: "#000", letterSpacing: "0.06em", fontFamily: "var(--font-display)" }}>SAVE</span>
            <span style={{ fontSize: pW(ir, 0.019), fontWeight: 800, color: "#000", letterSpacing: "0.04em", fontFamily: "var(--font-display)" }}>LOOK 🩷</span>
          </button>
        </>
      )}

    </div>

    {/* ── Modals — rendered OUTSIDE the overflow:hidden+transform container so
        that position:fixed children aren't clipped by the iOS WKWebView
        "transform creates a new containing block" behaviour. ── */}

    {/* Save modal */}
    <AnimatePresence>
      {isSaveOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: "fixed", inset: 0, zIndex: 60,
            background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 24px",
          }}
        >
          <motion.div
            initial={{ scale: 0.92, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 12 }}
            style={{
              background: "#fff", borderRadius: 20,
              border: "2.5px solid #000",
              boxShadow: "4px 4px 0 #000",
              padding: "24px 20px 20px",
              width: "100%", maxWidth: 340,
            }}
          >
            {saveSuccess ? (
              <div style={{ textAlign: "center", padding: "12px 0" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>💕</div>
                <p style={{ fontWeight: 800, fontSize: 16, fontFamily: "var(--font-display)" }}>Look saved!</p>
              </div>
            ) : (
              <>
                <p style={{ fontWeight: 800, fontSize: 15, fontFamily: "var(--font-display)", marginBottom: 12 }}>
                  Name this look
                </p>
                <input
                  autoFocus
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && saveName.trim() && handleSave()}
                  placeholder="e.g. Sunday Glow ✨"
                  style={{
                    width: "100%", height: 42, borderRadius: 10,
                    border: "2px solid #000", padding: "0 12px",
                    fontSize: 14, fontFamily: "var(--font-display)",
                    boxSizing: "border-box", marginBottom: 12, outline: "none",
                  }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setIsSaveOpen(false)}
                    style={{
                      flex: 1, height: 40, borderRadius: 20,
                      border: "2px solid #000", background: "#fff",
                      fontWeight: 700, fontSize: 13, cursor: "pointer",
                      fontFamily: "var(--font-display)",
                    }}
                  >Cancel</button>
                  <button
                    onClick={handleSave}
                    disabled={!saveName.trim() || saveOutfit.isPending}
                    style={{
                      flex: 1, height: 40, borderRadius: 20,
                      border: "2px solid #D0909A",
                      background: "linear-gradient(to bottom, #E8B0B8, #D0909A)",
                      color: "#4A3A3A", fontWeight: 800, fontSize: 13,
                      cursor: saveName.trim() ? "pointer" : "default",
                      opacity: saveName.trim() ? 1 : 0.45,
                      fontFamily: "var(--font-display)",
                    }}
                  >
                    {saveOutfit.isPending ? "…" : "Save ♡"}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    <AnimatePresence>
      {upgradeReason && (
        <UpgradeSheet reason={upgradeReason} onClose={() => setUpgradeReason(null)} />
      )}
    </AnimatePresence>
    <AnimatePresence>
      {addCategory && (
        <QuickAddSheet
          key={addCategory}
          open={!!addCategory}
          onOpenChange={open => !open && setAddCategory(null)}
          category={addCategory}
          existingCount={rowData[addCategory as RowKey]?.length ?? 0}
        />
      )}
    </AnimatePresence>
    <AnimatePresence>
      {detailsItem && (
        <ItemDetailsSheet
          key={detailsItem.id}
          item={detailsItem}
          onClose={() => setDetailsItem(null)}
        />
      )}
    </AnimatePresence>
    </>
  );
}
