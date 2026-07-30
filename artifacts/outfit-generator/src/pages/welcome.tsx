/**
 * WelcomePage — three-phase splash screen.
 *
 * Phase 1 (hero):              Full-screen hero image + "Welcome to / MY DIGITAL VANITY"
 *                              near the bottom. Auto-advances after 2.5 s — no interaction.
 * Phase 2 (off):               Hollywood vanity mirror, unlit bulbs, branding near the
 *                              bottom, "Enter Vanity ✨" button, footer links.
 * Phase 3 (lighting → exiting): Bulbs light from top-centre outward, vanity-bg fades in,
 *                              screen dissolves → onEnter().
 *
 * Session behaviour:
 *   React state naturally provides "once per cold launch" — it resets when the
 *   app is fully killed and restarted, but persists while the app is in the
 *   background (Capacitor WKWebView stays alive), so background-return skips
 *   the splash automatically.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";

// ── Bulb layout ───────────────────────────────────────────────────────────────
function makeBulbs() {
  const list: { id: number; fx: number; fy: number }[] = [];
  let id = 0;
  const add = (fx: number, fy: number) => list.push({ id: id++, fx, fy });

  // Top — 9 bulbs
  for (let i = 0; i < 9; i++) add(0.06 + 0.88 * (i / 8), 0.024);
  // Left — 6 bulbs
  for (let i = 0; i < 6; i++) add(0.026, 0.11 + 0.76 * (i / 5));
  // Right — 6 bulbs
  for (let i = 0; i < 6; i++) add(0.974, 0.11 + 0.76 * (i / 5));
  // Bottom — 7 bulbs
  for (let i = 0; i < 7; i++) add(0.08 + 0.84 * (i / 6), 0.952);

  return list;
}

const BULBS = makeBulbs(); // 28 total

// Light-up order: nearest to top-centre fires first
const STAGGER_S = 0.035;
const LIGHT_DELAY = new Map(
  [...BULBS]
    .sort((a, b) =>
      Math.hypot(a.fx - 0.5, a.fy) - Math.hypot(b.fx - 0.5, b.fy)
    )
    .map((b, i) => [b.id, i * STAGGER_S])
);

// Total time until last bulb finishes
const LAST_DELAY_S = (BULBS.length - 1) * STAGGER_S + 0.3;

// ── Bulb component ────────────────────────────────────────────────────────────
function Bulb({
  fx, fy, lit, delay, size, cw, ch,
}: {
  fx: number; fy: number; lit: boolean; delay: number;
  size: number; cw: number; ch: number;
}) {
  return (
    <motion.div
      style={{
        position: "absolute",
        left: cw * fx,
        top: ch * fy,
        width: size,
        height: size,
        borderRadius: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 30,
        pointerEvents: "none",
        border: "2px solid",
      }}
      animate={
        lit
          ? {
              backgroundColor: "#fff9cc",
              borderColor: "#c8960a",
              boxShadow: [
                `0 0 ${size * 0.7}px ${size * 0.35}px rgba(255,246,150,0.85), 0 0 ${size * 1.8}px ${size * 0.9}px rgba(255,220,50,0.55)`,
                `0 0 ${size * 1.0}px ${size * 0.5}px rgba(255,255,200,1.0),   0 0 ${size * 2.5}px ${size * 1.2}px rgba(255,230,60,0.65)`,
                `0 0 ${size * 0.7}px ${size * 0.35}px rgba(255,246,150,0.85), 0 0 ${size * 1.8}px ${size * 0.9}px rgba(255,220,50,0.55)`,
              ],
            }
          : {
              backgroundColor: "#1c0d12",
              borderColor: "#3d1f28",
              boxShadow: "none",
            }
      }
      transition={
        lit
          ? {
              delay,
              duration: 0.28,
              ease: "easeOut",
              boxShadow: {
                delay: delay + 0.28,
                duration: 1.6,
                repeat: Infinity,
                repeatType: "mirror",
                ease: "easeInOut",
              },
            }
          : { duration: 0.12 }
      }
    />
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
interface Props { onEnter: () => void; }

type Phase = "hero" | "off" | "lighting" | "revealing" | "exiting";

export default function WelcomePage({ onEnter }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cw, setCw]     = useState(0);
  const [ch, setCh]     = useState(0);
  const [phase, setPhase] = useState<Phase>("hero");
  // heroFading: true once the hero starts fading out (at t=2 s)
  const [heroFading, setHeroFading] = useState(false);
  const calledRef = useRef(false);

  // Measure container on mount and resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => { setCw(el.clientWidth); setCh(el.clientHeight); };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Phase 1 auto-advance: start fading hero at 2 s, switch to mirror at 2.5 s
  useEffect(() => {
    const fadeTimer  = setTimeout(() => setHeroFading(true), 2000);
    const phaseTimer = setTimeout(() => setPhase("off"),    2500);
    return () => { clearTimeout(fadeTimer); clearTimeout(phaseTimer); };
  }, []);

  const finish = useCallback(() => {
    if (calledRef.current) return;
    calledRef.current = true;
    onEnter();
  }, [onEnter]);

  // Phase 3: user taps "Enter Vanity"
  const handleEnter = () => {
    if (phase !== "off") return;
    setPhase("lighting");
    setTimeout(() => setPhase("revealing"), LAST_DELAY_S * 1000);
    setTimeout(() => setPhase("exiting"),   (LAST_DELAY_S + 0.85) * 1000);
    setTimeout(finish,                       (LAST_DELAY_S + 1.5)  * 1000);
  };

  const lit       = phase === "lighting" || phase === "revealing" || phase === "exiting";
  const showImage = phase === "revealing" || phase === "exiting";
  const bulbSize  = cw > 0 ? Math.max(14, Math.round(Math.min(cw, ch) * 0.052)) : 18;

  // Branding opacity in the mirror phase:
  //   hidden while hero overlay is on top, fades out when vanity-bg reveals
  const mirrorBrandOpacity = phase === "hero" ? 0 : showImage ? 0 : 1;

  return (
    <motion.div
      animate={{ opacity: phase === "exiting" ? 0 : 1 }}
      transition={{ duration: 0.65, ease: "easeIn" }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "#08000a",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
      }}
    >
      {/* ── Inner phone-width container ── */}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100dvh",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Mirror face — dark rose, brightens when lit */}
        <motion.div
          style={{ position: "absolute", inset: 0, zIndex: 1 }}
          animate={{
            background: lit
              ? "linear-gradient(170deg, #5a0a28 0%, #200210 60%, #0e0008 100%)"
              : "linear-gradient(170deg, #280410 0%, #0e0008 60%, #050003 100%)",
          }}
          transition={{ duration: 0.9, ease: "easeInOut" }}
        />

        {/* Vanity background — fades in after bulbs light up */}
        <motion.img
          src="/vanity-bg.png"
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            zIndex: 2,
            userSelect: "none",
            pointerEvents: "none",
          }}
          animate={{ opacity: showImage ? 1 : 0 }}
          transition={{ duration: 0.9, ease: "easeIn" }}
        />

        {/* Ambient warm glow behind bulbs when lit */}
        <motion.div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 3,
            pointerEvents: "none",
          }}
          animate={{
            background: lit
              ? [
                  "radial-gradient(ellipse 80% 12% at 50% 3%, rgba(255,230,100,0.18) 0%, transparent 100%), radial-gradient(ellipse 8% 60% at 2.6% 50%, rgba(255,220,80,0.12) 0%, transparent 100%), radial-gradient(ellipse 8% 60% at 97.4% 50%, rgba(255,220,80,0.12) 0%, transparent 100%)",
                  "radial-gradient(ellipse 80% 12% at 50% 3%, rgba(255,240,120,0.26) 0%, transparent 100%), radial-gradient(ellipse 8% 60% at 2.6% 50%, rgba(255,230,90,0.18) 0%, transparent 100%), radial-gradient(ellipse 8% 60% at 97.4% 50%, rgba(255,230,90,0.18) 0%, transparent 100%)",
                  "radial-gradient(ellipse 80% 12% at 50% 3%, rgba(255,230,100,0.18) 0%, transparent 100%), radial-gradient(ellipse 8% 60% at 2.6% 50%, rgba(255,220,80,0.12) 0%, transparent 100%), radial-gradient(ellipse 8% 60% at 97.4% 50%, rgba(255,220,80,0.12) 0%, transparent 100%)",
                ]
              : "none",
          }}
          transition={
            lit
              ? { delay: LAST_DELAY_S * 0.5, duration: 1.6, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }
              : { duration: 0.2 }
          }
        />

        {/* ── Bulbs ── */}
        {cw > 0 && BULBS.map((b) => (
          <Bulb
            key={b.id}
            fx={b.fx} fy={b.fy}
            lit={lit}
            delay={LIGHT_DELAY.get(b.id) ?? 0}
            size={bulbSize}
            cw={cw} ch={ch}
          />
        ))}

        {/* ── Mirror phase branding (bottom of screen) ── */}
        <motion.div
          style={{
            position: "absolute",
            bottom: "23%",
            left: 0,
            right: 0,
            zIndex: 10,
            textAlign: "center",
            pointerEvents: "none",
            padding: "0 48px",
          }}
          animate={{ opacity: mirrorBrandOpacity }}
          transition={{ duration: 0.5 }}
        >
          {/* "Welcome to" label */}
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.26em",
              textTransform: "uppercase" as const,
              color: lit ? "rgba(255,230,180,0.65)" : "rgba(255,180,200,0.3)",
              marginBottom: 8,
              transition: "color 0.9s ease",
            }}
          >
            Welcome to
          </div>
          {/* App name */}
          <div
            style={{
              fontFamily: "var(--font-display, serif)",
              fontWeight: 900,
              fontSize: "clamp(30px, 9vw, 44px)",
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              color: lit ? "#fff8ee" : "rgba(255,210,225,0.5)",
              textShadow: lit
                ? "0 0 28px rgba(255,210,100,0.55), 0 2px 10px rgba(0,0,0,0.7)"
                : "none",
              transition: "color 0.9s ease, text-shadow 0.9s ease",
            }}
          >
            MY DIGITAL
            <br />
            VANITY
          </div>
        </motion.div>

        {/* ── "Enter Vanity" button ── */}
        <motion.div
          style={{
            position: "absolute",
            bottom: "9%",
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            zIndex: 40,
          }}
          animate={{
            opacity: phase === "off" ? 1 : 0,
            y: phase === "off" ? 0 : 10,
            pointerEvents: phase === "off" ? "auto" : "none",
          }}
          transition={{ duration: 0.25 }}
        >
          <button
            onClick={handleEnter}
            style={{
              fontFamily: "var(--font-display, sans-serif)",
              fontWeight: 800,
              fontSize: 15,
              letterSpacing: "0.03em",
              color: "#fff",
              background: "rgba(160,10,60,0.60)",
              border: "1.5px solid rgba(255,140,170,0.45)",
              borderRadius: 100,
              padding: "13px 38px",
              cursor: "pointer",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              whiteSpace: "nowrap",
              boxShadow: "0 4px 28px rgba(160,0,60,0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
            }}
          >
            Enter Vanity ✨
          </button>
        </motion.div>

        {/* ── Hero overlay (Phase 1) ─────────────────────────────────────────
            Sits above everything in the container (z-index 60).
            Fades out starting at t=2 s, phase switches to "off" at t=2.5 s.
            After fading, pointer-events are disabled so the button is tappable. */}
        <motion.div
          animate={{ opacity: heroFading ? 0 : 1 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 60,
            pointerEvents: phase === "hero" ? "auto" : "none",
          }}
        >
          {/* Hero image */}
          <img
            src="/hero-splash.jpg"
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              userSelect: "none",
              pointerEvents: "none",
            }}
          />

          {/* Dark gradient over the lower portion for readability */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.42) 32%, transparent 62%)",
              pointerEvents: "none",
            }}
          />

          {/* Hero branding — near the bottom, above the gradient */}
          <div
            style={{
              position: "absolute",
              bottom: "23%",
              left: 0,
              right: 0,
              textAlign: "center",
              padding: "0 48px",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.26em",
                textTransform: "uppercase" as const,
                color: "rgba(255,255,255,0.72)",
                marginBottom: 8,
              }}
            >
              Welcome to
            </div>
            <div
              style={{
                fontFamily: "var(--font-display, serif)",
                fontWeight: 900,
                fontSize: "clamp(30px, 9vw, 44px)",
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
                color: "#fff",
                textShadow: "0 2px 16px rgba(0,0,0,0.6)",
              }}
            >
              MY DIGITAL
              <br />
              VANITY
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Footer links — visible only in mirror phase ── */}
      <motion.div
        animate={{ opacity: phase === "off" ? 1 : 0 }}
        transition={{ duration: 0.4 }}
        style={{
          position: "fixed",
          bottom: "calc(env(safe-area-inset-bottom) + 10px)",
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          zIndex: 210,
          pointerEvents: phase === "off" ? "auto" : "none",
        }}
      >
        <a
          href="https://classy-alpaca-441.notion.site/Privacy-Policy-39682db6065380b19dedcb108d4a0ef4"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.3)", textDecoration: "none", letterSpacing: "0.02em" }}
        >
          Privacy Policy
        </a>
        <a
          href="https://app.notion.com/p/My-Digital-Closet-Support-39782db60653802a9088dcbae84c0527?source=copy_link"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.3)", textDecoration: "none", letterSpacing: "0.02em" }}
        >
          Support
        </a>
      </motion.div>
    </motion.div>
  );
}
