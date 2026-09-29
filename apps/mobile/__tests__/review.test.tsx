import { fireEvent, render, screen } from '@testing-library/react-native';

import type { ScanResult } from '@/api/types';
import { ReviewForm } from '@/review/ReviewForm';
import {
  activeItems,
  discardedItems,
  initReview,
  reviewReducer,
  saveBlocker,
  toReviewedDishes,
} from '@/review/reviewModel';

const scan: ScanResult = {
  scanId: 'scan-1',
  restaurantGuess: { name: 'Habesha Kitchen', cuisine: 'Ethiopian' },
  dishes: [
    { tempId: 'a', nativeName: 'Kitfo', price: '$18', rawText: 'Kitfo 18', confidence: 'high' },
    { tempId: 'b', nativeName: 'Doro Wot', price: null, rawText: 'Doro W?t', confidence: 'low' },
    {
      tempId: 'c',
      nativeName: 'Open daily 11-10',
      price: null,
      rawText: 'Open daily 11-10',
      confidence: 'low',
    },
  ],
};

describe('reviewReducer', () => {
  it('discards and restores an item without losing edits', () => {
    let s = initReview(scan.dishes);
    s = reviewReducer(s, { type: 'edit', tempId: 'b', field: 'nativeName', value: 'Doro Wat' });
    s = reviewReducer(s, { type: 'discard', tempId: 'b' });
    expect(activeItems(s).map((i) => i.tempId)).toEqual(['a', 'c']);
    expect(discardedItems(s).map((i) => i.tempId)).toEqual(['b']);
    s = reviewReducer(s, { type: 'restore', tempId: 'b' });
    expect(activeItems(s).map((i) => i.tempId)).toEqual(['a', 'b', 'c']);
    expect(s.items.find((i) => i.tempId === 'b')?.nativeName).toBe('Doro Wat');
  });

  it('adds manual entries with unique ids and the manual badge', () => {
    let s = initReview([]);
    s = reviewReducer(s, { type: 'addManual' });
    s = reviewReducer(s, { type: 'addManual' });
    expect(s.items.map((i) => i.tempId)).toEqual(['manual-1', 'manual-2']);
    expect(s.items.every((i) => i.confidence === 'manual')).toBe(true);
  });

  it('blocks saving until the menu is complete', () => {
    let s = initReview(scan.dishes);
    expect(saveBlocker(s, '', 'Ethiopian')).toMatch(/restaurant name/);
    expect(saveBlocker(s, 'Habesha', '')).toMatch(/cuisine/);
    s = reviewReducer(s, { type: 'addManual' });
    expect(saveBlocker(s, 'Habesha', 'Ethiopian')).toMatch(/needs a name/);
    s = reviewReducer(s, { type: 'discard', tempId: 'manual-1' });
    expect(saveBlocker(s, 'Habesha', 'Ethiopian')).toBeNull();
    for (const id of ['a', 'b', 'c']) s = reviewReducer(s, { type: 'discard', tempId: id });
    expect(saveBlocker(s, 'Habesha', 'Ethiopian')).toMatch(/at least one dish/);
  });

  it('sends only active dishes, trimmed, with empty prices as null', () => {
    let s = initReview(scan.dishes);
    s = reviewReducer(s, { type: 'discard', tempId: 'c' });
    s = reviewReducer(s, { type: 'edit', tempId: 'a', field: 'nativeName', value: '  Kitfo ' });
    expect(toReviewedDishes(s)).toEqual([
      { nativeName: 'Kitfo', price: '$18', confidence: 'high', rawText: 'Kitfo 18' },
      { nativeName: 'Doro Wot', price: null, confidence: 'low', rawText: 'Doro W?t' },
    ]);
  });
});

describe('ReviewForm', () => {
  it('shows confidence badges, supports discard/restore/manual add, and saves', () => {
    const onSave = jest.fn();
    render(<ReviewForm draft={scan} onSave={onSave} saving={false} saveError={null} />);

    expect(screen.getByTestId('review-badge-a')).toHaveTextContent('Looks good');
    expect(screen.getByTestId('review-badge-b')).toHaveTextContent('Check this');
    expect(screen.getByTestId('review-restaurant-name').props.value).toBe('Habesha Kitchen');

    fireEvent.press(screen.getByTestId('review-discard-c'));
    expect(screen.queryByTestId('review-item-c')).toBeNull();
    expect(screen.getByTestId('review-discarded-c')).toBeTruthy();
    fireEvent.press(screen.getByTestId('review-restore-c'));
    expect(screen.getByTestId('review-item-c')).toBeTruthy();
    fireEvent.press(screen.getByTestId('review-discard-c'));

    fireEvent.changeText(screen.getByTestId('review-name-b'), 'Doro Wat');
    fireEvent.press(screen.getByTestId('review-add-manual'));
    expect(screen.getByTestId('review-badge-manual-1')).toHaveTextContent('Manual entry');

    fireEvent.press(screen.getByTestId('review-save'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('review-save-blocker')).toHaveTextContent(/needs a name/);

    fireEvent.changeText(screen.getByTestId('review-name-manual-1'), 'Shiro');
    fireEvent.changeText(screen.getByTestId('review-price-manual-1'), '$13');
    fireEvent.press(screen.getByTestId('review-save'));
    expect(onSave).toHaveBeenCalledWith({
      name: 'Habesha Kitchen',
      cuisine: 'Ethiopian',
      source: 'scan',
      dishes: [
        { nativeName: 'Kitfo', price: '$18', confidence: 'high', rawText: 'Kitfo 18' },
        { nativeName: 'Doro Wat', price: null, confidence: 'low', rawText: 'Doro W?t' },
        { nativeName: 'Shiro', price: '$13', confidence: 'manual' },
      ],
    });
  });
});
