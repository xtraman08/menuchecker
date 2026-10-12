import { fireEvent, render, screen } from '@testing-library/react-native';

import type { DishCard as Dish } from '@/api/types';
import { DishCard } from '@/components/DishCard';

const base: Dish = {
  id: 'kitfo',
  nativeName: 'Kitfo',
  photoUrl: 'https://example.com/kitfo.jpg',
  anchor: 'Similar to steak tartare — minced raw beef in spiced butter',
  description: 'Lean beef tossed in niter kibbeh and mitmita.',
  spice: 2,
  texture: 'Soft, rich',
  adventurousness: 3,
  note: 'Ask for it cooked if raw isn’t your thing',
  price: '$18',
  source: 'ai_generated',
  confidence: 'high',
  matchScore: null,
  matchState: 'unrated',
  matchExplanation: null,
  matchExplanationKind: null,
  dietaryTags: [],
  feedbackUp: 0,
  feedbackDown: 0,
};

const make = (over: Partial<Dish> = {}): Dish => ({ ...base, ...over });

describe('DishCard comprehension content', () => {
  it('keeps the native name and shows anchor, description and signals', () => {
    render(<DishCard dish={make()} />);
    expect(screen.getByTestId('dish-card-name-kitfo')).toHaveTextContent('Kitfo');
    expect(screen.getByTestId('dish-card-price-kitfo')).toHaveTextContent('$18');
    expect(screen.getByTestId('dish-card-anchor-kitfo')).toHaveTextContent(/steak tartare/);
    expect(screen.getByTestId('dish-card-description-kitfo')).toBeTruthy();
    expect(screen.getByTestId('dish-card-spice-kitfo')).toHaveTextContent(/Medium/);
    expect(screen.getByTestId('dish-card-texture-kitfo')).toHaveTextContent(/Soft, rich/);
    expect(screen.getByTestId('dish-card-adventurousness-kitfo')).toHaveTextContent(/Adventurous/);
    expect(screen.getByTestId('dish-card-note-kitfo')).toBeTruthy();
  });

  it('labels AI-generated content', () => {
    render(<DishCard dish={make()} />);
    expect(screen.getByTestId('dish-card-source-kitfo')).toHaveTextContent(/AI-written/);
  });

  it('shows diner/restaurant provenance instead of the AI label once refined', () => {
    render(<DishCard dish={make({ source: 'diner_refined' })} />);
    expect(screen.getByTestId('dish-card-source-kitfo')).toHaveTextContent('Refined by diners');
    expect(screen.queryByText(/AI-written/)).toBeNull();
  });

  it('flags low-confidence descriptions', () => {
    render(<DishCard dish={make({ confidence: 'low' })} />);
    expect(screen.getByTestId('dish-card-low-confidence-kitfo')).toBeTruthy();
  });

  it('uses a placeholder when the photo is missing', () => {
    render(<DishCard dish={make({ photoUrl: null })} />);
    expect(screen.getByTestId('dish-card-photo-placeholder-kitfo')).toBeTruthy();
    expect(screen.queryByTestId('dish-card-photo-kitfo')).toBeNull();
  });

  it('falls back to the placeholder when the photo fails to load', () => {
    render(<DishCard dish={make()} />);
    fireEvent(screen.getByTestId('dish-card-photo-kitfo'), 'error');
    expect(screen.getByTestId('dish-card-photo-placeholder-kitfo')).toBeTruthy();
  });
});

describe('DishCard match indicator', () => {
  it('unrated: shows "Still learning your taste" and no number', () => {
    render(<DishCard dish={make()} />);
    expect(screen.getByTestId('dish-card-match-unrated-kitfo')).toHaveTextContent(
      'Still learning your taste',
    );
    expect(screen.queryByTestId('dish-card-match-score-kitfo')).toBeNull();
  });

  it('unrated: never shows a score even if one is present', () => {
    render(<DishCard dish={make({ matchScore: 77, matchState: 'unrated' })} />);
    expect(screen.queryByTestId('dish-card-match-score-kitfo')).toBeNull();
    expect(screen.queryByText('77')).toBeNull();
  });

  it('preliminary: shows the score labelled as an early estimate', () => {
    render(<DishCard dish={make({ matchScore: 64, matchState: 'preliminary' })} />);
    expect(screen.getByTestId('dish-card-match-score-kitfo')).toHaveTextContent('64');
    expect(screen.getByTestId('dish-card-match-state-kitfo')).toHaveTextContent('Early estimate');
    // Comprehension stays on the card alongside the score.
    expect(screen.getByTestId('dish-card-anchor-kitfo')).toBeTruthy();
  });

  it('confident: shows the score with the confident label', () => {
    render(<DishCard dish={make({ matchScore: 88, matchState: 'confident' })} />);
    expect(screen.getByTestId('dish-card-match-score-kitfo')).toHaveTextContent('88');
    expect(screen.getByTestId('dish-card-match-state-kitfo')).toHaveTextContent(
      'Based on solid feedback',
    );
  });

  it('never shows a bare score when the comprehension content is missing', () => {
    render(<DishCard dish={make({ anchor: '', matchScore: 90, matchState: 'confident' })} />);
    expect(screen.queryByTestId('dish-card-match-score-kitfo')).toBeNull();
    expect(screen.getByTestId('dish-card-match-unrated-kitfo')).toBeTruthy();
  });

  it('shows the dietary-conflict reason with a zero score', () => {
    render(
      <DishCard
        dish={make({
          matchScore: 0,
          matchState: 'preliminary',
          matchExplanation: "Contains beef, which doesn't fit vegetarian",
        })}
      />,
    );
    expect(screen.getByTestId('dish-card-match-reason-kitfo')).toHaveTextContent(/vegetarian/);
  });
});

