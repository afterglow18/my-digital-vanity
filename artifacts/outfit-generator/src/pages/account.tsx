/**
 * AccountPage — My Closet settings.
 *
 * Sections:
 *  1. Subscription status + Restore Purchases
 *  2. Export backup (ZIP → iOS share sheet / browser download)
 *  3. Import backup (file picker → restore from ZIP)
 *  4. App info
 */
import React, { useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Download, Upload, RefreshCw, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { useEntitlements, setGlobalTier, syncTierFromRC, getCurrentTier } from "@/hooks/useEntitlements";
import { restorePurchases } from "@/lib/revenuecat";
import { exportBackup, importBackup, type ImportResult } from "@/lib/backup";
import { useQueryClient } from "@tanstack/react-query";
import { getListClothingQueryKey, getListOutfitsQueryKey } from "@/lib/local-api";
import { UpgradeSheet } from "@/components/paywall/UpgradeSheet";
type Status = { kind: "idle" } | { kind: "loading" } | { kind: "ok"; msg: string } | { kind: "err"; msg: string };

export default function AccountPage() {
  const { tier } = useEntitlements();
  const queryClient = useQueryClient();
  const importRef = useRef<HTMLInputElement>(null);

  const [exportStatus,  setExportStatus]  = useState<Status>({ kind: "idle" });
  const [importStatus,  setImportStatus]  = useState<Status>({ kind: "idle" });
  const [restoreStatus, setRestoreStatus] = useState<Status>({ kind: "idle" });
  const [showUpgrade,   setShowUpgrade]   = useState(false);

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExportStatus({ kind: "loading" });
    try {
      await exportBackup();
      setExportStatus({ kind: "ok", msg: "Backup ready! Save it somewhere safe." });
    } catch (err) {
      setExportStatus({ kind: "err", msg: err instanceof Error ? err.message : "Export failed." });
    }
  };

  // ── Import ──────────────────────────────────────────────────────────────────
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImportStatus({ kind: "loading" });
    try {
      const result: ImportResult = await importBackup(file);
      // Invalidate all queries so pages reflect restored data
      queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      setImportStatus({
        kind: "ok",
        msg: `Restored ${result.itemCount} items and ${result.outfitCount} outfits.`,
      });
    } catch (err) {
      setImportStatus({ kind: "err", msg: err instanceof Error ? err.message : "Import failed." });
    }
  };

  // ── Restore purchases ────────────────────────────────────────────────────────
  const handleRestore = async () => {
    setRestoreStatus({ kind: "loading" });
    try {
      // restorePurchases() tells StoreKit to sync, then reads from RevenueCat.
      // syncTierFromRC() re-reads after the restore to set the tier authoritatively
      // (handles "unlock" vs "premium" correctly, and downgrades to free if nothing active).
      await restorePurchases();
      await syncTierFromRC();
      const restoredTier = getCurrentTier();
      if (restoredTier !== "free") {
        setRestoreStatus({ kind: "ok", msg: "Subscription restored! ✨" });
      } else {
        setRestoreStatus({ kind: "ok", msg: "No active subscription found." });
      }
    } catch {
      setRestoreStatus({ kind: "err", msg: "Restore failed. Please try again." });
    }
  };

  return (
    <>
    <div
      className="flex flex-col gap-5 px-4 py-6 max-w-md mx-auto"
      style={{ paddingTop: "max(24px, env(safe-area-inset-top))" }}
    >
      <h1 className="font-display font-bold text-3xl uppercase tracking-tight">My Digital Closet</h1>

      {/* ── Subscription ───────────────────────────────────────────────────── */}
      <section className="border-2 border-black rounded-2xl bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">👑</span>
          <h2 className="font-display font-bold text-lg uppercase tracking-tight">My Plan</h2>
        </div>

        <div className="flex items-center justify-between">
          <span className="font-medium text-sm text-black/70">Current plan</span>
          {tier === "free" ? (
            <span className="px-3 py-1 border-2 border-black rounded-full text-sm font-bold bg-[#f9f4ee]">
              Free
            </span>
          ) : (
            <span className="px-3 py-1 border-2 border-black rounded-full text-sm font-bold bg-primary">
              Unlocked ✨
            </span>
          )}
        </div>

        {tier === "free" && (
          <button
            onClick={() => setShowUpgrade(true)}
            className="flex items-center justify-center gap-2 py-3 border-2 border-black rounded-xl
                       bg-primary font-bold text-sm uppercase tracking-tight
                       shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                       active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
          >
            Lifetime Unlock – $9.99
          </button>
        )}

        <StatusMessage status={restoreStatus} />

        <button
          onClick={handleRestore}
          disabled={restoreStatus.kind === "loading"}
          className="flex items-center justify-center gap-1.5 text-xs font-semibold
                     text-black/40 hover:text-black/70 transition-colors disabled:opacity-50"
        >
          {restoreStatus.kind === "loading" ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
          Restore Purchases
        </button>
      </section>

      {/* ── Backup ─────────────────────────────────────────────────────────── */}
      <section className="border-2 border-black rounded-2xl bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">💾</span>
          <h2 className="font-display font-bold text-lg uppercase tracking-tight">Backup & Restore</h2>
        </div>

        <p className="text-sm text-black/60 leading-snug">
          Export your wardrobe to a ZIP file. Save it to iCloud Drive or Files to keep it safe across phone upgrades.
        </p>

        {/* Export */}
        <button
          onClick={handleExport}
          disabled={exportStatus.kind === "loading"}
          className="flex items-center justify-center gap-2 py-3 border-2 border-black rounded-xl
                     bg-primary font-bold text-sm uppercase tracking-tight
                     shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                     active:translate-x-0.5 active:translate-y-0.5 active:shadow-none
                     disabled:opacity-50 transition-all"
        >
          {exportStatus.kind === "loading" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Export Backup
        </button>

        <StatusMessage status={exportStatus} />

        <p className="text-xs font-semibold leading-snug" style={{ color: "#CC2200" }}>
          ⚠️ Deleting the app removes all your wardrobe data. Export a backup first to keep it safe.
        </p>

        {/* Import */}
        <button
          onClick={() => importRef.current?.click()}
          disabled={importStatus.kind === "loading"}
          className="flex items-center justify-center gap-2 py-3 border-2 border-black rounded-xl
                     bg-primary font-bold text-sm uppercase tracking-tight
                     shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                     active:translate-x-0.5 active:translate-y-0.5 active:shadow-none
                     disabled:opacity-50 transition-all"
        >
          {importStatus.kind === "loading" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          Import Backup
        </button>

        <input
          ref={importRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={handleImportFile}
        />

        <StatusMessage status={importStatus} />

        <p className="text-xs text-black/40 text-center">
          Importing replaces your current wardrobe with the backup.
        </p>
      </section>


      {/* ── App info ────────────────────────────────────────────────────────── */}
      <section className="border-2 border-black rounded-2xl bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">💛</span>
          <h2 className="font-display font-bold text-lg uppercase tracking-tight">My Digital Closet</h2>
        </div>
        <p className="text-sm text-black/60">Version 1.0.0</p>
        <p className="text-sm text-black/60 leading-snug">
          Your wardrobe stays on your device, works offline, and can be backed up with iCloud.
        </p>
      </section>
    </div>

    <AnimatePresence>
      {showUpgrade && (
        <UpgradeSheet reason="items" onClose={() => setShowUpgrade(false)} />
      )}
    </AnimatePresence>
    </>
  );
}

// ── StatusMessage helper ──────────────────────────────────────────────────────

function StatusMessage({ status }: { status: Status }) {
  if (status.kind === "idle" || status.kind === "loading") return null;
  return (
    <div
      className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 border ${
        status.kind === "ok"
          ? "bg-green-50 border-green-200 text-green-800"
          : "bg-red-50 border-red-200 text-red-800"
      }`}
    >
      {status.kind === "ok" ? (
        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
      ) : (
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      )}
      {status.msg}
    </div>
  );
}
