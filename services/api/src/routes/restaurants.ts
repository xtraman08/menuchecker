import type { FastifyInstance } from 'fastify';
import {
  createRestaurantRequestSchema,
  decodedDishSchema,
  idParamSchema,
  listRestaurantsQuerySchema,
  type CreateRestaurantResponse,
  type RestaurantDetail,
  type RestaurantSummary,
} from '@fare/shared';
import type { Config } from '../config.js';
import { AppError, notFound } from '../errors.js';
import { buildDishCards } from '../matching/service.js';
import type { Deps, NewDish } from '../ports.js';

export async function restaurantRoutes(
  app: FastifyInstance,
  { deps, config }: { deps: Deps; config: Config },
): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  // Save a reviewed menu to the shared library, decoding every dish first so a
  // failed decode saves nothing and the diner can simply retry.
  app.post(
    '/restaurants',
    { config: { rateLimit: app.userRateLimit(config.RATE_LIMIT_DECODE_PER_HOUR) } },
    async (req, reply): Promise<CreateRestaurantResponse> => {
      const body = createRestaurantRequestSchema.parse(req.body);

      const decoded = await deps.llm.decodeDishes({
        cuisine: body.cuisine,
        restaurantName: body.name,
        dishes: body.dishes.map((d) => ({ nativeName: d.nativeName, price: d.price, rawText: d.rawText })),
      });
      if (decoded.length !== body.dishes.length) {
        throw new AppError(502, 'UPSTREAM_ERROR', 'Could not decode every dish, please retry');
      }

      const newDishes: NewDish[] = body.dishes.map((d, i) => {
        const out = decodedDishSchema.safeParse(decoded[i]);
        if (!out.success) throw new AppError(502, 'UPSTREAM_ERROR', 'Could not decode every dish, please retry');
        const dec = out.data;
        // A dish we weren't sure we read correctly can't be decoded with high confidence.
        const lowParse = d.confidence === 'low' || decoded[i]!.confidence === 'low';
        return {
          nativeName: d.nativeName,
          price: d.price,
          rawText: d.rawText ?? null,
          anchor: dec.anchor,
          description: dec.description,
          spice: dec.spice,
          texture: dec.texture,
          adventurousness: dec.adventurousness,
          note: dec.note,
          ingredients: dec.ingredients,
          dietaryTags: dec.dietaryTags,
          confidence: lowParse ? 'low' : 'high',
        };
      });

      const result = await deps.db.withUserTx(req.userId, async (tx) => {
        const restaurant = await tx.createRestaurant({
          name: body.name,
          address: body.address ?? null,
          cuisine: body.cuisine,
        });
        const menu = await tx.createMenu(restaurant.id, body.source);
        const rows = await tx.createDishes(menu.id, newDishes);
        return { restaurant, menuId: menu.id, dishes: await buildDishCards(tx, rows) };
      });
      reply.status(201);
      return result;
    },
  );

  app.get('/restaurants', async (req): Promise<RestaurantSummary[]> => {
    const { q } = listRestaurantsQuerySchema.parse(req.query);
    return deps.db.withUserTx(req.userId, (tx) => tx.listRestaurants(q || undefined));
  });

  app.get('/restaurants/:id', async (req): Promise<RestaurantDetail> => {
    const { id } = idParamSchema.parse(req.params);
    return deps.db.withUserTx(req.userId, async (tx) => {
      const restaurant = await tx.getRestaurant(id);
      if (!restaurant) throw notFound('Restaurant');
      const dishes = await tx.listDishesForRestaurant(id);
      return { restaurant, dishes: await buildDishCards(tx, dishes) };
    });
  });
}
