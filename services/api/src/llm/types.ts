// Public types of the LLM module (see docs/TEAM_PLAN.md "LLM module interface").
// DTO shapes come from @fare/shared so the API and app agree on them.
import type { Confidence, DecodedDish as SharedDecodedDish } from '@fare/shared';

export type {
  DecodeInput,
  ParsedDish,
  ParsedMenu as ParseMenuResult,
  RestaurantGuess,
} from '@fare/shared';

export interface DecodedDish extends SharedDecodedDish {
  spice: 0 | 1 | 2 | 3;
  adventurousness: 1 | 2 | 3;
  /** 'low' when the model did not recognise the dish or had to infer most of the card. */
  confidence: Confidence;
}
