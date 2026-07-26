/**
 * PhotoCleanup — Capacitor plugin bridge.
 *
 * On native iOS 17+:  Vision background removal + Core Image enhancement.
 * On native iOS <17:  Core Image enhancement only (no background removal).
 * On web:             Returns the original unchanged (no Vision available).
 *
 * Photos are processed entirely on-device.
 * No network calls are made.  No API key required.
 */
import { registerPlugin, WebPlugin } from "@capacitor/core";
import type { Plugin } from "@capacitor/core";
import { Capacitor } from "@capacitor/core";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PhotoCleanupResult {
  /** Base64-encoded JPEG of the processed image (no data-URL prefix). */
  cleanedImageData: string;
  /** true if Vision framework was available (iOS 17+). */
  supported: boolean;
  /** true if a foreground subject was detected and isolated. */
  hadSubject: boolean;
}

export interface PhotoCleanupPlugin extends Plugin {
  processPhoto(options: { imageData: string }): Promise<PhotoCleanupResult>;
}

// ── Web stub ───────────────────────────────────────────────────────────────────

class PhotoCleanupWeb extends WebPlugin implements PhotoCleanupPlugin {
  async processPhoto(
    _options: { imageData: string },
  ): Promise<PhotoCleanupResult> {
    // Vision is not available in the browser.  Return the original unchanged.
    return {
      cleanedImageData: _options.imageData,
      supported:        false,
      hadSubject:       false,
    };
  }
}

// ── Plugin registration ────────────────────────────────────────────────────────

export const PhotoCleanup = registerPlugin<PhotoCleanupPlugin>("PhotoCleanup", {
  web: () => new PhotoCleanupWeb(),
});

// ── Convenience helper ─────────────────────────────────────────────────────────

/**
 * Resize a Blob to at most `maxPx` on the longest edge, encode to JPEG,
 * and return the raw base64 string (no data-URL prefix).
 * This keeps the Vision input at a manageable size while preserving quality.
 */
export async function blobToBase64(blob: Blob, maxPx = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale  = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.naturalWidth  * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext("2d")!;
      // Fill white before drawing so transparent PNGs (already-cleaned photos)
      // don't produce a black-background JPEG that confuses the Vision framework.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      resolve(dataUrl.split(",")[1]); // strip "data:image/jpeg;base64,"
    };
    img.onerror = reject;
    img.src = url;
  });
}

/** Returns true when the PhotoCleanup plugin can run (native iOS only). */
export function isPhotoCleanupAvailable(): boolean {
  return Capacitor.isNativePlatform();
}
