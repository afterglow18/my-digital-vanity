/**
 * SplashScreen — three-phase intro on every app launch.
 * 1. Hero image (auto-advances after 2.5 s)
 * 2. Yellow doors + "Enter Closet" button
 * 3. Doors swing open → wardrobe
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  onEnter: () => void;
}

type Phase = "hero" | "doors" | "opening";

export default function SplashScreen({ onEnter }: Props) {
  const [phase, setPhase] = useState<Phase>("hero");

  // Auto-advance from hero → doors after 2.5 s
  useEffect(() => {
    const t = setTimeout(() => setPhase("doors"), 2500);
    return () => clearTimeout(t);
  }, []);

  const handleEnter = () => {
    setPhase("opening");
    setTimeout(onEnter, 750);
  };

  return (
    <div className="fixed inset-0 z-[200] overflow-hidden" style={{ background: "#F0C030" }}>

      {/* ── Phase 1: Hero image ── */}
      <AnimatePresence>
        {phase === "hero" && (
          <motion.div
            key="hero"
            className="absolute inset-0 z-30"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
          >
            <img
              src="/hero-closet.jpeg"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Dark gradient for text legibility */}
            <div
              className="absolute inset-x-0 bottom-0"
              style={{
                height: "45%",
                background: "linear-gradient(to bottom, transparent, rgba(0,0,0,0.70))",
                pointerEvents: "none",
              }}
            />
            {/* Branding */}
            <div
              className="absolute inset-x-0 bottom-0 flex flex-col items-center"
              style={{ paddingBottom: "max(4rem, env(safe-area-inset-bottom))" }}
            >
              <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1">
                Welcome to
              </p>
              <h1
                className="font-display font-black uppercase text-white leading-none text-center"
                style={{
                  fontSize: "clamp(2rem, 9vw, 3rem)",
                  textShadow: "0 2px 12px rgba(0,0,0,0.5)",
                }}
              >
                My Digital<br />Closet
              </h1>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Closet interior behind the doors (phases 2 & 3) ── */}
      <img
        src="/closet-bg.png"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* ── Left door ── */}
      <motion.div
        className="absolute inset-y-0 left-0 w-1/2"
        animate={phase === "opening" ? { x: "-100%" } : { x: 0 }}
        transition={{ duration: 0.65, ease: [0.4, 0, 0.2, 1] }}
        style={{ background: "#F0C030", transformOrigin: "left center", zIndex: 10 }}
      >
        <div className="absolute inset-4 border-4 border-yellow-500/30 rounded-lg" />
        <div
          className="absolute top-1/2 right-3 -translate-y-1/2 w-3 h-10 rounded-full"
          style={{ background: "#C49B2A", boxShadow: "inset -1px 0 2px rgba(0,0,0,0.3)" }}
        />
        <div className="absolute left-2 top-1/4 w-2 h-4 rounded-sm" style={{ background: "#C49B2A" }} />
        <div className="absolute left-2 top-3/4 w-2 h-4 rounded-sm" style={{ background: "#C49B2A" }} />
      </motion.div>

      {/* ── Right door ── */}
      <motion.div
        className="absolute inset-y-0 right-0 w-1/2"
        animate={phase === "opening" ? { x: "100%" } : { x: 0 }}
        transition={{ duration: 0.65, ease: [0.4, 0, 0.2, 1] }}
        style={{ background: "#F0C030", transformOrigin: "right center", zIndex: 10 }}
      >
        <div className="absolute inset-4 border-4 border-yellow-500/30 rounded-lg" />
        <div
          className="absolute top-1/2 left-3 -translate-y-1/2 w-3 h-10 rounded-full"
          style={{ background: "#C49B2A", boxShadow: "inset 1px 0 2px rgba(0,0,0,0.3)" }}
        />
        <div className="absolute right-2 top-1/4 w-2 h-4 rounded-sm" style={{ background: "#C49B2A" }} />
        <div className="absolute right-2 top-3/4 w-2 h-4 rounded-sm" style={{ background: "#C49B2A" }} />
      </motion.div>

      {/* ── Doors UI: branding + Enter button (phase "doors" only) ── */}
      <AnimatePresence>
        {phase === "doors" && (
          <motion.div
            key="ui"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-end"
            style={{ paddingBottom: "max(3rem, env(safe-area-inset-bottom))" }}
          >
            <div
              className="absolute inset-x-0 bottom-0"
              style={{
                height: "50%",
                background: "linear-gradient(to bottom, transparent, rgba(0,0,0,0.65))",
                pointerEvents: "none",
              }}
            />

            <div className="relative flex flex-col items-center gap-5 w-full px-8">
              <div className="text-center">
                <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1">
                  Welcome to
                </p>
                <h1
                  className="font-display font-black uppercase text-white leading-none"
                  style={{
                    fontSize: "clamp(2rem, 9vw, 3rem)",
                    textShadow: "0 2px 12px rgba(0,0,0,0.4)",
                  }}
                >
                  My Digital<br />Closet
                </h1>
              </div>

              <motion.button
                onClick={handleEnter}
                whileTap={{ scale: 0.97 }}
                className="w-full py-4 rounded-2xl border-2 border-black font-display font-black
                           uppercase tracking-tight text-black text-lg
                           shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                style={{ background: "#F0C030" }}
              >
                Enter Closet ✨
              </motion.button>

              <div className="flex items-center gap-4">
                <button
                  onClick={() => window.open("https://app.notion.com/p/My-Digital-Collection-Privacy-Policy-39682db6065380b19dedcb108d4a0ef4?source=copy_link", "_system")}
                  className="text-white/60 text-xs font-medium bg-transparent border-none cursor-pointer p-0"
                >
                  Privacy Policy
                </button>
                <span className="text-white/30 text-xs">•</span>
                <button
                  onClick={() => window.open("https://app.notion.com/p/My-Digital-Collection-Support-39782db60653802a9088dcbae84c0527", "_system")}
                  className="text-white/60 text-xs font-medium bg-transparent border-none cursor-pointer p-0"
                >
                  Support
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
