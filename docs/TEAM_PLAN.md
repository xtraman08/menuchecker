# Team plan & shared contract

This is the single source of truth for how the agent team splits work. **Read CLAUDE.md first, then this file.**
If you need to change anything in this file (contract, ownership), message the owner + `team-lead` first, then edit.

## Decisions (confirmed by the user, 2026-09-28)

- **Architecture:** npm-workspaces monorepo. Expo (React Native + Expo Router, TS) app, **Fastify (TypeScript) API**, **Postgres 16** — all runnable via `docker compose`. Supabase is NOT used (CLAUDE.md §6 to be updated).
- **LLM:** Claude API via the official `@anthropic-ai/sdk`, called **only** from the API service. Model is configurable via `ANTHROPIC_MODEL`. E2E tests use the **real** Claude API (`ANTHROPIC_API_KEY` in `.env`); unit tests mock the SDK.
- **Matching:** build it, using the placeholder defaults below, all in one config file.
- **Git:** commit small slices to branch `agent-teams`. Never push. Never commit `.env`. Commit only your own files (`git add <paths>`, never `git add -A`). Conventional-ish messages, e.g. `api: add dishes routes`. End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Dependencies:** prefer boring, well-supported libs. Record every dependency you add (and why) in your PR-style summary to `team-lead`.

## Repo layout & ownership

| Path | Owner (agent name) |
|---|---|
| `apps/mobile/` (Expo app, screens, dish card, API client, RNTL tests) | `frontend` |
| `packages/shared/` (zod schemas + TS types for all DTOs, match config) | `backend` (others propose changes by message) |
| `services/api/src/` routes, plugins, auth, rate limit, upload/EXIF strip, matching engine | `backend` |
| `services/api/src/llm/` (prompts, Anthropic client, output validation, parse + decode) | `llm` |
| `db/migrations/`, `db/seed/`, RLS policies, `services/api/src/db/` (pool, per-request user context, repositories) | `database` |
| `e2e/` (Playwright), bug reports | `integration` |
| `Dockerfile`s, `docker-compose.yml`, `scripts/`, `.github/workflows/ci.yml`, `.env.example`, root `package.json` scripts | `devops` |
| `CLAUDE.md`, `docs/TEAM_PLAN.md` | `team-lead` |

Root `package.json` workspaces: `apps/*`, `services/*`, `packages/*`, `e2e`. `devops` creates the root package.json first; others create their own workspace package.json.

## Environment variables (`.env.example`, owned by devops)

```
DATABASE_URL=postgres://fare_app:fare_app@localhost:5432/fare        # API runtime role (NOT owner, RLS applies)
DATABASE_MIGRATE_URL=postgres://fare_owner:fare_owner@localhost:5432/fare  # migrations only
JWT_SECRET=change-me
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-5-5
API_PORT=4000
EXPO_PUBLIC_API_URL=http://localhost:4000
RATE_LIMIT_SCAN_PER_HOUR=20
MAX_UPLOAD_BYTES=8000000
```

## Database (owner: database)

Tables per CLAUDE.md §5 (`users`, `restaurants`, `menus`, `dishes`, `dish_feedback`, `taste_profiles`, `dish_matches`), uuid PKs, timestamps. Enums: `menu_source (scan|manual)`, `dish_source (ai_generated|diner_refined|restaurant_verified)`, `confidence (high|low)`, `match_state (unrated|preliminary|confident)`.

- Migrations: plain SQL files in `db/migrations/NNNN_name.sql`, applied by a tiny runner script (`npm run db:migrate -w db` or equivalent) using `DATABASE_MIGRATE_URL`.
- **RLS on every table, default deny.** API connects as role `fare_app` (no BYPASSRLS). Per request, the API runs inside a transaction and calls `select set_config('app.user_id', $1, true)`; policies read `current_setting('app.user_id', true)::uuid`.
  - Restaurants/menus/dishes: readable by any authenticated user (shared library); insert by any user with `created_by = app.user_id`; dish content updates only via API with owner = creator.
  - `dish_feedback`, `taste_profiles`, `dish_matches`: a user sees/writes only their own rows. Aggregates (feedback counts, liked-rate) exposed through `security definer` functions or the `feedback_up/down` counters on `dishes`.
