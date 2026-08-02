/**
 * search.ts
 * Full-text search across locally stored items and outfit groups.
 * Every token in the query must match at least one field for an item to appear.
 * Field weights: name/brand (10) > category/color/notes (5/5/4) >
 *   size/season/occasion (3) > price/date (2) > vision fields (1).
 */

import type { ClothingItem, Outfit } from './db';

export interface ItemSearchResult  { kind: 'item';  item:   ClothingItem; score: number }
export interface GroupSearchResult { kind: 'group'; outfit: Outfit;       score: number }

interface FieldSpec { get: (i: ClothingItem) => string; weight: number }

const ITEM_FIELDS: FieldSpec[] = [
  { get: (i) => i.name          ?? '', weight: 10 },
  { get: (i) => i.brand         ?? '', weight: 10 },
  { get: (i) => i.category      ?? '', weight:  5 },
  { get: (i) => i.color         ?? '', weight:  5 },
  { get: (i) => i.notes         ?? '', weight:  4 },
  { get: (i) => i.size          ?? '', weight:  3 },
  { get: (i) => i.season        ?? '', weight:  3 },
  { get: (i) => i.occasion      ?? '', weight:  3 },
  { get: (i) => i.purchasePrice ?? '', weight:  2 },
  { get: (i) => i.purchaseDate  ?? '', weight:  2 },
  // Vision fields — cast because they aren't in the base interface yet
  { get: (i) => ((i as any).visionLabels as string[] | undefined)?.join(' ') ?? '', weight: 1 },
  { get: (i) => ((i as any).visionText   as string[] | undefined)?.join(' ') ?? '', weight: 1 },
];

function scoreItem(item: ClothingItem, tokens: string[]): number {
  let total = 0;
  for (const token of tokens) {
    let tokenScore = 0;
    for (const { get, weight } of ITEM_FIELDS) {
      if (get(item).toLowerCase().includes(token)) tokenScore += weight;
    }
    if (tokenScore === 0) return 0; // all tokens must match
    total += tokenScore;
  }
  return total;
}

function scoreGroupText(outfit: Outfit, tokens: string[]): number {
  let total = 0;
  for (const token of tokens) {
    const nameHit  = (outfit.name  ?? '').toLowerCase().includes(token) ? 8 : 0;
    const notesHit = (outfit.notes ?? '').toLowerCase().includes(token) ? 4 : 0;
    total += Math.max(nameHit, notesHit);
  }
  return total;
}

export function search(
  query: string,
  items: ClothingItem[],
  outfits: Outfit[],
): { items: ItemSearchResult[]; groups: GroupSearchResult[] } {
  const q = query.trim().toLowerCase();
  if (!q) return { items: [], groups: [] };
  const tokens = q.split(/\s+/).filter(Boolean);

  // Score items
  const itemResults: ItemSearchResult[] = [];
  for (const item of items) {
    const score = scoreItem(item, tokens);
    if (score > 0) itemResults.push({ kind: 'item', item, score });
  }
  itemResults.sort((a, b) => b.score - a.score);

  // Score groups — matches by name/notes OR by containing a matching item
  const matchedItemIds = new Set(itemResults.map((r) => r.item.id));
  const groupResults: GroupSearchResult[] = [];
  for (const outfit of outfits) {
    const textScore = scoreGroupText(outfit, tokens);
    const hasMatchingItem = (outfit.items ?? []).some((i) => matchedItemIds.has(i.id));
    const score = textScore + (hasMatchingItem ? 3 : 0);
    if (score > 0) groupResults.push({ kind: 'group', outfit, score });
  }
  groupResults.sort((a, b) => b.score - a.score);

  return { items: itemResults, groups: groupResults };
}
