/**
 * useVisionIndexer — background photo analysis hook.
 *
 * On mount, finds all clothing items that haven't been analysed yet and
 * processes them one at a time with a 350 ms delay so the UI stays responsive.
 * Shows a non-blocking "Preparing photo search…" toast while running.
 *
 * Version scheme (matches visionWeb.ts constants):
 *   0 = unanalyzed
 *   1 = iOS Vision (labels + text)
 *   4 = web canvas color extraction (current algorithm)
 *   5 = web analyzed but no labels found — do NOT retry
 *
 * On web  : run if visionVersion is 0, 1, 2, or 3 (i.e. < 4, but not 5)
 * On native: run if visionVersion < 1 (i.e. 0)
 */

import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { dbListClothing, dbUpdateClothing } from '@/lib/db';
import { extractWebVisionLabels, WEB_VISION_VERSION, WEB_EMPTY_VERSION } from '@/lib/visionWeb';

const NATIVE_VISION_VERSION = 1;
const DELAY_MS = 350;

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

/** Call the native VisionPlugin to analyse an image. Returns empty on any error. */
async function analyzeNative(imageData: string): Promise<{ labels: string[]; text: string[] }> {
  try {
    // Strip data-URL prefix — the plugin expects raw base64
    const base64 = imageData.replace(/^data:[^;]+;base64,/, '');
    // Dynamically import Capacitor Plugins to avoid bundling issues when not native
    const { Plugins } = await import('@capacitor/core') as unknown as { Plugins: Record<string, unknown> };
    const VisionPlugin = Plugins['Vision'] as { analyzeImage: (args: { imageData: string }) => Promise<{ labels: string[]; text: string[] }> } | undefined;
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
          if (isNative) return (item.visionVersion ?? 0) < NATIVE_VISION_VERSION;
          // Web: re-run anything below v4, but skip v5 (analyzed, empty, don't retry)
          const v = item.visionVersion ?? 0;
          return v < WEB_VISION_VERSION && v !== WEB_EMPTY_VERSION;
        });

        if (needsIndexing.length === 0) return;

        const toastId = toast.loading('Preparing photo search…', { duration: Infinity });

        for (const item of needsIndexing) {
          try {
            if (isNative) {
              const { labels, text } = await analyzeNative(item.imageObjectPath!);
              await dbUpdateClothing(item.id, {
                visionLabels:  labels,
                visionText:    text,
                visionVersion: NATIVE_VISION_VERSION,
              });
            } else {
              const { labels, version } = await extractWebVisionLabels(item.imageObjectPath!);
              await dbUpdateClothing(item.id, {
                visionLabels:  labels,
                visionText:    [],
                visionVersion: version,
              });
            }
          } catch {
            // Persist as empty so we don't retry indefinitely
            await dbUpdateClothing(item.id, {
              visionLabels:  [],
              visionText:    [],
              visionVersion: WEB_EMPTY_VERSION,
            }).catch(() => {});
          }
          await delay(DELAY_MS);
        }

        toast.dismiss(toastId);
      } catch {
        // Never crash the app
      } finally {
        runningRef.current = false;
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
