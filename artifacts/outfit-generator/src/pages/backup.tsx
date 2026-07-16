/**
 * AccountPage — My Plan + Backup & Restore + App Info
 * Replaces the old simple backup page.
 */

import React, { useRef, useState, useCallback } from 'react';
import { Download, Upload, RefreshCw, ShieldCheck } from 'lucide-react';
import { exportBackup, importBackup } from '@/lib/backup';
import { useQueryClient } from '@tanstack/react-query';
import { useEntitlements, readStoredProduct } from '@/hooks/useEntitlements';
import { AnimatePresence, motion } from 'framer-motion';
import { UpgradeSheet } from '@/components/paywall/UpgradeSheet';
import { useBiometricLock } from '@/lib/biometricLock';

const APP_VERSION = '1.0.0';

type BackupStatus = 'idle' | 'exporting' | 'importing' | 'success' | 'error';

// ── Card wrapper ───────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="bg-white rounded-2xl border-2 border-black overflow-hidden"
      style={{ boxShadow: '4px 4px 0 #000' }}
    >
      {children}
    </div>
  );
}

// ── Gold button ────────────────────────────────────────────────────────────────

const ROSE      = "#E8B0B8";   // dusty pink — Spin It button colour
const ROSE_DARK = "#D0909A";   // dusty pink mid

function RoseButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-center gap-2.5 py-3.5
                 rounded-xl border-2 border-black font-black text-sm uppercase tracking-wide
                 text-black transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none
                 disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        background: disabled ? '#D0909A' : 'linear-gradient(to bottom, #E8B0B8, #D0909A)',
        border: '2.5px solid #D0909A',
        boxShadow: disabled ? 'none' : '3px 3px 0 rgba(0,0,0,0.85)',
        letterSpacing: '0.07em',
      }}
    >
      {children}
    </button>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const { tier, restore } = useEntitlements();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const { isLockEnabled, enableLock, disableLock } = useBiometricLock();
  const [lockBusy, setLockBusy] = useState(false);

  const handleRestore = useCallback(async () => {
    if (restoring) return;
    setRestoring(true);
    const result = await restore();
    setRestoring(false);
    if (result === 'success') {
      alert('✅ Purchases restored!');
    } else if (result === 'unavailable') {
      alert('No previous purchases found.');
    }
  }, [restore, restoring]);

  const handleLockToggle = useCallback(async () => {
    if (lockBusy) return;
    setLockBusy(true);
    if (isLockEnabled) {
      await disableLock();
    } else {
      await enableLock();
    }
    setLockBusy(false);
  }, [lockBusy, isLockEnabled, enableLock, disableLock]);

  const [backupStatus, setBackupStatus] = useState<BackupStatus>('idle');
  const [errorMsg, setErrorMsg]         = useState<string | null>(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const pendingFileRef = useRef<File | null>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const queryClient    = useQueryClient();

  const activeProduct = readStoredProduct();
  const tierLabel =
    tier !== 'unlock'         ? 'Free' :
    activeProduct === 'monthly'  ? 'Monthly' :
    activeProduct === 'yearly'   ? 'Annual' :
                                   'Lifetime';

  const handleExport = async () => {
    setBackupStatus('exporting');
    setErrorMsg(null);
    try {
      await exportBackup();
      setBackupStatus('success');
      setTimeout(() => setBackupStatus('idle'), 3000);
    } catch {
      setErrorMsg('Export failed. Please try again.');
      setBackupStatus('error');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    pendingFileRef.current = file;
    setShowImportConfirm(true);
  };

  const handleImportConfirmed = async () => {
    const file = pendingFileRef.current;
    if (!file) return;
    setShowImportConfirm(false);
    setBackupStatus('importing');
    setErrorMsg(null);
    try {
      await importBackup(file);
      queryClient.invalidateQueries();
      setBackupStatus('success');
      setTimeout(() => setBackupStatus('idle'), 3000);
    } catch (err) {
      setErrorMsg(
        err instanceof Error && err.message.includes('Invalid')
          ? "This file doesn't look like a valid vanity backup."
          : 'Import failed. The backup file may be corrupted.',
      );
      setBackupStatus('error');
    }
    pendingFileRef.current = null;
  };

  const busy = backupStatus === 'exporting' || backupStatus === 'importing';

  return (
    <div
      className="min-h-full pb-10"
      style={{ background: '#F5F0E8' }}
    >
      {/* Page title */}
      <div className="px-5 pt-8 pb-5">
        <h1
          className="font-black uppercase leading-none"
          style={{ fontSize: 32, letterSpacing: '-0.02em' }}
        >
          MY DIGITAL VANITY
        </h1>
      </div>

      <div className="px-5 flex flex-col gap-4">

        {/* ── MY PLAN ─────────────────────────────────────────────────────── */}
        <Card>
          <div className="px-4 pt-4 pb-5 flex flex-col gap-3">
            {/* Header */}
            <div className="flex items-center gap-2">
              <span className="text-2xl leading-none">👑</span>
              <h2 className="font-black text-base uppercase tracking-wide">My Plan</h2>
            </div>

            {/* Current plan row */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-black/60">Current plan</span>
              <span
                className="text-sm font-bold px-3 py-1 rounded-full border-2 border-black"
                style={{ background: tier === 'free' ? 'white' : '#F5C842' }}
              >
                {tierLabel}
              </span>
            </div>

            {/* Upgrade button (hidden if already premium) */}
            {tier !== 'premium' && (
              <RoseButton onClick={() => setShowUpgrade(true)}>
                💄 Unlock Forever – $9.99
              </RoseButton>
            )}

            {/* Restore purchases */}
            <button
              className="flex items-center justify-center gap-1.5 text-sm text-black/50
                         font-medium hover:text-black/70 transition-colors disabled:opacity-40"
              disabled={restoring}
              onClick={handleRestore}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${restoring ? 'animate-spin' : ''}`} />
              {restoring ? 'Restoring…' : 'Restore Purchases'}
            </button>
          </div>
        </Card>

        {/* ── BACKUP & RESTORE ─────────────────────────────────────────────── */}
        <Card>
          <div className="px-4 pt-4 pb-5 flex flex-col gap-3">
            {/* Header */}
            <div className="flex items-center gap-2">
              <span className="text-2xl leading-none">💾</span>
              <h2 className="font-black text-base uppercase tracking-wide">Backup &amp; Restore</h2>
            </div>

            {/* Description */}
            <p className="text-sm text-black/60 leading-snug">
              Export your vanity to a JSON file. Save it to iCloud Drive or Files to keep
              it safe across phone upgrades.
            </p>

            {/* Export */}
            <RoseButton onClick={handleExport} disabled={busy}>
              <Download className="w-4 h-4" />
              {backupStatus === 'exporting' ? 'Exporting…' : 'Export Backup'}
            </RoseButton>

            {/* Warning */}
            <p className="text-xs font-bold leading-snug" style={{ color: '#C0392B' }}>
              ⚠️ Deleting the app removes all your vanity data.
              Export a backup first to keep it safe.
            </p>

            {/* Import */}
            <RoseButton onClick={() => fileInputRef.current?.click()} disabled={busy}>
              <Upload className="w-4 h-4" />
              {backupStatus === 'importing' ? 'Restoring…' : 'Import Backup'}
            </RoseButton>

            {/* Import note */}
            <p className="text-xs text-black/40 text-center leading-snug">
              Importing replaces your current vanity with the backup.
            </p>

            {/* Error message */}
            {backupStatus === 'error' && errorMsg && (
              <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">
                {errorMsg}
              </p>
            )}
            {backupStatus === 'success' && (
              <p className="text-xs font-bold text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-center">
                ✓ Done!
              </p>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </Card>

        {/* ── PRIVACY & SECURITY ───────────────────────────────────────────── */}
        <Card>
          <div className="px-4 pt-4 pb-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-6 h-6" style={{ color: ROSE_DARK }} />
              <h2 className="font-black text-base uppercase tracking-wide">Privacy &amp; Security</h2>
            </div>

            {/* Lock toggle row */}
            <div className="flex items-center justify-between py-1">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-black">
                  Lock with Face ID / Touch ID
                </span>
                <span className="text-xs text-black/50 leading-snug">
                  Require biometrics to open the app
                </span>
              </div>

              {/* Toggle switch */}
              <button
                onClick={handleLockToggle}
                disabled={lockBusy}
                aria-label={isLockEnabled ? 'Disable biometric lock' : 'Enable biometric lock'}
                style={{
                  width: 50,
                  height: 28,
                  borderRadius: 14,
                  border: '2px solid #000',
                  background: isLockEnabled
                    ? 'linear-gradient(to right, #E8B0B8, #D0909A)'
                    : '#e5e5e5',
                  position: 'relative',
                  flexShrink: 0,
                  cursor: lockBusy ? 'default' : 'pointer',
                  opacity: lockBusy ? 0.5 : 1,
                  transition: 'background 0.2s',
                  boxShadow: '1px 1px 0 #000',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 2,
                    left: isLockEnabled ? 22 : 2,
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: '#fff',
                    border: '1.5px solid #000',
                    transition: 'left 0.2s',
                    boxShadow: '1px 1px 0 rgba(0,0,0,0.2)',
                  }}
                />
              </button>
            </div>

            <p className="text-xs text-black/40 leading-snug">
              When enabled, you'll be asked to authenticate with Face ID or Touch ID
              each time you open the app or return from the background.
            </p>
          </div>
        </Card>

        {/* ── APP INFO ─────────────────────────────────────────────────────── */}
        <Card>
          <div className="px-4 pt-4 pb-5 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl leading-none">💄</span>
              <h2 className="font-black text-base uppercase tracking-wide">My Digital Vanity</h2>
            </div>
            <p className="text-sm text-black/50 font-medium">Version {APP_VERSION}</p>
            <p className="text-sm text-black/60 leading-snug">
              Your vanity stays on your device, works offline, and can be backed up with iCloud.
            </p>
          </div>
        </Card>

      </div>

      {/* Import confirm dialog */}
      <AnimatePresence>
        {showImportConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          >
            <motion.div
              initial={{ scale: 0.92, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white border-2 border-black rounded-2xl p-6 w-full max-w-sm"
              style={{ boxShadow: '6px 6px 0 #000' }}
            >
              <h3 className="font-black text-xl uppercase tracking-tight mb-2">
                Replace everything?
              </h3>
              <p className="text-sm text-black/60 mb-5 leading-snug">
                This will permanently delete your current vanity and replace it with the backup.
                This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowImportConfirm(false); pendingFileRef.current = null; }}
                  className="flex-1 py-3 rounded-xl border-2 border-black bg-white font-bold
                             text-sm uppercase shadow-[2px_2px_0_#000]
                             active:translate-y-0.5 active:shadow-none transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportConfirmed}
                  className="flex-1 py-3 rounded-xl border-2 border-red-600 bg-red-500 text-white
                             font-bold text-sm uppercase shadow-[2px_2px_0_#7f1d1d]
                             active:translate-y-0.5 active:shadow-none transition-all"
                >
                  Yes, Restore
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upgrade sheet */}
      <AnimatePresence>
        {showUpgrade && (
          <UpgradeSheet reason="items" onClose={() => setShowUpgrade(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
