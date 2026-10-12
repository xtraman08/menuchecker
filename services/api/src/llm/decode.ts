// Text pass: reviewed dishes -> first-pass dish card fields (saved as source 'ai_generated').
import { getLogger } from './client.js';
import { guardDietaryTags } from './dietaryGuard.js';
import { LlmInputError } from './errors.js';
import { DECODE_SYSTEM_PROMPT, decodeUserText } from './prompts.js';
import { DECODE_JSON_SCHEMA, DecodeOutputSchema, type DecodeOutput } from './schemas.js';
import { callStructured } from './structured.js';
import type { DecodedDish, DecodeInput } from './types.js';

/** Dishes per request. Keeps each response well under max_tokens and a retry cheap. */
export const DECODE_BATCH_SIZE = 15;
export const MAX_DISHES = 200;

/**
 * Decodes every dish. The result has the same length and order as `input.dishes`.
 * Native names are never taken from the model: the caller keeps its own copy.
 */
export async function decodeDishes(
  input: DecodeInput,
  opts: { signal?: AbortSignal } = {},
): Promise<DecodedDish[]> {
  if (!input.dishes.length) return [];
  if (input.dishes.length > MAX_DISHES) {
    throw new LlmInputError(`too many dishes (${input.dishes.length}); the limit is ${MAX_DISHES}`);
  }
  if (input.dishes.some((d) => !d.nativeName.trim())) {
    throw new LlmInputError('every dish needs a nativeName');
  }

  const batches: DecodeInput['dishes'][] = [];
  for (let i = 0; i < input.dishes.length; i += DECODE_BATCH_SIZE) {
    batches.push(input.dishes.slice(i, i + DECODE_BATCH_SIZE));
  }

  // Batches are independent; run them concurrently (the SDK handles 429 backoff).
  const results = await Promise.all(
    batches.map((dishes) => decodeBatch({ ...input, dishes }, opts.signal)),
  );
  return results.flat();
}

async function decodeBatch(input: DecodeInput, signal?: AbortSignal): Promise<DecodedDish[]> {
  const n = input.dishes.length;
  const output = await callStructured({
    label: 'decode',
    system: DECODE_SYSTEM_PROMPT,
    content: [{ type: 'text', text: decodeUserText(input) }],
    jsonSchema: DECODE_JSON_SCHEMA,
    schema: DecodeOutputSchema,
    check: (o) => indexProblems(o, n),
    signal,
  });

  const byIndex = new Map(output.dishes.map((d) => [d.index, d]));
  return input.dishes.map((dish, i) => {
    const { index: _index, ...card } = byIndex.get(i)!;
    const guarded = guardDietaryTags(card.dietaryTags, card.ingredients);
    if (guarded.dropped.length) {
      getLogger().warn(
        { llm: 'decode', nativeName: dish.nativeName, droppedTags: guarded.dropped },
        'dropped dietary tags contradicted by ingredients',
      );
    }
    return {
      ...card,
      spice: card.spice as DecodedDish['spice'],
      adventurousness: card.adventurousness as DecodedDish['adventurousness'],
      dietaryTags: guarded.tags,
    };
  });
}

function indexProblems(output: DecodeOutput, n: number): string[] {
  const problems: string[] = [];
  if (output.dishes.length !== n) {
    problems.push(`expected ${n} dishes, got ${output.dishes.length}`);
  }
  const seen = new Set<number>();
  for (const d of output.dishes) {
    if (d.index >= n) problems.push(`index ${d.index} is out of range 0-${n - 1}`);
    if (seen.has(d.index)) problems.push(`index ${d.index} appears more than once`);
    seen.add(d.index);
  }
  for (let i = 0; i < n; i++) if (!seen.has(i)) problems.push(`missing index ${i}`);
  return problems;
}
