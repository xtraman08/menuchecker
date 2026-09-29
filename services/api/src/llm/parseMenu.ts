// Vision pass: menu photo -> restaurant guess + parsed dishes with honest confidence.
import { randomUUID } from 'node:crypto';
import { LlmInputError } from './errors.js';
import { PARSE_SYSTEM_PROMPT, PARSE_USER_INSTRUCTION } from './prompts.js';
import { PARSE_JSON_SCHEMA, ParseOutputSchema } from './schemas.js';
import { callStructured } from './structured.js';
import type { ParsedDish, ParseMenuResult } from './types.js';

export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

/** Claude API per-image limit. The upload route should downscale before calling us. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function parseMenuImage(
  image: Buffer,
  mime: string,
  opts: { signal?: AbortSignal } = {},
): Promise<ParseMenuResult> {
  const mediaType = normaliseMime(mime);
  if (!image.length) throw new LlmInputError('image is empty');
  if (image.length > MAX_IMAGE_BYTES) {
    throw new LlmInputError(`image is ${image.length} bytes; the limit is ${MAX_IMAGE_BYTES}`);
  }

  const output = await callStructured({
    label: 'parse',
    system: PARSE_SYSTEM_PROMPT,
    content: [
      { type: 'text', text: '<menu_image>' },
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: image.toString('base64') } },
      { type: 'text', text: '</menu_image>' },
      { type: 'text', text: PARSE_USER_INSTRUCTION },
    ],
    jsonSchema: PARSE_JSON_SCHEMA,
    schema: ParseOutputSchema,
    signal: opts.signal,
  });

  const dishes: ParsedDish[] = output.dishes.map((d) => ({
    tempId: randomUUID(),
    nativeName: d.nativeName,
    price: d.price,
    rawText: d.rawText,
    confidence: d.confidence,
  }));
  return output.restaurantGuess ? { restaurantGuess: output.restaurantGuess, dishes } : { dishes };
}

function normaliseMime(mime: string): SupportedImageType {
  const m = mime.toLowerCase().split(';')[0]!.trim();
  const mapped = m === 'image/jpg' ? 'image/jpeg' : m;
  if ((SUPPORTED_IMAGE_TYPES as readonly string[]).includes(mapped)) return mapped as SupportedImageType;
  throw new LlmInputError(
    `unsupported image type "${mime}"; convert to JPEG or PNG first (HEIC is not accepted by the model)`,
  );
}
