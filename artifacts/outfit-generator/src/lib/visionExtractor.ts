/**
 * visionExtractor.ts
 * Web: dominant-color extraction via canvas (48×48 downscale).
 * iOS: native VisionPlugin (VNClassifyImageRequest + VNRecognizeTextRequest)
 *      PLUS canvas color extraction run in parallel so colors appear in search.
 *
 * Version scheme:
 *   0 = unanalyzed
 *   1 = iOS Vision only (no colors) — legacy, will be re-indexed
 *   2 = iOS Vision + canvas colors merged
 *   4 = web canvas analyzed, labels found
 *   5 = web analyzed, no labels found (skip retry)
 */

import { registerPlugin, Capacitor } from '@capacitor/core';

export const VISION_VERSION_IOS       = 2;   // bumped: now includes canvas colors
export const VISION_VERSION_WEB       = 4;
export const VISION_VERSION_WEB_EMPTY = 5;

// ── iOS native plugin registration ───────────────────────────────────────────

interface VisionPluginInterface {
  analyzeImage(options: { url: string }): Promise<{ labels: string[]; text: string[] }>;
}

const NativeVision = registerPlugin<VisionPluginInterface>('VisionPlugin');

// ── Web canvas color extraction ───────────────────────────────────────────────

type ColorRule = { name: string; test: (r: number, g: number, b: number) => boolean };

const COLOR_RULES: ColorRule[] = [
  { name: 'black',      test: (r,g,b) => (r+g+b)/3 < 80 },
  { name: 'dark grey',  test: (r,g,b) => (r+g+b)/3 < 110 && Math.max(r,g,b)-Math.min(r,g,b) < 30 },
  { name: 'grey',       test: (r,g,b) => (r+g+b)/3 < 175 && Math.max(r,g,b)-Math.min(r,g,b) < 30 },
  { name: 'light grey', test: (r,g,b) => (r+g+b)/3 < 225 && Math.max(r,g,b)-Math.min(r,g,b) < 30 },
  { name: 'white',      test: (r,g,b) => (r+g+b)/3 >= 225 },
  { name: 'beige',      test: (r,g,b) => r > 200 && g > 175 && b > 140 && r > g && g > b },
  { name: 'tan',        test: (r,g,b) => r > 160 && g > 120 && b < 100 && r > g && g > b },
  { name: 'brown',      test: (r,g,b) => r > 100 && r > g*1.4 && g > b },
  { name: 'red',        test: (r,g,b) => r > 150 && r > g*1.5 && r > b*1.5 },
  { name: 'orange',     test: (r,g,b) => r > 180 && g > 80 && g < 160 && b < 80 },
  { name: 'yellow',     test: (r,g,b) => r > 180 && g > 160 && b < 80 },
  { name: 'green',      test: (r,g,b) => g > r && g > b && g > 80 },
  { name: 'teal',       test: (r,g,b) => g > r*1.1 && b > r*1.1 && g > 80 && b > 80 },
  { name: 'blue',       test: (r,g,b) => b > r && b > g && b > 80 },
  { name: 'purple',     test: (r,g,b) => r > 80 && b > 80 && r > g && b > g },
  { name: 'pink',       test: (r,g,b) => r > 180 && b > 120 && r > g && b > g * 0.8 },
];

function classifyPixel(r: number, g: number, b: number): string {
  for (const { name, test } of COLOR_RULES) {
    if (test(r, g, b)) return name;
  }
  return '';
}

/**
 * Extract dominant foreground colors from a URL using a 48×48 canvas.
 * Corner pixels are sampled to estimate studio background and excluded.
 * Only colors covering ≥10% of foreground pixels are returned.
 */
export async function extractColorsFromUrl(url: string): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const SIZE = 48;
        const PATCH = 4;
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve([]); return; }
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

        // Estimate background from 4×4 corner patches
        const corners = [[0,0],[SIZE-PATCH,0],[0,SIZE-PATCH],[SIZE-PATCH,SIZE-PATCH]];
        let bgR = 0, bgG = 0, bgB = 0, bgN = 0;
        for (const [px, py] of corners) {
          for (let dy = 0; dy < PATCH; dy++) {
            for (let dx = 0; dx < PATCH; dx++) {
              const i = ((py+dy)*SIZE + (px+dx)) * 4;
              bgR += data[i]; bgG += data[i+1]; bgB += data[i+2]; bgN++;
            }
          }
        }
        bgR /= bgN; bgG /= bgN; bgB /= bgN;
        const BG_THRESH = 30;

        const counts = new Map<string, number>();
        let fgTotal = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i+3] < 128) continue; // transparent
          const r = data[i], g = data[i+1], b = data[i+2];
          if (Math.abs(r-bgR) + Math.abs(g-bgG) + Math.abs(b-bgB) < BG_THRESH) continue;
          fgTotal++;
          const name = classifyPixel(r, g, b);
          if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
        }

        if (fgTotal === 0) { resolve([]); return; }
        const result: string[] = [];
        for (const [name, cnt] of counts) {
          if (cnt / fgTotal >= 0.10) result.push(name);
        }
        resolve(result);
      } catch { resolve([]); }
    };
    img.onerror = () => resolve([]);
    img.src = url;
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface VisionResult {
  labels: string[];
  text:   string[];
  version: number;
}

/**
 * Analyze a photo URL for labels and text.
 * On iOS: runs native Vision (object labels + OCR) AND canvas color extraction
 *         in parallel, then merges — color names appear first so the search
 *         scorer's label field includes both color and object tokens.
 * On web: runs canvas color extraction only (labels = color names, text = []).
 */
export async function analyzePhoto(url: string): Promise<VisionResult> {
  if (Capacitor.isNativePlatform()) {
    // Run both concurrently; treat failures as empty rather than crashing.
    const [nativeRes, colorsRes] = await Promise.allSettled([
      NativeVision.analyzeImage({ url }),
      extractColorsFromUrl(url),
    ]);
    const labels      = nativeRes.status  === 'fulfilled' ? (nativeRes.value.labels  ?? []) : [];
    const text        = nativeRes.status  === 'fulfilled' ? (nativeRes.value.text    ?? []) : [];
    const colorLabels = colorsRes.status  === 'fulfilled' ?  colorsRes.value                : [];
    return {
      // Colors first → search scorer sees them in the high-weight label field
      labels:  [...new Set([...colorLabels, ...labels])],
      text,
      version: VISION_VERSION_IOS,
    };
  }

  const colors = await extractColorsFromUrl(url);
  return {
    labels:  colors,
    text:    [],
    version: colors.length > 0 ? VISION_VERSION_WEB : VISION_VERSION_WEB_EMPTY,
  };
}
