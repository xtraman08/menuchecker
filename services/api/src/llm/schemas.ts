// Schemas for what the model is asked to return. Each has two forms:
//  - a JSON Schema sent as `output_config.format` (constrains generation), and
//  - a zod schema we validate with afterwards (the source of truth). The zod
//    schemas build on the shared DTO schemas in @fare/shared and add the
//    stricter rules that only apply to model output (anchor shape, strict keys).
// Nothing the model returns is used until it passes the zod schema.
import {
  confidenceSchema,
  decodedDishSchema,
  DIETARY_RESTRICTIONS,
  restaurantGuessSchema,
} from '@fare/shared';
import { z } from 'zod';

// ---------- parse (vision) ----------

export const ParsedDishOutputSchema = z
  .object({
    nativeName: z.string().trim().min(1).max(120),
    price: z.string().trim().min(1).max(32).nullable(),
    rawText: z.string().trim().max(1000),
    confidence: confidenceSchema,
  })
  .strict();

export const ParseOutputSchema = z
  .object({
    restaurantGuess: restaurantGuessSchema.strict().nullable(),
    dishes: z.array(ParsedDishOutputSchema).max(200),
  })
  .strict();
export type ParseOutput = z.infer<typeof ParseOutputSchema>;

export const PARSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['restaurantGuess', 'dishes'],
  properties: {
    restaurantGuess: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'cuisine'],
          properties: { name: { type: 'string' }, cuisine: { type: 'string' } },
        },
        { type: 'null' },
      ],
    },
    dishes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nativeName', 'price', 'rawText', 'confidence'],
        properties: {
          nativeName: { type: 'string' },
          price: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          rawText: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'low'] },
        },
      },
    },
  },
} as const;

// ---------- decode (text) ----------

/** "Similar to X — <what it is>". Hyphen/en-dash separators are normalised to an em dash first. */
export const ANCHOR_PATTERN = /^Similar to \S.* — \S.*$/;

export function normaliseAnchor(anchor: string): string {
  return anchor.trim().replace(/\s+(?:--|-|–)\s+/, ' — ');
}

export const DecodedDishOutputSchema = decodedDishSchema
  .extend({
    index: z.number().int().min(0),
    anchor: z
      .string()
      .transform(normaliseAnchor)
      .pipe(
        z.string().max(200).regex(ANCHOR_PATTERN, 'anchor must read "Similar to X — <what it is>"'),
      ),
    // An empty note means "no note".
    note: z
      .string()
      .trim()
      .max(200)
      .nullable()
      .transform((n) => n || null),
    confidence: confidenceSchema,
  })
  .strict();

export const DecodeOutputSchema = z.object({ dishes: z.array(DecodedDishOutputSchema) }).strict();
export type DecodeOutput = z.infer<typeof DecodeOutputSchema>;

export const DECODE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dishes'],
  properties: {
    dishes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'index',
          'anchor',
          'description',
          'spice',
          'texture',
          'adventurousness',
          'note',
          'ingredients',
          'dietaryTags',
          'confidence',
        ],
        properties: {
          index: { type: 'integer' },
          anchor: { type: 'string' },
          description: { type: 'string' },
          spice: { type: 'integer', enum: [0, 1, 2, 3] },
          texture: { type: 'string' },
          adventurousness: { type: 'integer', enum: [1, 2, 3] },
          note: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          ingredients: { type: 'array', items: { type: 'string' } },
          dietaryTags: {
            type: 'array',
            items: { type: 'string', enum: [...DIETARY_RESTRICTIONS] },
          },
          confidence: { type: 'string', enum: ['high', 'low'] },
        },
      },
    },
  },
} as const;
