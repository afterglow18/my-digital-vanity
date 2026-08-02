/**
 * backgroundRemoval.ts
 *
 * On-device background removal powered by @imgly/background-removal —
 * a pure JS/WebAssembly library that runs inside WKWebView (Capacitor iOS)
 * with no native plugins, no CocoaPods, and no native registration required.
 *
 * How it works:
 *  • On first use the library downloads ONNX model + WASM runtime from the
 *    imgly CDN (~15 MB for "medium" quality). WKWebView caches them between
 *    app launches, so subsequent uses are instant.
 *  • Inference runs fully on-device — photos never leave the user's phone.
 *  • Falls back gracefully to the original image if anything fails.
 *
 * Works on: iOS 15+ (WKWebView), Android, and regular browsers.
 */

import { removeBackground as imglyRemoveBackground } from "@imgly/background-removal";

// ── ONNX Runtime configuration ────────────────────────────────────────────────
//
// Problem: @imgly/background-removal runs ONNX inference on the main JS thread
// by default, freezing the entire UI (no taps, no React updates) for several
// seconds. ONNX Runtime Web has a wasm.proxy = true flag that moves inference
// into a sub-worker — but imgly unconditionally resets it to false internally
// right before creating the session (it only enables the proxy for WebGPU,
// which iOS Safari/WKWebView doesn't have).
//
// Fix (three parts):
//  1. Object.defineProperty with a no-op setter so imgly's `proxy = false`
//     write is silently swallowed and the value stays true.
//  2. numThreads = 1 — iOS Safari has no SharedArrayBuffer, so WASM
//     multi-threading causes a silent crash.
//  3. Dynamic import() so onnxruntime-web is never parsed at module load time,
//     which would trigger Vite pre-bundling mid-session and reload the page.

let ortConfigured = false;

async function configureOrt(): Promise<void> {
  if (ortConfigured) return;
  ortConfigured = true;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — onnxruntime-web types aren't resolved via dynamic import
  const ort = await import("onnxruntime-web");
  Object.defineProperty(ort.env.wasm, "proxy", {
    get: () => true,
    set: () => {},   // blocks imgly from resetting it to false
    configurable: true,
  });
  ort.env.wasm.numThreads = 1; // iOS Safari: no SharedArrayBuffer → must be 1
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type RemovalProgress =
  | { stage: "loading"; pct: number }   // downloading model / WASM
  | { stage: "inferring" }              // running the segmentation model
  | { stage: "done" };

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Always returns true — the JS library works on every platform.
 * Kept for API compatibility with the old native-plugin version.
 */
export async function isBackgroundRemovalSupported(): Promise<boolean> {
  return true;
}

/**
 * Returns an empty string (no error) — kept for API compatibility.
 */
export async function getBackgroundRemovalError(): Promise<string> {
  return "";
}

/**
 * Remove the background from a JPEG/PNG data-URL.
 * Returns a PNG data-URL with a transparent background.
 *
 * Throws only if the library itself throws (network error on first load,
 * or a completely unreadable image). QuickAddSheet catches and falls back.
 *
 * @param dataUrl   Base64 data-URL of the source image
 * @param onProgress Optional progress callback
 */
export async function removeBackground(
  dataUrl: string,
  onProgress?: (p: RemovalProgress) => void,
): Promise<string> {
  // Configure ONNX Runtime once before first inference (proxy + threads).
  // Must happen before imglyRemoveBackground creates its session.
  await configureOrt();

  onProgress?.({ stage: "loading", pct: 0 });

  // Convert data-URL to Blob — the library accepts Blob directly
  const sourceBlob = await dataUrlToBlob(dataUrl);

  onProgress?.({ stage: "inferring" });

  // imgly library: returns a Blob with transparent PNG
  const resultBlob = await imglyRemoveBackground(sourceBlob, {
    // Use the imgly CDN for ONNX model + WASM runtime.
    // WKWebView caches these between launches so first-load is ~15 MB once.
    // The default CDN is used when publicPath is omitted in v1.7.
    model: "isnet_fp16",
    output: {
      format: "image/png",
      quality: 0.9,
    },
  });

  onProgress?.({ stage: "done" });

  return blobToDataUrl(resultBlob);
}

// ── Helpers shared with QuickAddSheet ─────────────────────────────────────────

/** Convert a Blob to a base64 data-URL string. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

/** Convert a data-URL string back to a Blob (e.g. to pass to saveImage). */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}