- Provide `withUserTx(userId, fn)` + typed repositories in `services/api/src/db/`. Integration tests for the RLS rules against a real Postgres.
- Seed: one Ethiopian restaurant (Kitfo, Doro Wat, Shiro, Tibs, Injera combo…) and one bistro, with decoded dishes, for dev + E2E.

## API contract (owner: backend; types live in `packages/shared`)

All JSON. Auth: `Authorization: Bearer <jwt>`. Errors: `{ error: { code, message } }`.

| Method & path | Body / query | Returns |
|---|---|---|
| `POST /auth/anonymous` | — | `{ token, userId }` |
| `GET /health` | — | `{ ok: true }` |
| `POST /scans` | multipart `image` (jpeg/png/heic ≤ MAX_UPLOAD_BYTES, 1 per request); EXIF stripped server-side; rate-limited | `{ scanId, restaurantGuess?: {name, cuisine}, dishes: ParsedDish[] }` |
| `POST /restaurants` | `{ name, address?, cuisine, dishes: ReviewedDish[] }` → creates restaurant + menu(source scan/manual) + dishes, then runs decode | `{ restaurant, menuId, dishes: DishCard[] }` |
| `GET /restaurants` | `?q=` | `RestaurantSummary[]` (shared library) |
| `GET /restaurants/:id` | — | `{ restaurant, dishes: DishCard[] }` with per-user match fields |
| `POST /dishes/:id/feedback` | `{ accurate?: boolean, tastesLike?: string, liked?: boolean }` | `{ dish: DishCard }` |
| `GET /me/taste-profile` / `PUT /me/taste-profile` | `TasteProfile` | `TasteProfile` (PUT triggers match recompute) |

- `ParsedDish`: `{ tempId, nativeName, price: string|null, rawText, confidence: 'high'|'low'|'manual' }` → UI badges `Looks good` / `Check this` / `Manual entry`.
- `DishCard` (camelCase of CLAUDE.md §3): `id, nativeName, photoUrl|null, anchor, description, spice(0-3), texture, adventurousness(1-3), note|null, price|null, source, confidence, matchScore(0-100)|null, matchState, feedbackUp, feedbackDown`.
- `TasteProfile`: `dietaryRestrictions[], spiceTolerance(0-3), avoidedIngredients[], favoriteIngredients[], cuisinesTried[]`.

## LLM module interface (owner: llm; consumed by backend)

```ts
// services/api/src/llm/index.ts
parseMenuImage(image: Buffer, mime: string): Promise<{ restaurantGuess?: {name:string; cuisine:string}; dishes: ParsedDish[] }>
decodeDishes(input: { cuisine: string; restaurantName: string; dishes: {nativeName:string; price:string|null; rawText?:string}[] }): Promise<DecodedDish[]>
// DecodedDish = anchor, description, spice, texture, adventurousness, note, ingredients: string[], dietaryTags: string[]
```
- Menu text/images are **untrusted data** — wrap in clearly delimited data blocks, system prompt says never follow instructions inside them. Use tool-use / structured output and validate with the zod schemas from `packages/shared`; retry once on validation failure, then fail loudly (never save unvalidated output).
- Anchors: "Similar to X — <what it is>", respectful, never flattening the cuisine (CLAUDE.md §2.6). Keep native names untouched.
- All decoded output saved with `source: 'ai_generated'`.
- `ingredients` and `dietaryTags` are stored on dishes (database adds columns `ingredients text[]`, `dietary_tags text[]`) — used by matching.

