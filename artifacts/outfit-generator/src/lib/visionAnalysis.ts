/**
 * visionAnalysis.ts — shared single-item vision analysis.
 *
 * Used by:
 *   • useVisionIndexer  — batch cold-start analysis
 *   • useLocalWardrobe  — inline analysis right after item creation
 *
 * Always resolves the storage key to a real URL via getImageUrl before
 * passing it to the analysis functions, matching the fix in useVisionIndexer.
 */

import { Capacitor } from '@capacitor/core';
import { getImageUrl } from '@/lib/utils';
import { extractWebVisionLabels, WEB_EMPTY_VERSION } from '@/lib/visionWeb';

/**
 * v2 — runs canvas color extraction in parallel with Apple Vision so iOS items
 * gain color labels ("pink", "gold") alongside object labels ("shoe", "bottle").
 * Bump this whenever the native analysis logic changes; needsIndexing in the
 * batch indexer uses `v < NATIVE_VISION_VERSION` so old items are automatically
 * re-processed on next launch.
 */

export interface VisionResult {
  visionLabels: string[];
  visionText: string[];
  visionVersion: number;
}

export const NATIVE_VISION_VERSION = 2;

/** Fetch a URL and return its contents as a raw base64 string (no data-URL prefix). */
async function fetchAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.replace(/^data:[^;]+;base64,/, ''));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Call the native VisionPlugin to analyse an image URL. Returns empty on any error. */
async function analyzeNative(imageUrl: string): Promise<{ labels: string[]; text: string[] }> {
  try {
    const base64 = await fetchAsBase64(imageUrl);
    const { Plugins } = await import('@capacitor/core') as unknown as {
      Plugins: Record<string, unknown>;
    };
    const VisionPlugin = Plugins['Vision'] as
      | { analyzeImage: (args: { imageData: string }) => Promise<{ labels: string[]; text: string[] }> }
      | undefined;
    if (!VisionPlugin) return { labels: [], text: [] };
    return await VisionPlugin.analyzeImage({ imageData: base64 });
  } catch {
    return { labels: [], text: [] };
  }
}

/**
 * Analyze a single item's image and return the fields to persist.
 * Resolves the storage key to a real URL before analysis.
 * Never throws — returns an empty result on any failure.
 */
export async function analyzeSingleItemVision(imageObjectPath: string): Promise<VisionResult> {
  try {
    const imageUrl = getImageUrl(imageObjectPath);
    if (!imageUrl) return { visionLabels: [], visionText: [], visionVersion: WEB_EMPTY_VERSION };

    if (Capacitor.isNativePlatform()) {
      // Run Apple Vision (object/scene labels + OCR) and canvas color extraction in parallel.
      // Apple Vision never outputs color names; the canvas extractor fills that gap.
      const [nativeResult, webResult] = await Promise.all([
        analyzeNative(imageUrl),
        extractWebVisionLabels(imageUrl),
      ]);
      // Union both label sets, deduplicated. Web colors come first so they rank higher in search.
      const mergedLabels = [...new Set([...webResult.labels, ...nativeResult.labels])];
      return {
        visionLabels: mergedLabels,
        visionText:   nativeResult.text,
        visionVersion: NATIVE_VISION_VERSION,
      };
    } else {
      const { labels, version } = await extractWebVisionLabels(imageUrl);
      return { visionLabels: labels, visionText: [], visionVersion: version };
    }
  } catch {
    return { visionLabels: [], visionText: [], visionVersion: WEB_EMPTY_VERSION };
  }
}
