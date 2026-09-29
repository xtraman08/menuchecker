import sharp from 'sharp';
import { AppError } from '../errors.js';

/** Client-declared types we accept. The real format is checked from the bytes. */
export const ACCEPTED_UPLOAD_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']);
const DECODABLE_FORMATS = new Set(['jpeg', 'png', 'webp', 'heif']);
const MAX_INPUT_PIXELS = 50_000_000;

export interface SanitizedImage {
  data: Buffer;
  mime: 'image/jpeg';
  width: number;
  height: number;
}

/**
 * Re-encodes an uploaded menu photo as a plain JPEG: applies EXIF orientation,
 * then drops ALL metadata (EXIF incl. GPS, XMP, ICC, IPTC) — sharp writes none
 * unless asked — and downsizes to `maxEdge` on the longest side.
 */
export async function sanitizeImage(input: Buffer, maxEdge: number): Promise<SanitizedImage> {
  let format: string | undefined;
  try {
    format = (await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()).format;
  } catch {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'The upload is not a readable image');
  }
  if (!format || !DECODABLE_FORMATS.has(format)) {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Upload a JPEG, PNG or HEIC photo');
  }
  try {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { data, mime: 'image/jpeg', width: info.width, height: info.height };
  } catch {
    // e.g. HEIC variants the bundled libvips can't decode.
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Could not read this photo; try a JPEG or PNG');
  }
}
