/**
 * PremiumSheet — mannequin-page paywall, no scrolling.
 *
 * Loads real prices from RevenueCat on mount. Shows a loading spinner
 * and a retry button if offerings cannot be fetched, so App Review
 * reviewers never see a dead "Purchases unavailable" dead-end.
 */
import React, { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { X, Loader2, RefreshCw } from "lucide-react";
import { useRCOfferings } from "@/hooks/useRCOfferings";
import { restorePurchases } from "@/lib/revenuecat";
import type { PurchaseProduct } from "@/lib/entitlements";
import type { PurchaseResult } from "@/hooks/useEntitlements";

const TERMS_URL   = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
const PRIVACY_URL = "https://app.notion.com/p/My-Digital-Collection-Privacy-Policy-39682db6065380b19dedcb108d4a0ef4?source=copy_link";

function openUrl(url: string) {
  window.open(url, "_system");
}

interface Props { onClose: () => void; }

const FEATURES = [
  "Unlimited clothing items",
  "Unlimited outfits",
  "Save your entire wardrobe",
  "360° Mannequin outfit view",
  "Choose monthly, yearly or lifetime!",
] as const;

function GoldCheck() {
  return (
    <span className="flex-shrink-0 flex items-center justify-center rounded-full"
          style={{ width: 20, height: 20, background: "#F0C030" }}>
      <svg width="10" height="8" viewBox="0 0 11 9" fill="none">
        <path d="M1 4.5L4 7.5L10 1" stroke="#0a0a0a" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

type Plan = PurchaseProduct;
interface PlanMeta {
  id: Plan; label: string; period: string;
  bullets: { text: string; accent?: boolean }[];
  bestValue?: boolean;
}

const PLAN_META: PlanMeta[] = [
  {
    id: "monthly", label: "MONTHLY", period: "/month",
    bullets: [{ text: "Cancel anytime" }, { text: "Billed monthly" }],
  },
  {
    id: "annual", label: "YEARLY", period: "/year",
    bullets: [{ text: "Save 17%", accent: true }, { text: "Billed yearly" }],
  },
  {
    id: "lifetime", label: "LIFETIME", period: "one-time",
    bullets: [{ text: "Pay once" }, { text: "Yours forever" }],
    bestValue: true,
  },
];

export function PremiumSheet({ onClose }: Props) {
  const { loading, error, priceFor, retry, purchase } = useRCOfferings();
  const [status,  setStatus]  = useState<"idle" | "pending">("idle");
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan>("lifetime");
  const [restoreStatus, setRestoreStatus] = useState<"idle" | "pending" | "done" | "none">("idle");

  const activeMeta = PLAN_META.find((p) => p.id === plan)!;
  const activePrice = priceFor(plan);
  const activeCta =
    plan === "monthly"  ? `START MONTHLY – ${activePrice}` :
    plan === "annual"   ? `START YEARLY – ${activePrice}`  :
                          `UNLOCK FOREVER – ${activePrice}`;

  const handleRestore = useCallback(async () => {
    if (restoreStatus === "pending") return;
    setRestoreStatus("pending");
    const tier = await restorePurchases();
    setRestoreStatus(tier ? "done" : "none");
    if (tier) setTimeout(onClose, 800);
  }, [restoreStatus, onClose]);

  const handlePurchase = useCallback(async () => {
    if (status === "pending" || loading || !!error) return;
    setStatus("pending");
    setPurchaseError(null);
    const result: PurchaseResult = await purchase(plan);
    if (result === "success") {
      onClose();
    } else if (result === "unavailable") {
      setStatus("idle");
      setPurchaseError("Could not complete purchase. Please check your internet connection and try again.");
    } else {
      // cancelled — silent
      setStatus("idle");
    }
  }, [status, loading, error, purchase, plan, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[80] flex flex-col max-w-md mx-auto overflow-hidden"
      style={{ background: "#F8F4ED" }}
    >
      {/* ── Floating close button ── */}
      <button onClick={onClose}
              className="absolute z-10 top-0 right-4 w-8 h-8 rounded-full bg-white/90
                         flex items-center justify-center shadow active:opacity-70 transition-opacity"
              style={{ marginTop: "max(10px, env(safe-area-inset-top))" }}>
        <X className="w-3.5 h-3.5 text-black" />
      </button>

      {/* ── Body ── */}
      <div className="flex-1 min-h-0 flex flex-col px-4 pb-1 gap-2"
           style={{ paddingTop: "max(3rem, calc(env(safe-area-inset-top) + 2rem))" }}>

        {/* Headline */}
        <div className="flex-shrink-0">
          <h1 className="font-display font-black uppercase leading-none tracking-tight"
              style={{ fontSize: "clamp(1.55rem, 7.5vw, 2.1rem)", color: "#0a0a0a" }}>
            Unlock Your Unlimited<br />Digital Closet
          </h1>
          <p className="text-xs text-black/45 font-semibold mt-1">
            A premium feature — unlock it once.
          </p>
        </div>

        {/* Dark features card */}
        <div className="flex-1 min-h-0 rounded-2xl overflow-hidden flex flex-col"
             style={{ background: "#0a0a0a" }}>
          <div className="px-4 pt-3 pb-2 flex-shrink-0">
            <p className="font-bold text-[10px] tracking-widest uppercase"
               style={{ color: "#F0C030" }}>
              Upgrade to Premium &amp; Get:
            </p>
          </div>
          <div className="flex-shrink-0" style={{ height: 1, background: "rgba(255,255,255,0.1)" }} />
          <ul className="flex-1 flex flex-col justify-evenly px-4 py-1">
            {FEATURES.map((text, i) => (
              <React.Fragment key={text}>
                <li className="flex items-center gap-3 py-0.5">
                  <GoldCheck />
                  <span className="text-white font-semibold text-[13px] leading-snug">{text}</span>
                </li>
                {i < FEATURES.length - 1 && (
                  <div style={{ height: 1, background: "rgba(255,255,255,0.07)", marginLeft: 32 }} />
                )}
              </React.Fragment>
            ))}
          </ul>
        </div>

        {/* Plan label */}
        <p className="flex-shrink-0 text-center text-[10px] font-black tracking-widest uppercase text-black/45">
          Choose Your Plan
        </p>

        {/* ── Plan cards — loading / error / ready ── */}
        {loading ? (
          <div className="flex-shrink-0 flex items-center justify-center py-6 gap-2 text-black/40">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs font-semibold">Loading plans…</span>
          </div>
        ) : error ? (
          <div className="flex-shrink-0 flex flex-col items-center gap-2 py-4">
            <p className="text-xs text-red-600 text-center font-medium px-4">
              Could not load plans. Please check your connection.
            </p>
            <button onClick={retry}
                    className="flex items-center gap-1.5 text-xs font-bold text-black/60
                               border border-black/20 rounded-lg px-3 py-1.5 active:opacity-70">
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        ) : (
          <div className="flex-shrink-0 flex gap-2">
            {PLAN_META.map((p) => {
              const selected   = plan === p.id;
              const isLifetime = p.id === "lifetime";
              const price      = priceFor(p.id);
              return (
                <button key={p.id} onClick={() => setPlan(p.id)}
                        className="flex-1 rounded-xl flex flex-col relative overflow-hidden text-left transition-all"
                        style={{
                          background:  isLifetime ? "#F0C030" : "#fff",
                          border:      `2px solid ${selected ? "#0a0a0a" : "rgba(0,0,0,0.12)"}`,
                          boxShadow:   selected ? "3px 3px 0 rgba(0,0,0,0.85)" : "none",
                          padding:     "8px 7px 8px",
                        }}>
                  {p.bestValue && (
                    <span className="absolute top-0 right-0 font-black text-white text-[7px]
                                     uppercase tracking-tight leading-tight px-1.5 py-1
                                     rounded-bl-xl rounded-tr-xl"
                          style={{ background: "#E0345A" }}>
                      BEST ★{"\n"}VALUE
                    </span>
                  )}
                  <span className="font-black text-[8px] tracking-widest uppercase block mb-0.5"
                        style={{ color: isLifetime ? "#0a0a0a" : "rgba(0,0,0,0.4)" }}>
                    {p.label}
                  </span>
                  <span className="font-black leading-none block"
                        style={{ fontSize: "clamp(1.15rem, 5.5vw, 1.4rem)", color: "#0a0a0a" }}>
                    {price}
                  </span>
                  <span className="text-[9px] font-semibold block mb-1.5"
                        style={{ color: isLifetime ? "#0a0a0a" : "rgba(0,0,0,0.4)" }}>
                    {p.period}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    {p.bullets.map((b) => (
                      <div key={b.text} className="flex items-center gap-1">
                        <span className="flex-shrink-0 rounded-full flex items-center justify-center"
                              style={{ width: 12, height: 12,
                                       background: isLifetime ? "rgba(0,0,0,0.18)" : "#F0C030" }}>
                          <svg width="6" height="5" viewBox="0 0 7 6" fill="none">
                            <path d="M1 3L2.8 5L6 1"
                                  stroke={isLifetime ? "#fff" : "#0a0a0a"}
                                  strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                        <span className="text-[8px] font-bold leading-tight"
                              style={{ color: b.accent ? "#D07010" : (isLifetime ? "#0a0a0a" : "rgba(0,0,0,0.5)") }}>
                          {b.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        )}

      </div>

      {/* ── CTA footer ── */}
      <div className="flex-shrink-0 px-4 pt-2 flex flex-col gap-1.5"
           style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
        <button onClick={handlePurchase}
                disabled={status === "pending" || loading || !!error}
                className="w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-tight
                           border-4 border-black text-black flex items-center justify-center gap-2
                           active:translate-x-0.5 active:translate-y-0.5 transition-all
                           disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background:    "#F0C030",
                  boxShadow:     (status === "pending" || loading || !!error) ? "none" : "4px 4px 0px rgba(0,0,0,1)",
                  letterSpacing: "0.03em",
                }}>
          {status === "pending" ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Opening checkout…</>
          ) : loading ? (
            "Loading plans…"
          ) : error ? (
            "Plans unavailable"
          ) : (
            <>{activeCta} <span className="text-lg leading-none">›</span></>
          )}
        </button>
        {purchaseError && (
          <p className="text-xs text-red-600 text-center font-medium px-2">{purchaseError}</p>
        )}
        <button onClick={onClose}
                className="text-xs font-bold text-black/35 text-center underline underline-offset-2
                           hover:text-black/55 transition-colors py-0.5">
          Maybe Later
        </button>

        {/* Restore Purchases */}
        <button onClick={handleRestore} disabled={restoreStatus === "pending"}
                className="text-xs font-bold text-black/35 text-center underline underline-offset-2
                           hover:text-black/55 transition-colors py-0.5 disabled:opacity-50">
          {restoreStatus === "pending" ? "Restoring…" :
           restoreStatus === "done"    ? "✓ Purchases Restored" :
           restoreStatus === "none"    ? "No purchases found" :
           "Restore Purchases"}
        </button>

        {/* Legal links — required by Apple */}
        <p className="text-center leading-relaxed" style={{ fontSize: 9, color: "rgba(0,0,0,0.28)" }}>
          <button onClick={() => openUrl(TERMS_URL)}
                  className="underline underline-offset-1 active:opacity-60">
            Terms of Use
          </button>
          {" · "}
          <button onClick={() => openUrl(PRIVACY_URL)}
                  className="underline underline-offset-1 active:opacity-60">
            Privacy Policy
          </button>
        </p>
      </div>
    </motion.div>
  );
}
