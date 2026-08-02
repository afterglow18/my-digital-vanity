/**
 * search.ts — scored full-text search across items and saved groups.
 *
 * Field weights:
 *   3 — name, brand
 *   2 — category, color, notes, size, season, occasion, purchasePrice, purchaseDate
 *   2 — group name, group notes
 *   1 — visionLabels, visionText
 */

import type { ClothingItem, SavedOutfit } from '@/types/local';

// ── Helpers ────────────────────────────────────────────────────────────────────

function tokenize(text: string | null | undefined): string[] {
  if (!text) return [];
  return text.toLowerCase().split(/[\s,./\\-]+/).filter(Boolean);
}

function matchScore(tokens: string[], fieldValue: string | null | undefined, weight: number): number {
  if (!fieldValue) return 0;
  const lower = fieldValue.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (lower.includes(token)) score += weight;
  }
  return score;
}

function matchScoreList(tokens: string[], list: string[], weight: number): number {
  let score = 0;
  for (const entry of list) {
    score += matchScore(tokens, entry, weight);
  }
  return score;
}

// ── Item scoring ───────────────────────────────────────────────────────────────

function scoreItem(item: ClothingItem, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  let s = 0;
  s += matchScore(tokens, item.name,          3);
  s += matchScore(tokens, item.brand,         3);
  s += matchScore(tokens, item.category,      2);
  s += matchScore(tokens, item.color,         2);
  s += matchScore(tokens, item.notes,         2);
  s += matchScore(tokens, item.size,          2);
  s += matchScore(tokens, item.season,        2);
  s += matchScore(tokens, item.occasion,      2);
  s += matchScore(tokens, item.purchasePrice, 2);
  s += matchScore(tokens, item.purchaseDate,  2);
  s += matchScoreList(tokens, item.visionLabels ?? [], 1);
  s += matchScoreList(tokens, item.visionText  ?? [], 1);
  return s;
}

// ── Group scoring ──────────────────────────────────────────────────────────────

function scoreGroup(outfit: SavedOutfit, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  let s = 0;
  s += matchScore(tokens, outfit.name,  2);
  s += matchScore(tokens, outfit.notes, 2);
  for (const item of outfit.items ?? []) {
    s += scoreItem(item, tokens) * 0.5; // items inside a group contribute at half weight
  }
  return s;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface SearchResults {
  items:  ClothingItem[];
  groups: SavedOutfit[];
}

/**
 * Search items and groups by query.
 * Returns { items, groups } sorted by score (highest first), deduplicated by id.
 * Both arrays are empty when query is blank.
 */
export function searchLookbook(
  query: string,
  items: ClothingItem[],
  outfits: SavedOutfit[],
): SearchResults {
  const tokens = tokenize(query);
  if (tokens.length === 0) return { items: [], groups: [] };

  // Score and filter items
  const scoredItems = items
    .map((item) => ({ item, score: scoreItem(item, tokens) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  // Score and filter groups (deduplicated by id)
  const scoredGroups = outfits
    .map((g) => ({ group: g, score: scoreGroup(g, tokens) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  return {
    items:  scoredItems.map(({ item  }) => item),
    groups: scoredGroups.map(({ group }) => group),
  };
}
