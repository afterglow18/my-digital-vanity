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
 */
export async function removeBackground(
  dataUrl: string,
  onProgress?: (p: RemovalProgress) => void,
): Promise<string> {
  onProgress?.({ stage: "loading", pct: 0 });
  const sourceBlob = await dataUrlToBlob(dataUrl);
  onProgress?.({ stage: "inferring" });
  const resultBlob = await imglyRemoveBackground(sourceBlob, {
    // isnet_fp16 = half-precision model — good balance of quality and speed.
    // Valid values: "isnet" | "isnet_fp16" | "isnet_quint8"
    model: "isnet_fp16",
    output: {
      format: "image/png",
      quality: 0.9,
    },
    // publicPath omitted — defaults to the staticimgly CDN, which WKWebView
    // can reach. To self-host, copy files from
    // node_modules/@imgly/background-removal/dist/ to public/bgremoval/ and
    // set publicPath: import.meta.env.BASE_URL + "bgremoval/"
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
