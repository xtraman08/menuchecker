import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { scanResponseSchema, type ScanResponse } from '@fare/shared';
import type { Config } from '../config.js';
import { AppError } from '../errors.js';
import type { Deps } from '../ports.js';
import { ACCEPTED_UPLOAD_TYPES, sanitizeImage } from '../upload/image.js';

export async function scanRoutes(
  app: FastifyInstance,
  { deps, config }: { deps: Deps; config: Config },
): Promise<void> {
  app.post(
    '/scans',
    {
      preHandler: app.authenticate,
      bodyLimit: config.MAX_UPLOAD_BYTES + 64 * 1024,
      config: { rateLimit: app.userRateLimit(config.RATE_LIMIT_SCAN_PER_HOUR) },
    },
    async (req): Promise<ScanResponse> => {
      if (!req.isMultipart()) {
        throw new AppError(
          415,
          'UNSUPPORTED_MEDIA_TYPE',
          'Send the photo as multipart/form-data field "image"',
        );
      }

      let upload: Buffer | undefined;
      for await (const part of req.parts()) {
        if (part.type !== 'file') continue;
        if (part.fieldname !== 'image' || upload) {
          part.file.resume();
          throw new AppError(400, 'BAD_REQUEST', 'Send exactly one file in the "image" field');
        }
        if (!ACCEPTED_UPLOAD_TYPES.has(part.mimetype)) {
          part.file.resume();
          throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Upload a JPEG, PNG or HEIC photo');
        }
        upload = await part.toBuffer(); // throws 413 past MAX_UPLOAD_BYTES
      }
      if (!upload?.length) throw new AppError(400, 'BAD_REQUEST', 'Missing "image" file');

      const image = await sanitizeImage(upload, config.MAX_IMAGE_EDGE);
      const parsed = await deps.llm.parseMenuImage(image.data, image.mime);
      const out = scanResponseSchema.safeParse({ scanId: randomUUID(), ...parsed });
      if (!out.success) {
        req.log.error(
          { issues: out.error.issues.slice(0, 5) },
          'parse output failed the shared schema',
        );
        throw new AppError(502, 'UPSTREAM_ERROR', 'Could not read this menu, please retry');
      }
      return out.data;
    },
  );
}
