/**
 * backgroundRemoval.ts
 *
 * On-device background removal via @imgly/background-removal (JS/WASM).
 * Works in WKWebView (Capacitor iOS), regular browsers, and Android.
 * No native plugins, no CocoaPods, no iOS-version gating.
 *
 * The ONNX model (~15 MB) downloads once from the imgly CDN on first use,
 * then is cached permanently by the browser / WKWebView cache.
 */
import { removeBackground as imglyRemoveBackground } from "@imgly/background-removal";
// onnxruntime-web is a peer dependency shared with @imgly/background-removal.
// The TS error below is a known package.json exports issue in ort 1.x; the
// import still resolves and affects the same singleton used by the imgly library.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import * as ort from "onnxruntime-web";

// Force WASM inference into a proxy worker so the main thread stays free for
// UI events (button taps, Cancel) while removal runs. Without this, the 2-5s
// WASM inference blocks all JS, making every button appear unresponsive.
// The imgly library only sets proxy=true when device="gpu"; we set it here
// for the default WASM path so it applies on every platform.
(ort as { env: { wasm: { proxy: boolean } } }).env.wasm.proxy = true;

export type RemovalProgress =
  | { stage: "loading"; pct: number }
  | { stage: "inferring" }
  | { stage: "done" };

/** Always true — JS/WASM works on every platform. */
export async function isBackgroundRemovalSupported(): Promise<boolean> {
  return true;
}

/**
 * Remove the background from a JPEG/PNG data-URL.
 * Returns a PNG data-URL with a transparent background.
 * Throws only on network error (first model download) or unreadable image.
 *
 * Progress stages:
 *  - "loading"   — model files are downloading (pct = 0–99). On cache hits this
 *                  completes instantly and callers will never see it.
 *  - "inferring" — all model files are resident; ONNX is running inference.
 *  - "done"      — result blob is ready.
 */
export async function removeBackground(
  dataUrl: string,
  onProgress?: (p: RemovalProgress) => void,
): Promise<string> {
  onProgress?.({ stage: "loading", pct: 0 });
  const sourceBlob = await dataUrlToBlob(dataUrl);

  // Per-key byte tracking so we can compute an accurate overall download %.
  // The imgly library calls progress(key, current, total) for each model file
  // it fetches. On a warm cache the callback fires immediately with
  // current === total for every key, so the inferred stage is entered at once.
  const keyTotals: Record<string, number> = {};
  const keyLoaded: Record<string, number> = {};
  let emittedInferring = false;

  const resultBlob = await imglyRemoveBackground(sourceBlob, {
    // isnet_fp16 = half-precision model — good balance of quality and speed.
    // Valid values: "isnet" | "isnet_fp16" | "isnet_quint8"
    model: "isnet_fp16",
    output: {
      format: "image/png",
      quality: 0.9,
    },
    // publicPath omitted — defaults to the static imgly CDN, which WKWebView
    // can reach. To self-host, copy files from
    // node_modules/@imgly/background-removal/dist/ to public/bgremoval/ and
    // set publicPath: import.meta.env.BASE_URL + "bgremoval/"
    progress: onProgress
      ? (key: string, current: number, total: number) => {
          if (total <= 0) return;
          keyTotals[key] = total;
          keyLoaded[key] = current;
          const totalBytes  = Object.values(keyTotals).reduce((a, b) => a + b, 0);
          const loadedBytes = Object.values(keyLoaded).reduce((a, b) => a + b, 0);
          const pct = Math.min(99, Math.round((loadedBytes / totalBytes) * 100));
          if (pct >= 99 && !emittedInferring) {
            emittedInferring = true;
            onProgress({ stage: "inferring" });
          } else if (!emittedInferring) {
            onProgress({ stage: "loading", pct });
          }
        }
      : undefined,
  });

  onProgress?.({ stage: "done" });
  return blobToDataUrl(resultBlob);
}

/** Blob → base64 data-URL */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

/** base64 data-URL → Blob */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}
