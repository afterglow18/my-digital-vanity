---
name: Local-first conversion
description: How the app was converted from server/auth architecture to fully local-first (no login, no backend at runtime).
---

## What changed

All clothing/outfit data moved from Postgres REST API → localStorage.
Images moved from Replit Object Storage → Capacitor Filesystem (Documents dir).
Auth removed entirely — no login required.
Stripe web checkout removed — purchases via RevenueCat / Apple StoreKit only.

## New files (artifacts/outfit-generator/src/)

- `lib/db.ts` — localStorage CRUD for ClothingItem, Outfit. Keys: `mdc_clothing_items`, `mdc_outfits`, `mdc_seq`, `mdc_tier`.
- `lib/imageStorage.ts` — Capacitor Filesystem save/load/delete. Stores just filename in DB. URL cache (Map) warmed at startup via `warmImageUrls()`. On web dev: object URLs (session-only, intentional).
- `lib/local-api.ts` — Drop-in replacement for `@workspace/api-client-react`. Same hook signatures, same query key factories. All pages just changed one import line.
- `lib/revenuecat.ts` — RevenueCat init + purchase/restore. `Purchases.getOfferings()` returns `PurchasesOfferings` directly (NOT `{ offerings: PurchasesOfferings }`).
- `lib/backup.ts` — ZIP export/import using jszip. Export uses `@capacitor/share` on iOS, browser download on web.

## Deleted files

- `src/hooks/useAuth.ts`
- `src/context/AuthContext.tsx`
- `src/pages/auth.tsx`
- `src/pages/welcome.tsx`
- `src/lib/apiUrl.ts`

## Key implementation details

**Image URL flow:**
1. At upload time: save blob to Filesystem, call `Filesystem.getUri()` + `convertFileSrc()`, store result in `urlCache` Map.
2. `getImageUrl(filename)` = synchronous cache lookup (returns null if not warmed = shows placeholder).
3. At app startup (`main.tsx`): `warmImageUrls(filenames)` → batch-resolve all filenames → populate cache → THEN render.
4. On web dev: `URL.createObjectURL(blob)` stored at upload time, not persisted across refresh (intentional).

**imageObjectPath field:** Now stores just the filename (`tops-1234567890.jpg`), not the server path.

**RevenueCat:**
- `initializeRevenueCat()` called in `main.tsx` (non-blocking, fire-and-forget).
- `useEntitlements` calls `checkSubscription()` on mount to restore subscriptions across reinstalls.
- `purchaseProduct()` calls `Purchases.purchasePackage({ aPackage: pkg })` — pkg comes from `offerings.current.monthly/annual`.

**Why:** No server needed at runtime → zero infrastructure cost for end users. Works offline. Simpler App Store review (no server dependency). Images included in iCloud backup via Documents dir.