describe('DishCard variants', () => {
  it('unfamiliar: hero photo and full description', () => {
    render(<DishCard dish={make()} variant="unfamiliar" />);
    expect(screen.queryByTestId('dish-card-compact-kitfo')).toBeNull();
    expect(screen.getByTestId('dish-card-description-kitfo').props.numberOfLines).toBeUndefined();
  });

  it('familiar: compact header, shorter description, still shows anchor', () => {
    render(<DishCard dish={make()} variant="familiar" />);
    expect(screen.getByTestId('dish-card-compact-kitfo')).toBeTruthy();
    expect(screen.getByTestId('dish-card-description-kitfo').props.numberOfLines).toBe(2);
    expect(screen.getByTestId('dish-card-anchor-kitfo')).toBeTruthy();
    expect(screen.getByTestId('dish-card-match-kitfo')).toBeTruthy();
  });
});

describe('DishCard actions', () => {
  it('calls add and feedback handlers and shows the order count', () => {
    const onAdd = jest.fn();
    const onFeedback = jest.fn();
    const { rerender } = render(<DishCard dish={make()} onAdd={onAdd} onFeedback={onFeedback} />);
    fireEvent.press(screen.getByTestId('dish-card-add-kitfo'));
    fireEvent.press(screen.getByTestId('dish-card-feedback-kitfo'));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onFeedback).toHaveBeenCalledTimes(1);
    rerender(<DishCard dish={make()} onAdd={onAdd} inOrder={2} />);
    expect(screen.getByTestId('dish-card-add-kitfo')).toHaveTextContent('Add another (2)');
  });
});

describe('DishCard dietary caveat', () => {
  const caveat = 'Dietary info is AI-generated — verify with the restaurant';

  it('shows the caveat next to a dietary note', () => {
    render(<DishCard dish={make({ note: 'Vegan' })} />);
    expect(screen.getByTestId('dish-card-note-caveat-kitfo')).toHaveTextContent(caveat);
  });

  it('shows the caveat next to a dietary match explanation, even while unrated', () => {
    render(
      <DishCard
        dish={make({ matchExplanation: 'Not marked vegan', matchExplanationKind: 'dietary' })}
      />,
    );
    expect(screen.getByTestId('dish-card-match-reason-kitfo')).toHaveTextContent(
      'Not marked vegan',
    );
    expect(screen.getByTestId('dish-card-match-caveat-kitfo')).toHaveTextContent(caveat);
  });

  it('shows the caveat with a scored dietary conflict', () => {
    render(
      <DishCard
        dish={make({
          matchScore: 0,
          matchState: 'confident',
          matchExplanation: 'Not suitable: vegetarian',
          matchExplanationKind: 'dietary',
        })}
      />,
    );
    expect(screen.getByTestId('dish-card-match-caveat-kitfo')).toHaveTextContent(caveat);
  });

  it('shows AI dietary tags with the caveat, even for restaurant-verified dishes', () => {
    render(
      <DishCard
        dish={make({
          note: null,
          dietaryTags: ['vegan', 'gluten_free'],
          source: 'restaurant_verified',
        })}
      />,
    );
    expect(screen.getByTestId('dish-card-diet-tags-kitfo')).toHaveTextContent(/vegan/);
    expect(screen.getByTestId('dish-card-note-caveat-kitfo')).toHaveTextContent(caveat);
  });

  it('drives the explanation caveat from matchExplanationKind, not wording', () => {
    render(
      <DishCard
        dish={make({ matchExplanation: 'Might not suit you', matchExplanationKind: 'dietary' })}
      />,
    );
    expect(screen.getByTestId('dish-card-match-caveat-kitfo')).toHaveTextContent(caveat);
  });

  it('omits the caveat for non-dietary notes and explanations', () => {
    render(
      <DishCard
        dish={make({
          note: 'Ask for it cooked',
          matchScore: 50,
          matchState: 'preliminary',
          // Diet wording without the dietary kind must not trigger the caveat.
          matchExplanation: 'Contains beef you asked to avoid',
          matchExplanationKind: 'ingredients',
        })}
      />,
    );
    expect(screen.queryByTestId('dish-card-note-caveat-kitfo')).toBeNull();
    expect(screen.queryByTestId('dish-card-match-caveat-kitfo')).toBeNull();
  });
});
