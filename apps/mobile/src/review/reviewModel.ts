// Review/edit state for parsed dishes. Pure reducer so the discard/restore/manual-add
// rules are unit-testable without rendering.
import type { ParseConfidence, ParsedDish, ReviewedDish } from '@/api/types';

export interface ReviewItem {
  tempId: string;
  nativeName: string;
  price: string;
  rawText: string;
  confidence: ParseConfidence;
  discarded: boolean;
}

export interface ReviewState {
  items: ReviewItem[];
  manualCount: number;
}

export type ReviewAction =
  | { type: 'edit'; tempId: string; field: 'nativeName' | 'price'; value: string }
  | { type: 'discard'; tempId: string }
  | { type: 'restore'; tempId: string }
  | { type: 'addManual' };

export function initReview(dishes: ParsedDish[]): ReviewState {
  return {
    items: dishes.map((d) => ({
      tempId: d.tempId,
      nativeName: d.nativeName,
      price: d.price ?? '',
      rawText: d.rawText,
      confidence: d.confidence,
      discarded: false,
    })),
    manualCount: 0,
  };
}

export function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case 'edit':
      return {
        ...state,
        items: state.items.map((i) => (i.tempId === action.tempId ? { ...i, [action.field]: action.value } : i)),
      };
    case 'discard':
    case 'restore': {
      const discarded = action.type === 'discard';
      return {
        ...state,
        items: state.items.map((i) => (i.tempId === action.tempId ? { ...i, discarded } : i)),
      };
    }
    case 'addManual': {
      const manualCount = state.manualCount + 1;
      return {
        manualCount,
        items: [
          ...state.items,
          { tempId: `manual-${manualCount}`, nativeName: '', price: '', rawText: '', confidence: 'manual', discarded: false },
        ],
      };
    }
  }
}

export const badgeLabel: Record<ParseConfidence, string> = {
  high: 'Looks good',
  low: 'Check this',
  manual: 'Manual entry',
};

export function activeItems(state: ReviewState): ReviewItem[] {
  return state.items.filter((i) => !i.discarded);
}

export function discardedItems(state: ReviewState): ReviewItem[] {
  return state.items.filter((i) => i.discarded);
}

/** Returns a reason the menu can't be saved yet, or null when it can. */
export function saveBlocker(state: ReviewState, restaurantName: string, cuisine: string): string | null {
  if (!restaurantName.trim()) return 'Add the restaurant name.';
  if (!cuisine.trim()) return 'Add the cuisine, e.g. Ethiopian.';
  const active = activeItems(state);
  if (active.length === 0) return 'Keep or add at least one dish.';
  if (active.some((i) => !i.nativeName.trim())) return 'Every dish needs a name. Fill it in or discard it.';
  return null;
}

export function toReviewedDishes(state: ReviewState): ReviewedDish[] {
  return activeItems(state).map((i) => ({
    nativeName: i.nativeName.trim(),
    price: i.price.trim() || null,
    confidence: i.confidence,
    ...(i.rawText ? { rawText: i.rawText } : {}),
  }));
}
