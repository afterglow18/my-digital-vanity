/**
 * Biometric app-lock — Context, Provider, and hook.
 *
 * • Setting stored in localStorage under STORAGE_KEY.
 * • On native: delegates to @aparajita/capacitor-biometric-auth.
 * • On web (dev): auth always succeeds so the UI stays testable.
 * • Re-locks whenever the app returns from the background.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Capacitor } from "@capacitor/core";

const STORAGE_KEY = "biometric_lock_enabled";

// ── Auth helper (native only) ─────────────────────────────────────────────────

async function doAuthenticate(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true; // dev / web — always pass

  try {
    const { BiometricAuth } = await import(
      "@aparajita/capacitor-biometric-auth"
    );
    await BiometricAuth.authenticate({
      reason: "Unlock My Digital Vanity",
      cancelTitle: "Cancel",
      allowDeviceCredential: false,
      iosFallbackTitle: "",
    });
    return true;
  } catch {
    return false;
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

interface BiometricLockCtx {
  isLockEnabled: boolean;
  isLocked: boolean;
  enableLock: () => Promise<boolean>;
  disableLock: () => Promise<boolean>;
  tryUnlock: () => Promise<boolean>;
}

const Ctx = createContext<BiometricLockCtx | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function BiometricLockProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read persisted setting once on mount.
  // For a brand-new install localStorage returns null → enabled = false → locked = false.
  // Biometric prompts will NEVER appear until the user explicitly enables the toggle.
  const storedEnabled = localStorage.getItem(STORAGE_KEY) === "true";
  const [isLockEnabled, setIsLockEnabled] = useState<boolean>(storedEnabled);
  const [isLocked,      setIsLocked]      = useState<boolean>(storedEnabled);
  const wasActive = useRef(true);

  // Re-lock on foreground return — only when the setting is actually on
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let handle: { remove: () => void } | undefined;

    import("@capacitor/app").then(({ App: CapApp }) => {
      CapApp.addListener("appStateChange", ({ isActive }) => {
        if (!isActive) {
          wasActive.current = false;
        } else if (!wasActive.current) {
          wasActive.current = true;
          // Guard against stale closure: re-read localStorage as source of truth
          if (localStorage.getItem(STORAGE_KEY) === "true") {
            setIsLocked(true);
          }
        }
      }).then((h) => {
        handle = h;
      });
    });

    return () => {
      handle?.remove();
    };
  }, []);

  const enableLock = useCallback(async () => {
    const ok = await doAuthenticate();
    if (ok) {
      localStorage.setItem(STORAGE_KEY, "true");
      setIsLockEnabled(true);
    }
    return ok;
  }, []);

  const disableLock = useCallback(async () => {
    const ok = await doAuthenticate();
    if (ok) {
      localStorage.removeItem(STORAGE_KEY);
      setIsLockEnabled(false);
    }
    return ok;
  }, []);

  const tryUnlock = useCallback(async () => {
    const ok = await doAuthenticate();
    if (ok) setIsLocked(false);
    return ok;
  }, []);

  return (
    <Ctx.Provider value={{ isLockEnabled, isLocked, enableLock, disableLock, tryUnlock }}>
      {children}
    </Ctx.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useBiometricLock(): BiometricLockCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBiometricLock must be inside BiometricLockProvider");
  return ctx;
}
