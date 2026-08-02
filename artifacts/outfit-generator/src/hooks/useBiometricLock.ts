/**
 * useBiometricLock
 *
 * Manages the biometric app-lock setting.
 *   - Reads/writes localStorage key `mdc_biometric_lock`
 *   - Wraps capacitor-native-biometric for Face ID / Touch ID prompts
 *   - enableLock / disableLock each require a successful auth first
 */
import { useState, useCallback, useEffect } from "react";
import { NativeBiometric, BiometryType } from "capacitor-native-biometric";

const STORAGE_KEY = "mdc_biometric_lock";

export type BiometricLock = {
  isEnabled: boolean;
  isAvailable: boolean;
  biometryType: BiometryType;
  lockLabel: string;
  /** Prompt biometric auth. Returns true on success. */
  authenticate: (reason: string) => Promise<boolean>;
  /** Authenticate → enable lock. Returns true if enabled. */
  enableLock: () => Promise<boolean>;
  /** Authenticate → disable lock. Returns true if disabled. */
  disableLock: () => Promise<boolean>;
};

function labelFor(type: BiometryType): string {
  if (type === BiometryType.FACE_ID) return "Face ID";
  if (type === BiometryType.TOUCH_ID) return "Touch ID";
  if (type === BiometryType.FINGERPRINT) return "Fingerprint";
  return "Biometrics";
}

export function useBiometricLock(): BiometricLock {
  const [isEnabled, setIsEnabled] = useState(
    () => localStorage.getItem(STORAGE_KEY) === "1"
  );
  const [isAvailable, setIsAvailable] = useState(false);
  const [biometryType, setBiometryType] = useState<BiometryType>(BiometryType.NONE);

  // Check hardware availability once on mount
  useEffect(() => {
    NativeBiometric.isAvailable({ useFallback: false })
      .then(({ isAvailable: avail, biometryType: type }) => {
        setIsAvailable(avail);
        setBiometryType(type);
      })
      .catch(() => {
        // Not available on web / simulator without biometrics enrolled
        setIsAvailable(false);
      });
  }, []);

  const authenticate = useCallback(async (reason: string): Promise<boolean> => {
    try {
      await NativeBiometric.verifyIdentity({
        reason,
        title: "My Digital Closet",
        useFallback: false,
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  const enableLock = useCallback(async (): Promise<boolean> => {
    const ok = await authenticate(`Enable ${labelFor(biometryType)} lock`);
    if (ok) {
      localStorage.setItem(STORAGE_KEY, "1");
      setIsEnabled(true);
    }
    return ok;
  }, [authenticate, biometryType]);

  const disableLock = useCallback(async (): Promise<boolean> => {
    const ok = await authenticate(`Confirm to turn off ${labelFor(biometryType)} lock`);
    if (ok) {
      localStorage.setItem(STORAGE_KEY, "0");
      setIsEnabled(false);
    }
    return ok;
  }, [authenticate, biometryType]);

  return {
    isEnabled,
    isAvailable,
    biometryType,
    lockLabel: labelFor(biometryType),
    authenticate,
    enableLock,
    disableLock,
  };
}
