/**
 * Image storage layer for local-first architecture.
 *
 * On native iOS: images are saved to the Capacitor Filesystem (Documents dir),
 * which is automatically included in iCloud backup. Display URLs are computed
 * once via Filesystem.getUri() + Capacitor.convertFileSrc() and cached in
 * memory for synchronous access by getImageUrl().
 *
 * On web (dev): images are stored as object URLs in memory (session-only —
 * intentional, the final product is native iOS).
 */

import { Capacitor } from "@capacitor/core";

const IMAGE_DIR = "wardrobe-images";

/** Filename → display URL cache (populated at upload time and app startup) */
const urlCache = new Map<string, string>();

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Save an image blob to local storage.
 * Returns the filename (stable key stored in the DB as imageObjectPath).
 */
export async function saveImage(blob: Blob, filename: string): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const base64 = await blobToBase64(blob);
    await Filesystem.writeFile({
      path: `${IMAGE_DIR}/${filename}`,
      data: base64,
      directory: Directory.Documents,
      recursive: true,
    });
    const { uri } = await Filesystem.getUri({
      path: `${IMAGE_DIR}/${filename}`,
      directory: Directory.Documents,
    });
    urlCache.set(filename, Capacitor.convertFileSrc(uri));
  } else {
    // Web dev: in-memory object URL (session-only, intentional)
    const url = URL.createObjectURL(blob);
    urlCache.set(filename, url);
  }
  return filename;
}

/**
 * Synchronous URL lookup from cache.
 * Returns null if the URL hasn't been warmed yet (shows placeholder).
 */
export function getCachedImageUrl(filename: string | null | undefined): string | null {
  if (!filename) return null;
  return urlCache.get(filename) ?? null;
}

/**
 * Pre-warm the URL cache for all image filenames at app startup.
 * Native iOS only — no-op on web. Await before first render so images
 * are visible immediately.
 */
export async function warmImageUrls(filenames: string[]): Promise<void> {
  if (!Capacitor.isNativePlatform() || filenames.length === 0) return;
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  await Promise.allSettled(
    filenames.map(async (f) => {
      if (!f || urlCache.has(f)) return;
      try {
        const { uri } = await Filesystem.getUri({
          path: `${IMAGE_DIR}/${f}`,
          directory: Directory.Documents,
        });
        urlCache.set(f, Capacitor.convertFileSrc(uri));
      } catch {
        // File missing — no cache entry; image shows as placeholder
      }
    }),
  );
}

/**
 * Delete an image file and clear its cache entry.
 */
export async function deleteImage(filename: string | null | undefined): Promise<void> {
  if (!filename) return;
  const oldUrl = urlCache.get(filename);
  if (oldUrl?.startsWith("blob:")) URL.revokeObjectURL(oldUrl);
  urlCache.delete(filename);

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    try {
      await Filesystem.deleteFile({
        path: `${IMAGE_DIR}/${filename}`,
        directory: Directory.Documents,
      });
    } catch {
      // File may not exist — ignore
    }
  }
}

/**
 * Read all images in the wardrobe directory as base64 strings.
 * Used for backup export. Native only (returns [] on web).
 */
export async function listImages(): Promise<{ filename: string; data: string }[]> {
  if (!Capacitor.isNativePlatform()) return [];
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  try {
    const { files } = await Filesystem.readdir({
      path: IMAGE_DIR,
      directory: Directory.Documents,
    });
    const results = await Promise.allSettled(
      files.map(async (f) => {
        const { data } = await Filesystem.readFile({
          path: `${IMAGE_DIR}/${f.name}`,
          directory: Directory.Documents,
        });
        return { filename: f.name, data: data as string };
      }),
    );
    return results
      .filter(
        (r): r is PromiseFulfilledResult<{ filename: string; data: string }> =>
          r.status === "fulfilled",
      )
      .map((r) => r.value);
  } catch {
    return [];
  }
}

/**
 * Restore an image from a base64 string (used during backup import).
 */
export async function restoreImage(filename: string, base64: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  await Filesystem.writeFile({
    path: `${IMAGE_DIR}/${filename}`,
    data: base64,
    directory: Directory.Documents,
    recursive: true,
  });
  const { uri } = await Filesystem.getUri({
    path: `${IMAGE_DIR}/${filename}`,
    directory: Directory.Documents,
  });
  urlCache.set(filename, Capacitor.convertFileSrc(uri));
}
