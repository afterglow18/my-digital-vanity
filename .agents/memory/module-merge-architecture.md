---
name: Module merge architecture
description: How the 6-module merged app is structured after the 4.3(a) merge
---

## The merged binary (artifacts/outfit-generator)

One Capacitor binary contains 6 independent collections:

| Route prefix | Module | DB name | Welcome key |
|---|---|---|---|
| `/closet/*` | Closet (existing) | localStorage | `sessionStorage mdc_entered` |
| `/handbags/*` | Handbags | `mdc-handbags` | `mdc_handbags_welcomed` |
| `/shoes/*` | Shoes | `mdc-shoes` | `mdc_shoes_welcomed` |
| `/jewelry/*` | Jewelry | `mdc-jewelry` | `mdc_jewelry_welcomed` |
| `/vanity/*` | Vanity | `mdc-vanity` | `mdc_vanity_welcomed` |
| `/suitcase/*` | Suitcase | `mdc-suitcase` | `mdc_suitcase_welcomed` |

Hub lives at `/` (HubPage.tsx) — 6 collection cards.

## File layout for each non-closet module

```
src/modules/{module}/
  {Module}Module.tsx          # entry point — welcome gate + wouter Switch
  components/
    layout/ModuleLayout.tsx   # nav bar + "← Collections" back link
    {Module}Row.tsx           # renamed ClosetRow
    SwipeRow.tsx
    clothing/                 # 6 clothing sheet components
  hooks/
    useLocalWardrobe.ts       # IndexedDB CRUD via idb + react-query
    useLocalOutfits.ts
  lib/
    db.ts                     # IDB schema (DB name = mdc-{module})
    backup.ts
    localDB.ts (suitcase only)
  pages/
    wardrobe, generate, saved, favorites, account, welcome, hero-splash, not-found
```

## Shared types

`src/types/local.ts` — `ClothingItem` (id: string), `SavedOutfit`, `WardrobeStats`, `CreateClothingData`, `UpdateClothingData`, `Tier`, `TIER_CAPS`, `FREE_ITEM_LIMIT`, `PRODUCT_PRICES`.
`ClothingCategory = string` (each module narrows locally).

**Note:** Closet module uses localStorage (not IndexedDB) and its own `src/lib/db.ts` types. Closet's `ClothingItem.id` is `number`, modules use `string` (UUID). The two type trees don't overlap.

## Public assets

All module images live in `public/{module}/` to avoid filename conflicts (every app had a `closet-bg.png`).

## idb package

`idb` (^8.0.3) added to `artifacts/outfit-generator/package.json` — needed by all 5 non-closet modules.

## useEntitlements additions

Added `restore()` (wraps `restorePurchases()` from revenuecat.ts) and `readStoredProduct()` / `writeStoredProduct()` for module account pages.

## Suitcase quirk

Suitcase uses integer autoincrement IDs (`id?: number`) internally (StoredClothingItem), exposed as `ClothingItem` in hooks. Different from other modules which use UUID strings. Suitcase also has `lib/localDB.ts` (separate CRUD layer) in addition to `lib/db.ts` (schema).

**Why:** Suitcase was built with a more complex multi-table schema (outfit_items junction table) from the start.