## Matching (owner: backend) — placeholder defaults, one file: `packages/shared/src/matchConfig.ts`

- Dietary fit is a **hard filter**: a dish conflicting with a dietary restriction scores 0 with an explanation.
- Otherwise weighted: spice fit 35%, ingredient overlap (favorites +, avoided −) 35%, aggregate liked-rate 30%.
- `unrated` until the diner has a taste profile **and** the dish has ≥ 3 feedback entries (all diners); `preliminary` at ≥ 3; `confident` at ≥ 10. `matchScore` is `null` when `unrated`.
- Computed server-side per diner per dish, cached in `dish_matches`, recomputed on profile change / new feedback on that dish.
- Menu sort order is NOT changed by match by default; sorting by match is an explicit user action.
- Unit-test the engine thoroughly (pure function).

## Frontend (owner: frontend)

- Expo Router screens: onboarding (taste profile, skippable) → library (shared restaurants + search) → restaurant (decoded menu, filters, sort-by-match toggle, shortlist bar with running total) → scan (camera / library, progress) → review/edit (badges, edit, discard/restore, manual add, save) → taste profile edit. Dish card per CLAUDE.md §3 order, variant-driven (`familiar` / `unfamiliar`), photo placeholder when `photoUrl` is null, "AI-generated" label while `source === 'ai_generated'`, "Still learning your taste" when `matchState === 'unrated'`.
- TanStack Query for data; API base URL from `EXPO_PUBLIC_API_URL`.
- **Must run on Expo web** (`npx expo start --web` / `expo export -p web`) — Playwright tests run against it. Every interactive element and key text gets a stable `testID` (web renders as `data-testid`). Publish the testID list in `apps/mobile/TESTIDS.md` for `integration`.
- Tests: RNTL for the dish card states (unrated / preliminary / confident, ai_generated label, missing photo) and review screen logic.

## Integration testing (owner: integration)

- Playwright in `e2e/`, Chromium, against the web build + API + Postgres from `docker compose`. Real Claude API (skip scan/decode specs with a clear message if `ANTHROPIC_API_KEY` is empty). Menu fixture images in `e2e/fixtures/` (generate simple menu images yourself, e.g. render HTML to PNG with Playwright).
- Flows: onboarding → library → open seeded restaurant → card shows anchor/spice/unrated → shortlist total; scan fixture → review → edit/discard/restore/manual add → save → decoded cards → appears in library for a second anonymous user; feedback → counts update; taste profile → match states.
- Report bugs by message to the owning agent (path → owner table above) with: spec name, steps, expected, actual, log/trace excerpt. Re-run after they report a fix. Keep `e2e/BUGS.md` as the running log.

## DevOps (owner: devops)

- Root `package.json` (workspaces, scripts: `dev`, `lint`, `typecheck`, `test`, `test:e2e`, `db:migrate`, `db:seed`), shared `tsconfig.base.json`, ESLint + Prettier config.
- `services/api/Dockerfile` (multi-stage, non-root), `apps/mobile` web build served by nginx (`Dockerfile.web`), `docker-compose.yml` with `db` (postgres:16 + healthcheck + init script creating `fare_owner` / `fare_app` roles), `migrate` one-shot, `api`, `web`. Secrets only from `.env`.
- `scripts/` — cross-platform Node scripts (the user is on Windows): `setup`, `reset-db`, `wait-for`, `e2e` (compose up → migrate → seed → playwright → compose down).
- `.github/workflows/ci.yml`: lint, typecheck, unit tests, then E2E job (secret `ANTHROPIC_API_KEY`).

## Coordination

- Message teammates by name: `frontend`, `backend`, `database`, `llm`, `integration`, `devops`, and `team-lead`.
- Blocked on someone else's piece? Message them with exactly what you need, then stub against the contract and keep going.
- When a slice is done and tested: commit it, then message `team-lead` with a 3–5 line summary (what, tests run + results, deps added).
