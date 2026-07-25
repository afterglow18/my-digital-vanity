/**
 * UpgradeSheet — full-screen paywall.
 *
 * Loads packages from RevenueCat on mount BEFORE showing the CTA so the
 * purchase button is always backed by a real StoreKit package. Live prices
 * come from the store (not hardcoded) per App Store Review guidelines.
 *
 * States:
 *   loading  — fetching packages from RevenueCat/StoreKit
 *   error    — fetch failed; show message + retry button
 *   ready    — packages loaded; normal paywall UI
 */
import React, { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { X, Check, RefreshCw } from "lucide-react";
import { useEntitlements, type PurchaseResult } from "@/hooks/useEntitlements";
import { fetchPackages, type RCPackage } from "@/lib/revenuecat";
import type { PurchaseProduct } from "@/types/local";

const PRIVACY_POLICY_URL = "https://app.notion.com/p/My-Digital-Collection-Privacy-Policy-39682db6065380b19dedcb108d4a0ef4?source=copy_link";
const TERMS_URL          = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

export type UpgradeReason = "items" | "outfits" | "mannequin";

interface Props {
  reason:  UpgradeReason;
  onClose: () => void;
}

// ── Brand colours ─────────────────────────────────────────────────────────────
const ROSE       = "#E8B0B8";
const ROSE_DARK  = "#D0909A";
const ROSE_LIGHT = "#FDF0F3";
const ROSE_MID   = "#D0909A";

// ── Fallback prices shown in web preview (StoreKit prices used on native) ────
const FALLBACK_PRICES: Record<PurchaseProduct, string> = {
  monthly:  "$1.99",
  yearly:   "$19.99",
  lifetime: "$9.99",
  premium:  "$9.99",
};

// ── Static plan metadata (prices come from StoreKit at runtime) ───────────────
const FEATURES = [
  "Unlimited beauty products",
  "Unlimited saved looks",
  "Save your entire vanity",
  "One-time payment options",
] as const;

type PlanMeta = {
  id:      PurchaseProduct;
  label:   string;
  per:     string;
  badge?:  string;
  perks:   string[];
};

const PLAN_META: PlanMeta[] = [
  {
    id:    "monthly",
    label: "MONTHLY",
    per:   "/month",
    perks: ["Cancel anytime", "Billed monthly"],
  },
  {
    id:    "yearly",
    label: "YEARLY",
    per:   "/year",
    perks: ["Save 17%", "Billed yearly"],
  },
  {
    id:    "lifetime",
    label: "LIFETIME",
    per:   "one-time",
    badge: "BEST VALUE",
    perks: ["Pay once", "Yours forever"],
  },
];

// ── Component ─────────────────────────────────────────────────────────────────
export function UpgradeSheet({ onClose }: Props) {
  const { purchase, restore } = useEntitlements();
  const [selected,  setSelected]  = useState<PurchaseProduct>("lifetime");
  const [status,    setStatus]    = useState<"idle" | "pending" | "restoring" | "error">("idle");
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);

  // Package loading state
  const [packages,      setPackages]      = useState<RCPackage[]>([]);
  const [loadingPkgs,   setLoadingPkgs]   = useState(true);
  const [pkgError,      setPkgError]      = useState<string | null>(null);

  // ── Load packages on mount ─────────────────────────────────────────────────
  const loadPackages = useCallback(async () => {
    setLoadingPkgs(true);
    setPkgError(null);
    console.log("[UpgradeSheet] Loading packages from RevenueCat...");
    try {
      const pkgs = await fetchPackages();
      console.log(`[UpgradeSheet] ${pkgs.length} package(s) loaded:`, pkgs.map(p => `${p.product}=${p.priceString}`).join(", "));
      setPackages(pkgs);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[UpgradeSheet] Failed to load packages:", msg);
      setPkgError(msg);
    } finally {
      setLoadingPkgs(false);
    }
  }, []);

  useEffect(() => {
    loadPackages();
  }, [loadPackages]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Get live StoreKit price, or fallback for web preview */
  function priceFor(product: PurchaseProduct): string {
    const pkg = packages.find(p => p.product === product);
    return pkg?.priceString ?? FALLBACK_PRICES[product];
  }

  const handlePurchase = useCallback(async () => {
    if (status === "pending" || status === "restoring") return;
    if (loadingPkgs) {
      console.warn("[UpgradeSheet] Tapped purchase while packages still loading");
      return;
    }
    setErrorMsg(null);
    setStatus("pending");
    console.log(`[UpgradeSheet] Starting purchase for '${selected}'...`);
    const result: PurchaseResult = await purchase(selected);
    console.log(`[UpgradeSheet] Purchase result: ${result}`);
    if (result === "success") {
      onClose();
    } else if (result === "unavailable") {
      setErrorMsg("Purchase unavailable right now. Please try again.");
      setStatus("error");
    } else {
      // cancelled — user dismissed the native sheet
      setStatus("idle");
    }
  }, [status, loadingPkgs, purchase, selected, onClose]);

  const handleRestore = useCallback(async () => {
    if (status !== "idle") return;
    setErrorMsg(null);
    setStatus("restoring");
    console.log("[UpgradeSheet] Restoring purchases...");
    const result: PurchaseResult = await restore();
    console.log(`[UpgradeSheet] Restore result: ${result}`);
    if (result === "success") {
      onClose();
    } else if (result === "unavailable") {
      setErrorMsg("Restore failed. Check your connection and try again.");
      setStatus("error");
    } else {
      setErrorMsg("No previous purchase found for this Apple ID.");
      setStatus("error");
    }
  }, [status, restore, onClose]);

  const selectedPrice = priceFor(selected);
  const ctaBusy = status === "pending" || status === "restoring";

  // ── Package error state ───────────────────────────────────────────────────
  if (!loadingPkgs && pkgError) {
    return (
      <motion.div
        initial={{ opacity: 0, y: "100%" }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 240 }}
        className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-5 max-w-md mx-auto overflow-hidden"
        style={{ background: "#FDF5F9" }}
      >
        <button
          onClick={onClose}
          style={{ top: "calc(env(safe-area-inset-top) + 10px)" }}
          className="absolute right-3 top-3 w-8 h-8 rounded-full bg-white/90
                     flex items-center justify-center border border-black/10"
        >
          <X className="w-4 h-4 text-black/60" />
        </button>

        <span className="text-5xl">💄</span>
        <div className="text-center px-8">
          <p className="font-black text-lg uppercase tracking-tight mb-1">Plans unavailable</p>
          <p className="text-sm text-black/50 font-medium">
            We couldn't load subscription plans right now. Check your connection and try again.
          </p>
        </div>
        <button
          onClick={loadPackages}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm uppercase tracking-wide"
          style={{ background: "linear-gradient(to bottom, #E8B0B8, #D0909A)", border: "2px solid #D0909A" }}
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
      </motion.div>
    );
  }

  // ── Main paywall UI ────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[80] flex flex-col max-w-md mx-auto overflow-hidden"
      style={{ background: "#FDF5F9" }}
    >

      {/* ── Hero strip ─────────────────────────────────────────────────── */}
      <div
        className="relative flex items-center justify-center flex-shrink-0"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          minHeight: 64,
          backgroundColor: "#E8B0B8",
          backgroundImage: [
            "repeating-linear-gradient(0deg, transparent 0px, transparent 20px, rgba(60,30,40,0.38) 20px, rgba(60,30,40,0.38) 30px, rgba(255,255,255,0.55) 30px, rgba(255,255,255,0.55) 32px, rgba(60,30,40,0.38) 32px, rgba(60,30,40,0.38) 42px, transparent 42px, transparent 62px)",
            "repeating-linear-gradient(90deg, transparent 0px, transparent 20px, rgba(60,30,40,0.38) 20px, rgba(60,30,40,0.38) 30px, rgba(255,255,255,0.55) 30px, rgba(255,255,255,0.55) 32px, rgba(60,30,40,0.38) 32px, rgba(60,30,40,0.38) 42px, transparent 42px, transparent 62px)",
          ].join(", "),
        }}
      >
        <span
          className="text-4xl leading-none"
          style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.35))" }}
        >
          💄
        </span>
        <button
          onClick={onClose}
          style={{ top: "calc(env(safe-area-inset-top) + 10px)" }}
          className="absolute right-3 w-8 h-8 rounded-full bg-white/90
                     flex items-center justify-center border border-black/10
                     active:scale-95 transition-transform"
        >
          <X className="w-4 h-4 text-black/60" />
        </button>
      </div>

      {/* ── Title ──────────────────────────────────────────────────────── */}
      <div className="px-5 pt-4 pb-3 flex-shrink-0">
        <h1
          className="font-black uppercase leading-none tracking-tight"
          style={{ fontSize: 34, letterSpacing: "-0.02em" }}
        >
          UNLOCK YOUR<br />
          <span style={{ color: ROSE }}>DIGITAL VANITY</span>
        </h1>
        <p className="text-xs font-semibold text-black/45 mt-1.5 tracking-wide">
          A premium feature — unlock it once.
        </p>
      </div>

      {/* ── Features card ──────────────────────────────────────────────── */}
      <div
        className="mx-5 mb-4 rounded-2xl flex-shrink-0"
        style={{ background: "#111" }}
      >
        <p
          className="px-4 pt-3 pb-1.5 font-bold text-[10px] uppercase tracking-widest"
          style={{ color: ROSE_MID }}
        >
          Upgrade &amp; get:
        </p>
        <ul className="px-4 pb-3 grid grid-cols-2 gap-x-3 gap-y-2">
          {FEATURES.map(f => (
            <li key={f} className="flex items-center gap-2">
              <span
                className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: ROSE }}
              >
                <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
              </span>
              <span className="text-white text-[11px] font-medium leading-tight">{f}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── Plan picker ────────────────────────────────────────────────── */}
      <p className="text-center text-[10px] font-bold uppercase tracking-widest text-black/35 mb-2.5 flex-shrink-0">
        Choose your plan
      </p>

      {/* Loading skeleton */}
      {loadingPkgs ? (
        <div className="px-5 flex gap-2 mb-4 flex-shrink-0">
          {PLAN_META.map(plan => (
            <div
              key={plan.id}
              className="flex-1 h-28 rounded-xl animate-pulse"
              style={{ background: "#F0E4E8" }}
            />
          ))}
        </div>
      ) : (
        <div className="px-5 flex gap-2 mb-4 flex-shrink-0">
          {PLAN_META.map(plan => {
            const active = selected === plan.id;
            const livePrice = priceFor(plan.id);
            return (
              <button
                key={plan.id}
                onClick={() => setSelected(plan.id)}
                className="flex-1 flex flex-col items-start p-3 rounded-xl text-left transition-all"
                style={{
                  position:   "relative",
                  background:  active ? ROSE_LIGHT : "white",
                  border:      active ? `2px solid ${ROSE}` : "2px solid #E8D5DF",
                  boxShadow:   active ? `3px 3px 0 ${ROSE}` : "none",
                }}
              >
                {plan.badge && (
                  <span
                    className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap
                               text-[8px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full"
                    style={{ background: ROSE, color: "#fff" }}
                  >
                    {plan.badge}
                  </span>
                )}

                <span className="text-[9px] font-black uppercase tracking-widest text-black/45 mb-0.5">
                  {plan.label}
                </span>
                {/* Live price from StoreKit — required by App Store guidelines */}
                <span className="font-black text-xl leading-none">
                  {livePrice}
                </span>
                <span className="text-[10px] text-black/35 font-medium mb-2">
                  {plan.per}
                </span>

                {plan.perks.map(perk => (
                  <span key={perk} className="flex items-center gap-1 text-[9px] font-semibold text-black/55">
                    <Check
                      className="w-2.5 h-2.5 flex-shrink-0"
                      strokeWidth={3}
                      style={{ color: active ? ROSE : "#aaa" }}
                    />
                    {perk}
                  </span>
                ))}
              </button>
            );
          })}
        </div>
      )}

      {/* ── CTA ────────────────────────────────────────────────────────── */}
      <div
        className="px-5 flex flex-col gap-2.5 flex-shrink-0 mt-auto"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        {errorMsg && (
          <p className="text-center text-xs font-semibold text-red-500 -mb-1">
            {errorMsg}
          </p>
        )}

        <button
          onClick={handlePurchase}
          disabled={ctaBusy || loadingPkgs}
          className="w-full py-4 rounded-xl font-black text-base uppercase tracking-wide
                     text-black transition-all active:translate-y-0.5 active:shadow-none
                     disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background:  ctaBusy ? ROSE_DARK : `linear-gradient(to bottom, ${ROSE}, ${ROSE_DARK})`,
            border:      `2.5px solid ${ROSE_DARK}`,
            boxShadow:   ctaBusy ? "none" : "3px 3px 0 rgba(0,0,0,0.85)",
            letterSpacing: "0.04em",
          }}
        >
          {loadingPkgs
            ? "Loading plans…"
            : status === "pending"
              ? "Opening checkout…"
              : status === "restoring"
                ? "Restoring…"
                : selected === "monthly"
                  ? `UNLOCK MONTHLY – ${selectedPrice} ›`
                  : selected === "yearly"
                    ? `UNLOCK YEARLY – ${selectedPrice} ›`
                    : `UNLOCK FOREVER – ${selectedPrice} ›`}
        </button>

        {/* Restore + Maybe Later */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={handleRestore}
            disabled={ctaBusy || loadingPkgs}
            className="text-xs font-bold text-black/40 underline underline-offset-2
                       hover:text-black/60 transition-colors disabled:opacity-40"
          >
            Restore Purchases
          </button>
          <span className="text-black/20 text-xs">·</span>
          <button
            onClick={onClose}
            className="text-xs font-bold text-black/40 hover:text-black/60 transition-colors"
          >
            Maybe Later
          </button>
        </div>

        {/* Legal links — required by Apple */}
        <div className="flex items-center justify-center gap-3 pb-1">
          <a
            href={PRIVACY_POLICY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-medium text-black/35 underline underline-offset-2
                       hover:text-black/55 transition-colors"
          >
            Privacy Policy
          </a>
          <span className="text-black/20 text-[10px]">·</span>
          <a
            href={TERMS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-medium text-black/35 underline underline-offset-2
                       hover:text-black/55 transition-colors"
          >
            Terms of Use
          </a>
        </div>
      </div>
    </motion.div>
  );
}
