import type { FastifyInstance } from 'fastify';
import { feedbackRequestSchema, idParamSchema, type FeedbackResponse } from '@fare/shared';
import { notFound } from '../errors.js';
import { buildDishCards } from '../matching/service.js';
import type { Deps } from '../ports.js';

export async function dishRoutes(app: FastifyInstance, { deps }: { deps: Deps }): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  // Records (or updates) this diner's feedback. The DB trigger refreshes the
  // dish's feedback counters and invalidates cached matches for the dish, so
  // the card returned here carries a freshly computed match.
  app.post(
    '/dishes/:id/feedback',
    { config: { rateLimit: { max: 120, timeWindow: '1 hour', keyGenerator: app.userRateKey } } },
    async (req): Promise<FeedbackResponse> => {
      const { id } = idParamSchema.parse(req.params);
      const body = feedbackRequestSchema.parse(req.body);
      return deps.db.withUserTx(req.userId, async (tx) => {
        if (!(await tx.getDish(id))) throw notFound('Dish');
        await tx.upsertFeedback({ dishId: id, ...body });
        const dish = await tx.getDish(id);
        const [card] = dish ? await buildDishCards(tx, [dish]) : [];
        if (!card) throw notFound('Dish');
        return { dish: card };
      });
    },
  );
}
