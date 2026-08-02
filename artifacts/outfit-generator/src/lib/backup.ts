/**
 * Backup service — exports all wardrobe data to a JSON file
 * and imports it back.
 *
 * Format: JSON file (vanity-backup-<date>.json) containing clothing
 * items, outfits, and outfit_items. Images are embedded as data URLs.
 *
 * On native iOS: shares the file via the native share sheet.
 * On web: triggers a browser download.
 */

import { dbExportAll, dbImportAll, type ExportPayload } from './db';
import { Capacitor } from '@capacitor/core';

// ── Export ────────────────────────────────────────────────────────────────────

export async function exportBackup(): Promise<void> {
  const payload = await dbExportAll();
  const json = JSON.stringify(payload, null, 2);
  const filename = `vanity-backup-${new Date().toISOString().slice(0, 10)}.json`;

  if (Capacitor.isNativePlatform()) {
    await exportNative(json, filename);
  } else {
    exportWeb(json, filename);
  }
}

async function exportNative(json: string, filename: string): Promise<void> {
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');

    const path = `vanity-exports/${filename}`;
    await Filesystem.writeFile({
      path,
      data: json,
      directory: Directory.Cache,
      encoding: 'utf8' as Parameters<typeof Filesystem.writeFile>[0]['encoding'],
      recursive: true,
    });

    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });

    await Share.share({
      title: 'My Digital Vanity Backup',
      url: uri,
      dialogTitle: 'Save or share your vanity backup',
    });
  } catch (err) {
    console.error('Native export failed, falling back to web:', err);
    exportWeb(json, filename);
  }
}

function exportWeb(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Import ────────────────────────────────────────────────────────────────────

export async function importBackup(file: File): Promise<void> {
  const text = await file.text();
  const payload = JSON.parse(text) as ExportPayload;

  if (!payload.version || !Array.isArray(payload.clothing)) {
    throw new Error('Invalid backup file format');
  }

  await dbImportAll(payload);
}
