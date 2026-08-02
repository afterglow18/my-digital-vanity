/**
 * visionWeb.ts — client-side photo analysis using a 48×48 canvas.
 *
 * Extracts dominant foreground colors from an item photo by:
 *   1. Drawing the image onto a 48×48 off-screen canvas.
 *   2. Sampling 4×4 pixel patches from each corner to detect the studio
 *      background color (product photos almost always have a uniform background).
 *   3. Excluding pixels whose Euclidean RGB distance from the background
 *      is below the threshold (i.e. they are background).
 *   4. Mapping each surviving foreground pixel to a human-readable color name.
 *   5. Returning only names that cover ≥ 10% of foreground pixels.
 *
 * Version constants:
 *   WEB_VISION_VERSION = 4  — successfully analyzed (may have 0 labels)
 *   WEB_EMPTY_VERSION  = 5  — analyzed, no labels found (do NOT retry)
 */

/**
 * Algorithm version — increment whenever the extraction logic changes so that
 * previously-analyzed items are automatically re-processed on next launch.
 * Current: v5 — correct URL + correct canvas draw + extended pink/rose hue range.
 *
 * History:
 *   4 — initial algorithm (double-Image bug, wrong pink boundary)
 *   5 — fixed draw + extended pink/rose to cover rose-gold and blush
 */
export const WEB_VISION_VERSION = 5;

/**
 * High sentinel meaning "analyzed correctly by the current algorithm version but
 * the photo contains no distinguishable foreground colors — do NOT retry."
 * Kept well above WEB_VISION_VERSION so there's room to bump the algorithm.
 */
export const WEB_EMPTY_VERSION  = 100;

// Maximum Euclidean RGB distance to consider a pixel "background"
const BG_TOLERANCE = 35;

// Minimum fraction of foreground pixels a color must cover to be returned
const MIN_COVERAGE = 0.10;

// ── Color name mapping ────────────────────────────────────────────────────────

interface Rgb { r: number; g: number; b: number }

function luminance({ r, g, b }: Rgb): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function rgbToHsv({ r, g, b }: Rgb): { h: number; s: number; v: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn)      h = ((gn - bn) / d + 6) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else                 h = (rn - gn) / d + 4;
    h *= 60;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function colorName(px: Rgb): string {
  const lum = luminance(px);
  const { h, s, v } = rgbToHsv(px);

  // Achromatic (low saturation)
  if (s < 0.15) {
    if (lum < 80)  return 'black';
    if (lum < 110) return 'dark grey';
    if (lum < 175) return 'grey';
    if (lum < 225) return 'light grey';
    return 'white';
  }

  // Chromatic — use hue
  // Warm neutrals (low saturation, warm hue)
  if (s < 0.25 && v > 0.75 && h >= 20 && h <= 55) return 'beige';
  if (s < 0.40 && v > 0.55 && h >= 20 && h <= 45) return 'tan';
  if (s >= 0.30 && v < 0.55 && h >= 15 && h <= 40) return 'brown';

  // Chromatic color families — ordered most-specific first
  // Pink covers: magenta (h 300-345), rose/blush (h 345-360 or 0-20 with low-medium
  // saturation and high value). Saturated 0-20° is red; unsaturated/pastel is pink.
  if ((h >= 345 || h < 20) && s < 0.55 && v > 0.60) return 'pink';  // rose, blush, mauve
  if (h >= 300 && h < 345 && v > 0.55)               return 'pink';  // hot pink, magenta
  if (h >= 345 || h < 15)                            return 'red';
  if (h >= 15  && h < 45)                            return s > 0.5 ? 'orange' : 'brown';
  if (h >= 45  && h < 75)                            return 'yellow';
  if (h >= 75  && h < 165)                           return 'green';
  if (h >= 165 && h < 200)                           return 'teal';
  if (h >= 200 && h < 260)                           return 'blue';
  if (h >= 260 && h < 300)                           return 'purple';
  return 'purple';
}

// ── Background detection ──────────────────────────────────────────────────────

function sampleCornerBackground(data: Uint8ClampedArray, w: number, h: number): Rgb {
  const patch = 4; // 4×4 patch
  let rSum = 0, gSum = 0, bSum = 0, count = 0;

  const corners = [
    { ox: 0,       oy: 0       },
    { ox: w - patch, oy: 0     },
    { ox: 0,       oy: h - patch },
    { ox: w - patch, oy: h - patch },
  ];

  for (const { ox, oy } of corners) {
    for (let dy = 0; dy < patch; dy++) {
      for (let dx = 0; dx < patch; dx++) {
        const idx = ((oy + dy) * w + (ox + dx)) * 4;
        rSum += data[idx];
        gSum += data[idx + 1];
        bSum += data[idx + 2];
        count++;
      }
    }
  }
  return { r: rSum / count, g: gSum / count, b: bSum / count };
}

function rgbDistance(a: Rgb, b: Rgb): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Analyze an image data-URL and return dominant foreground color names.
 * Returns { labels, version } where version is WEB_VISION_VERSION (4)
 * or WEB_EMPTY_VERSION (5) when no colors were found.
 *
 * Resolves to { labels: [], version: WEB_EMPTY_VERSION } on any error so
 * callers can persist "analyzed but empty" and skip this item next time.
 */
export async function extractWebVisionLabels(
  imageUrl: string,
): Promise<{ labels: string[]; version: number }> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width  = 48;
    canvas.height = 48;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { labels: [], version: WEB_EMPTY_VERSION };

    // Load the image once and reuse the same element for drawImage.
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload  = () => resolve();
      img.onerror = reject;
      img.src = imageUrl;
    });

    ctx.drawImage(img, 0, 0, 48, 48);

    const { data } = ctx.getImageData(0, 0, 48, 48);
    const bg = sampleCornerBackground(data, 48, 48);

    const counts: Record<string, number> = {};
    let foregroundCount = 0;

    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha < 128) continue; // fully transparent — skip
      const px: Rgb = { r: data[i], g: data[i + 1], b: data[i + 2] };
      if (rgbDistance(px, bg) < BG_TOLERANCE) continue; // background — skip
      foregroundCount++;
      const name = colorName(px);
      counts[name] = (counts[name] ?? 0) + 1;
    }

    if (foregroundCount === 0) return { labels: [], version: WEB_EMPTY_VERSION };

    const labels = Object.entries(counts)
      .filter(([, n]) => n / foregroundCount >= MIN_COVERAGE)
      .sort(([, a], [, b]) => b - a)
      .map(([name]) => name);

    return {
      labels,
      version: labels.length > 0 ? WEB_VISION_VERSION : WEB_EMPTY_VERSION,
    };
  } catch {
    return { labels: [], version: WEB_EMPTY_VERSION };
  }
}
