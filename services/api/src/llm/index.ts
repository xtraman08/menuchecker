// Public surface of the LLM module. Consumed by the API routes (owner: backend).
export { parseMenuImage, SUPPORTED_IMAGE_TYPES, MAX_IMAGE_BYTES } from './parseMenu.js';
export { decodeDishes, DECODE_BATCH_SIZE, MAX_DISHES } from './decode.js';
export { LlmError, LlmConfigError, LlmInputError, LlmOutputError, LlmUpstreamError } from './errors.js';
export {
  setLlmLogger,
  setMessagesApiForTesting,
  type LlmLogger,
  type MessagesApi,
} from './client.js';
export type {
  DecodedDish,
  DecodeInput,
  ParsedDish,
  ParseMenuResult,
  RestaurantGuess,
} from './types.js';
