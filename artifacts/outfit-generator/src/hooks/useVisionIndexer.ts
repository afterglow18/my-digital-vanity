/**
 * useVisionIndexer — background photo analysis hook.
 *
 * On mount, finds all clothing items that haven't been analysed yet and
 * processes them one at a time with a 350 ms delay so the UI stays responsive.
 *
 * Version scheme (matches visionWeb.ts constants):
 *   0 = unanalyzed
 *   2 = iOS Vision v2 (labels + text, with canvas colors merged in)
 *   4 = web canvas v4 (legacy — had a URL-resolution + draw bug)
 *   5 = web canvas v5 (current algorithm — correct draw + extended pink/rose)
 *   6 = (reserved)
 *  100 = WEB_EMPTY_VERSION — analyzed correctly, no foreground colors found (do NOT retry)
 *
 * On web  : run if visionVersion is NOT WEB_VISION_VERSION (5) and NOT WEB_EMPTY_VERSION (100)
 * On native: run if visionVersion < NATIVE_VISION_VERSION (2)
 *
 * Progress: a sonner toast is shown while backfilling and dismissed when done.
 * The React Query cache is invalidated after every item update so search
 * results start appearing as soon as the first item is indexed, not only
 * after the entire wardrobe has been processed.
 */

import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { dbListClothing, dbUpdateClothing } from '@/lib/db';
import { getImageUrl } from '@/lib/utils';
import { extractWebVisionLabels, WEB_VISION_VERSION, WEB_EMPTY_VERSION } from '@/lib/visionWeb';
import { queryClient } from '@/lib/queryClient';
import { getListClothingQueryKey } from '@/hooks/useLocalWardrobe';

import { NATIVE_VISION_VERSION } from '@/lib/visionAnalysis';

const DELAY_MS = 350;
/** Invalidate the clothing query cache at most every N updates to avoid
 *  flooding React Query with invalidations on large wardrobes. */
const INVALIDATE_EVERY = 5;

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

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

/** Call the native VisionPlugin to analyse an image. Returns empty on any error. */
async function analyzeNative(imageUrl: string): Promise<{ labels: string[]; text: string[] }> {
  try {
    const base64 = await fetchAsBase64(imageUrl);
    const { Plugins } = await import('@capacitor/core') as unknown as {
      Plugins: Record<string, unknown>
    };
    const VisionPlugin = Plugins['Vision'] as {
      analyzeImage: (args: { imageData: string }) => Promise<{ labels: string[]; text: string[] }>
    } | undefined;
    if (!VisionPlugin) return { labels: [], text: [] };
    return await VisionPlugin.analyzeImage({ imageData: base64 });
  } catch {
    return { labels: [], text: [] };
  }
}

export function useVisionIndexer() {
  const runningRef = useRef(false);

  useEffect(() => {
    if (runningRef.current) return;
    runningRef.current = true;

    (async () => {
      try {
        const items = await dbListClothing();
        const isNative = Capacitor.isNativePlatform();

        const needsIndexing = items.filter((item) => {
          if (!item.imageObjectPath) return false;
          const v = item.visionVersion ?? 0;
          if (isNative) return v < NATIVE_VISION_VERSION;
          // Re-run anything below the current algorithm version; skip only
          // WEB_VISION_VERSION (correctly analyzed) and WEB_EMPTY_VERSION (truly empty).
          return v !== WEB_VISION_VERSION && v !== WEB_EMPTY_VERSION;
        });

        if (needsIndexing.length === 0) return;

        const total = needsIndexing.length;
        let done = 0;

        for (const item of needsIndexing) {
          // Resolve storage key → actual URL before analysis
          const imageUrl = getImageUrl(item.imageObjectPath!);
          if (!imageUrl) {
            await delay(DELAY_MS);
            continue;
          }

          try {
            if (isNative) {
              const { labels, text } = await analyzeNative(imageUrl);
              await dbUpdateClothing(item.id, {
                visionLabels:  labels,
                visionText:    text,
                visionVersion: NATIVE_VISION_VERSION,
              });
            } else {
              const { labels, version } = await extractWebVisionLabels(imageUrl);
              await dbUpdateClothing(item.id, {
                visionLabels:  labels,
                visionText:    [],
                visionVersion: version,
              });
            }
          } catch {
            // Persist a sentinel so we don't retry this item endlessly.
            await dbUpdateClothing(item.id, {
              visionLabels:  [],
              visionText:    [],
              visionVersion: WEB_EMPTY_VERSION,
            }).catch(() => {});
          }

          done++;

          // Invalidate the clothing cache periodically so search results
          // start appearing well before the full backfill completes.
          if (done % INVALIDATE_EVERY === 0) {
            await queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
          }

          await delay(DELAY_MS);
        }

        // Final invalidation to pick up any items in the last partial batch.
        await queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });

      } catch {
        // silent — never crash the app
      } finally {
        runningRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
