import type { FastifyInstance } from 'fastify';
import { tasteProfileSchema, type TasteProfile } from '@fare/shared';
import { notFound } from '../errors.js';
import type { Deps } from '../ports.js';

export async function meRoutes(app: FastifyInstance, { deps }: { deps: Deps }): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  /** 404 until the diner has saved a profile (the app shows onboarding then). */
  app.get('/me/taste-profile', async (req): Promise<TasteProfile> => {
    const profile = await deps.db.withUserTx(req.userId, (tx) => tx.getTasteProfile());
    if (!profile) throw notFound('Taste profile');
    return profile;
  });

  // Saving the profile invalidates this diner's cached matches (DB trigger);
  // they're recomputed on the next read of each menu.
  app.put('/me/taste-profile', async (req): Promise<TasteProfile> => {
    const profile = tasteProfileSchema.parse(req.body);
    return deps.db.withUserTx(req.userId, (tx) => tx.upsertTasteProfile(profile));
  });
}
