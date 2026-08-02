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

/**
 * Color synonym map: maps a natural-language color word to the canonical label(s)
 * produced by the canvas color extractor.  Expansion is one-way (query only) so
 * no re-indexing of stored items is needed.
 */
const COLOR_SYNONYMS: Record<string, string[]> = {
  // Pinks / reds
  rose:       ['pink'],
  blush:      ['pink'],
  bubblegum:  ['pink'],
  fuchsia:    ['pink', 'purple'],
  magenta:    ['pink', 'purple'],
  crimson:    ['red'],
  scarlet:    ['red'],
  cherry:     ['red'],
  ruby:       ['red'],
  wine:       ['red', 'purple'],
  burgundy:   ['red', 'purple'],
  maroon:     ['red', 'brown'],
  mauve:      ['pink', 'purple'],
  // Oranges / corals
  coral:      ['pink', 'orange'],
  salmon:     ['pink', 'orange'],
  peach:      ['orange', 'beige'],
  terracotta: ['orange', 'brown'],
  rust:       ['orange', 'brown'],
  // Yellows / golds
  gold:       ['yellow'],
  golden:     ['yellow'],
  champagne:  ['gold', 'beige'],
  mustard:    ['yellow'],
  lemon:      ['yellow'],
  // Greens
  olive:      ['green'],
  sage:       ['green'],
  mint:       ['green'],
  forest:     ['green'],
  lime:       ['green'],
  emerald:    ['green'],
  hunter:     ['green'],
  // Blues / teals
  navy:       ['blue'],
  cobalt:     ['blue'],
  royal:      ['blue'],
  sky:        ['blue'],
  turquoise:  ['teal', 'blue'],
  aqua:       ['teal', 'blue'],
  cyan:       ['teal', 'blue'],
  // Purples
  lavender:   ['purple'],
  lilac:      ['purple'],
  violet:     ['purple'],
  plum:       ['purple'],
  indigo:     ['purple', 'blue'],
  // Neutrals / skin tones
  nude:       ['beige'],
  ivory:      ['white', 'beige'],
  cream:      ['white', 'beige'],
  off:        ['white'],       // "off-white"
  ecru:       ['beige'],
  sand:       ['beige', 'tan'],
  camel:      ['tan', 'brown'],
  khaki:      ['tan', 'beige'],
  taupe:      ['tan', 'grey'],
  mocha:      ['brown'],
  chocolate:  ['brown'],
  espresso:   ['brown'],
  // Greys / blacks / whites
  charcoal:   ['grey'],
  slate:      ['grey'],
  silver:     ['grey'],
  ash:        ['grey'],
  onyx:       ['black'],
  jet:        ['black'],
};

/**
 * Expand query tokens with color synonyms.
 * Each token that appears in the synonym map is kept AND its canonical equivalents
 * are added, so "rose" becomes ["rose", "pink"].
 * Duplicate tokens are removed.
 */
export function expandTokens(tokens: string[]): string[] {
  const expanded = new Set<string>(tokens);
  for (const token of tokens) {
    const synonyms = COLOR_SYNONYMS[token];
    if (synonyms) {
      for (const s of synonyms) expanded.add(s);
    }
  }
  return Array.from(expanded);
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
  const tokens = expandTokens(tokenize(query));
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
