# db — Fare Postgres schema

Plain-SQL migrations, a tiny runner, and dev/E2E seed data. Owner: `database` agent.

```
npm run migrate -w db   # applies db/migrations/*.sql   (DATABASE_MIGRATE_URL, role fare_owner)
npm run seed -w db      # loads db/seed/seed.sql        (idempotent)
```

## Roles

| Role         | Used by                             | Notes                                                                                                                    |
| ------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `fare_owner` | migrations, seed                    | Owns every table; RLS is not forced, so it bypasses policies.                                                            |
| `fare_app`   | the API at runtime (`DATABASE_URL`) | `NOBYPASSRLS`, least-privilege grants, no `DELETE` on shared content, can't change `dishes.source` or feedback counters. |

Both roles are created by the compose `db` init script (devops); migrations only grant.

## Migrations

- Files are `db/migrations/NNNN_name.sql`, applied in order, each in its own transaction, recorded in `schema_migrations` with a sha256 checksum.
- Re-running is a no-op. **Never edit an applied migration** — the runner refuses to run; add a new file.
- Concurrent runners serialise on a Postgres advisory lock.

## Row-level security

Every table has RLS enabled and no access without a matching policy (default deny).
The API runs each request in a transaction via `withUserTx(userId, fn)` (`services/api/src/db/tx.ts`), which calls `set_config('app.user_id', $1, true)`; policies read it through `app_current_user_id()` (null when unset → nothing visible).

| Table                                             | Read                                     | Write                                                                                                      |
| ------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `users`                                           | own row                                  | insert own row                                                                                             |
| `restaurants`, `menus`, `dishes`                  | any authenticated diner (shared library) | insert as creator; menus/dishes only on your own restaurant/menu; dish content updates by the creator only |
| `dish_feedback`, `taste_profiles`, `dish_matches` | own rows                                 | own rows                                                                                                   |

Cross-diner aggregates are exposed only as counts:

- `dishes.feedback_up` / `feedback_down` — accurate true/false counts, kept in sync by a trigger.
- `dish_feedback_stats(uuid[])` — `SECURITY DEFINER` function returning entries, accurate/liked counts and `liked_rate` per dish.

### Cache invalidation (triggers)

- Any insert/update/delete on `dish_feedback` deletes **all** diners' `dish_matches` rows for that dish.
- Any insert/update on `taste_profiles` deletes that diner's `dish_matches`.

So the API's pattern is: on read, compute and upsert matches for dishes whose `matchCached` is false.

## Seed fixtures (fixed UUIDs, used by E2E)

| Fixture                                       | id                                     |
| --------------------------------------------- | -------------------------------------- |
| Selam Ethiopian Kitchen (8 dishes)            | `11111111-1111-4111-8111-111111111111` |
| Le Petit Coin, French bistro (6 dishes)       | `22222222-2222-4222-8222-222222222222` |
| Kitfo — no feedback (stays `unrated`)         | `11111111-0000-4000-8000-000000000101` |
| Doro Wat — 10 diners (9 accurate, 8 liked)    | `11111111-0000-4000-8000-000000000102` |
| Steak frites — 3 diners (3 accurate, 2 liked) | `22222222-0000-4000-8000-000000000103` |

All seeded dishes are decoded; `photo_url` is null (placeholder state). Doro Wat is `diner_refined`, everything else `ai_generated`.

## Tests

Integration tests live in `services/api/src/db/__tests__/*.integration.test.ts` and run against a real Postgres.
Set `TEST_DATABASE_ADMIN_URL` to a superuser URL; each suite creates (and drops) its own `fare_test_*` database, creating the two roles if missing:

```
TEST_DATABASE_ADMIN_URL=postgres://postgres:postgres@localhost:5432/postgres npm test -w services/api
```

Without it, those suites are skipped.
