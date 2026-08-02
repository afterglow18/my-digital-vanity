/**
 * Backup / restore — exports all clothing items, outfits, and images as a
 * ZIP file; imports from a previously exported ZIP.
 *
 * Export on iOS: writes the ZIP to the cache directory then opens the iOS
 * share sheet so the user can save to Files, iCloud Drive, AirDrop, etc.
 * Export on web: triggers a browser download (dev convenience).
 *
 * Import: reads a ZIP picked via <input type="file">, restores items/outfits
 * to localStorage and images to the Capacitor Filesystem.
 */

import JSZip from "jszip";
import { Capacitor } from "@capacitor/core";
import { getAllClothingItems, getAllStoredOutfits } from "./db";
import { listImages, restoreImage } from "./imageStorage";

// ── Export ────────────────────────────────────────────────────────────────────

export async function exportBackup(): Promise<void> {
  const zip = new JSZip();

  const metadata = {
    version: 1,
    exportedAt: new Date().toISOString(),
    clothingItems: getAllClothingItems(),
    outfits: getAllStoredOutfits(),
    tier: localStorage.getItem("mdc_tier") ?? "free",
    seq: localStorage.getItem("mdc_seq") ?? "0",
  };
  zip.file("wardrobe.json", JSON.stringify(metadata, null, 2));

  // Images — native only (web has no persistent images to back up)
  if (Capacitor.isNativePlatform()) {
    const images = await listImages();
    if (images.length > 0) {
      const imgFolder = zip.folder("images")!;
      for (const { filename, data } of images) {
        imgFolder.file(filename, data, { base64: true });
      }
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const dateStr = new Date().toISOString().split("T")[0];
  const filename = `my-closet-backup-${dateStr}.zip`;

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");

    const base64 = await blobToBase64(blob);
    await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    });
    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
    await Share.share({
      title: "My Digital Closet Backup",
      url: uri,
      dialogTitle: "Save or share your wardrobe backup",
    });
  } else {
    // Web dev — trigger download
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

// ── Import ────────────────────────────────────────────────────────────────────

export interface ImportResult {
  itemCount: number;
  outfitCount: number;
}

export async function importBackup(file: File): Promise<ImportResult> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const metadataFile = zip.file("wardrobe.json");
  if (!metadataFile) throw new Error("Invalid backup file — wardrobe.json not found.");

  const metadata = JSON.parse(await metadataFile.async("string")) as {
    version: number;
    clothingItems?: unknown[];
    outfits?: unknown[];
    tier?: string;
    seq?: string;
  };

  if (!metadata.version || !Array.isArray(metadata.clothingItems)) {
    throw new Error("Unrecognised backup format.");
  }

  // Restore images (native only)
  if (Capacitor.isNativePlatform()) {
    const imagesFolder = zip.folder("images");
    if (imagesFolder) {
      const tasks: Promise<void>[] = [];
      imagesFolder.forEach((relativePath, file) => {
        if (!file.dir) {
          tasks.push(
            file.async("base64").then((base64) => restoreImage(relativePath, base64)),
          );
        }
      });
      await Promise.allSettled(tasks);
    }
  }

  // Restore metadata
  localStorage.setItem("mdc_clothing_items", JSON.stringify(metadata.clothingItems ?? []));
  localStorage.setItem("mdc_outfits", JSON.stringify(metadata.outfits ?? []));

  // Restore sequence counter
  if (metadata.seq) {
    localStorage.setItem("mdc_seq", String(metadata.seq));
  } else {
    const allIds = [
      ...(metadata.clothingItems ?? []).map((i) => (i as { id: number }).id ?? 0),
      ...(metadata.outfits ?? []).map((o) => (o as { id: number }).id ?? 0),
    ];
    localStorage.setItem("mdc_seq", String(allIds.length ? Math.max(...allIds) : 0));
  }

  // Restore tier (only trusted values)
  if (metadata.tier === "unlock" || metadata.tier === "premium") {
    localStorage.setItem("mdc_tier", metadata.tier);
  }

  return {
    itemCount: (metadata.clothingItems ?? []).length,
    outfitCount: (metadata.outfits ?? []).length,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
