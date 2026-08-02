/**
 * useVisionIndexer — background photo analysis hook.
 *
 * On mount, finds all clothing items that haven't been analysed yet and
 * processes them one at a time with a 350 ms delay so the UI stays responsive.
 *
 * Version scheme (matches visionWeb.ts constants):
 *   0 = unanalyzed
 *   1 = iOS Vision (labels + text)
 *   4 = web canvas color extraction (current algorithm, with labels)
 *   5 = LEGACY — was incorrectly marked "empty" due to a URL-resolution bug;
 *       must be retried so items get a real analysis
 *   6 = web analyzed correctly, no foreground colors found — do NOT retry
 *
 * On web  : run if visionVersion is NOT 4 (correctly analyzed) and NOT 6 (truly empty)
 * On native: run if visionVersion < 1 (i.e. 0)
 */

import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { dbListClothing, dbUpdateClothing } from '@/lib/db';
import { getImageUrl } from '@/lib/utils';
import { extractWebVisionLabels, WEB_VISION_VERSION, WEB_EMPTY_VERSION } from '@/lib/visionWeb';
import { queryClient } from '@/lib/queryClient';
import { getListClothingQueryKey } from '@/hooks/useLocalWardrobe';

const NATIVE_VISION_VERSION = 1;
const DELAY_MS = 350;

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

        console.log('[VisionIndexer] total items:', items.length, '| native:', isNative);
        items.forEach(i => console.log(`  ${i.name}: v=${i.visionVersion ?? 0} path=${i.imageObjectPath ? 'set(' + String(i.imageObjectPath).slice(0,30) + '…)' : 'MISSING'}`));

        const needsIndexing = items.filter((item) => {
          if (!item.imageObjectPath) return false;
          const v = item.visionVersion ?? 0;
          if (isNative) return v < NATIVE_VISION_VERSION;
          return v !== WEB_VISION_VERSION && v !== WEB_EMPTY_VERSION;
        });

        console.log('[VisionIndexer] needs indexing:', needsIndexing.length);
        if (needsIndexing.length === 0) return;

        let updatedAny = false;

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
            updatedAny = true;
          } catch {
            // Persist legacy sentinel 5 → new empty 6 so we don't retry this item endlessly
            await dbUpdateClothing(item.id, {
              visionLabels:  [],
              visionText:    [],
              visionVersion: WEB_EMPTY_VERSION,
            }).catch(() => {});
          }

          await delay(DELAY_MS);
        }

        // Invalidate the clothing cache so search picks up the new labels immediately
        if (updatedAny) {
          await queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
        }
      } catch {
        // Never crash the app
      } finally {
        runningRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
