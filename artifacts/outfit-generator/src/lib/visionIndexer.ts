/**
 * visionIndexer.ts
 * Background indexer: stamps visionLabels / visionText / visionVersion on
 * every item that needs analysis, one at a time with a 350 ms delay.
 *
 * Call runVisionIndexer() once on app start (fire-and-forget).
 * Call indexItemPhoto(id) immediately after adding / updating a photo.
 */

import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { getAllClothingItems, updateClothingItem } from './db';
import {
  analyzePhoto,
  VISION_VERSION_IOS,
  VISION_VERSION_WEB,
  VISION_VERSION_WEB_EMPTY,
} from './visionExtractor';
import { getImageUrl } from './utils';

const DELAY_MS = 350;

function needsIndexing(visionVersion: number | null | undefined): boolean {
  const v = visionVersion ?? 0;
  if (Capacitor.isNativePlatform()) return v < VISION_VERSION_IOS;
  // Web: re-run anything below 4; skip 5 (analyzed, no labels found)
  return v < VISION_VERSION_WEB && v !== VISION_VERSION_WEB_EMPTY;
}

let indexerRunning = false;

/** Run once on app start to index all unanalyzed photos. */
export async function runVisionIndexer(): Promise<void> {
  if (indexerRunning) return;

  const pending = getAllClothingItems().filter(
    (i) => i.imageObjectPath && needsIndexing((i as any).visionVersion),
  );
  if (pending.length === 0) return;

  indexerRunning = true;
  const toastId = toast.loading('Preparing photo search…', { duration: Infinity });

  try {
    for (const item of pending) {
      const url = getImageUrl(item.imageObjectPath!);
      if (!url) continue;
      try {
        const result = await analyzePhoto(url);
        updateClothingItem(item.id, {
          visionLabels:  result.labels,
          visionText:    result.text,
          visionVersion: result.version,
        } as any);
      } catch {
        // silent — text search still works without vision data
      }
      await new Promise<void>((r) => setTimeout(r, DELAY_MS));
    }
  } finally {
    indexerRunning = false;
    toast.dismiss(toastId);
  }
}

/**
 * Immediately analyze a single item's photo.
 * Call after adding a new item or replacing its photo.
 */
export async function indexItemPhoto(itemId: number): Promise<void> {
  const item = getAllClothingItems().find((i) => i.id === itemId);
  if (!item?.imageObjectPath) return;
  const url = getImageUrl(item.imageObjectPath);
  if (!url) return;
  try {
    const result = await analyzePhoto(url);
    updateClothingItem(itemId, {
      visionLabels:  result.labels,
      visionText:    result.text,
      visionVersion: result.version,
    } as any);
  } catch {}
}
