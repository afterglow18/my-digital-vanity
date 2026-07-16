/**
 * BiometricLockScreen — full-screen overlay shown when the app is locked.
 * Matches the app's blush/rose brand palette.
 */

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { useBiometricLock } from "@/lib/biometricLock";

export function BiometricLockScreen() {
  const { tryUnlock } = useBiometricLock();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleTryAgain = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const ok = await tryUnlock();
    if (!ok) setFailed(true);
    setBusy(false);
  }, [busy, tryUnlock]);

  // Auto-prompt as soon as the lock screen appears (normal iOS behaviour)
  useEffect(() => {
    handleTryAgain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally only on mount

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(160deg, #F4D6DD 0%, #E8B0B8 60%, #D0909A 100%)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      {/* Lock icon */}
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: "spring", damping: 18, stiffness: 260 }}
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.35)",
          border: "2.5px solid rgba(255,255,255,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 24,
          boxShadow: "0 8px 32px rgba(160,80,100,0.25)",
        }}
      >
        <Lock style={{ width: 36, height: 36, color: "#fff", strokeWidth: 2 }} />
      </motion.div>

      {/* App name */}
      <motion.h1
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15 }}
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 26,
          fontWeight: 900,
          letterSpacing: "-0.02em",
          color: "#fff",
          textTransform: "uppercase",
          marginBottom: 6,
          textShadow: "0 2px 8px rgba(0,0,0,0.15)",
        }}
      >
        My Digital Vanity
      </motion.h1>

      <motion.p
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "rgba(255,255,255,0.75)",
          marginBottom: 40,
          letterSpacing: "0.04em",
        }}
      >
        {failed ? "Authentication failed" : "Locked"}
      </motion.p>

      {/* Try Again button */}
      <motion.button
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.25 }}
        onClick={handleTryAgain}
        disabled={busy}
        style={{
          padding: "14px 40px",
          borderRadius: 50,
          border: "2.5px solid rgba(255,255,255,0.8)",
          background: busy ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.9)",
          color: busy ? "rgba(200,100,120,0.5)" : "#D0909A",
          fontWeight: 900,
          fontSize: 15,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          cursor: busy ? "default" : "pointer",
          boxShadow: busy ? "none" : "0 4px 20px rgba(0,0,0,0.15)",
          transition: "all 0.2s",
          fontFamily: "var(--font-display)",
        }}
      >
        {busy ? "Authenticating…" : failed ? "Try Again" : "Unlock with Face ID"}
      </motion.button>
    </motion.div>
  );
}
