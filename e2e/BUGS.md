# E2E bug log

Running log of failures found by the Playwright suite (`e2e/`). Owner is taken from the
ownership table in `docs/TEAM_PLAN.md`. Status: `open` / `fixed` (verified by re-run) / `wontfix`.

| ID  | Status | Owner       | Spec                                                  | Summary                                                                    | Reported   | Fixed            |
| --- | ------ | ----------- | ----------------------------------------------------- | -------------------------------------------------------------------------- | ---------- | ---------------- |
| B1  | fixed  | devops      | all (auth setup)                                      | Suite exhausted the per-IP `POST /auth/anonymous` limit (30/h) and got 429 | 2026-09-29 | 417c10b, 3098189 |
| B2  | fixed  | frontend    | ui/feedback-matching.spec.ts:45                       | `profile-spice-N` chip never rendered `aria-selected` on web               | 2026-09-29 | 1013364          |
| B3  | fixed  | frontend    | ui/feedback-matching.spec.ts:86                       | Same root cause as B2 (onboarding with a profile)                          | 2026-09-29 | 1013364          |
| B4  | fixed  | integration | ui/feedback-matching.spec.ts:109                      | Spec expected seeded dish "Injera" but looked at the wrong restaurant      | 2026-09-29 | aae5fa2          |
| B5  | open   | llm         | api/scan-decode.spec.ts:73, ui/scan-review.spec.ts:11 | Turkish menu decode returns 502 UPSTREAM_ERROR after ~70s                  | 2026-09-29 |                  |

## Details

### B1: auth rate limit hit by the suite (devops)

- Steps: `npm run test:e2e`. Every spec creates fresh anonymous users from one IP.
- Expected: e2e users can sign up freely.
- Actual: after about 30 users, `POST /auth/anonymous` returned HTTP 429.
- Fix: backend made the limit configurable (`RATE_LIMIT_AUTH_PER_HOUR`, 4240809). `scripts/e2e.mjs`
  sets it (and the global/decode limits) high for the e2e stack only, with `RATE_LIMIT_SCAN_PER_HOUR=3`
  passed to both the api container and Playwright.

### B2 / B3: chips had no `aria-selected` on web (frontend)

- Steps: onboarding, then click `profile-spice-2`.
- Expected (TESTIDS.md): the selected chip has `aria-selected="true"`.
- Actual: the attribute was missing, because react-native-web ignores `accessibilityState`.
- Fix: Chip passes `aria-selected` explicitly (1013364). Verified in run 1 below.

### B4: seeded restaurant lookup by cuisine (integration)

- Cause: `findSeededRestaurant(/ethiop/i)` took the first Ethiopian restaurant in `GET /restaurants`,
  which could be the "E2E Addis Table" created by `scan-decode.spec.ts`. That restaurant has no "Injera".
- Fix: seeded restaurants are looked up by their fixed seed ids (`SEED_RESTAURANTS` in `support/api.ts`).

### B5: Turkish decode fails with 502 (llm)

- Steps: `POST /scans` with `fixtures/turkish-menu.png` (passes, all 6 names), then `POST /restaurants`
  with the Turkish dishes (Ezme, Mercimek Çorbası, İskender Kebap, Adana Kebap, Mantı, Künefe).
- Expected: 200 with 6 decoded DishCards.
- Actual: after ~70s, `502 {"error":{"code":"UPSTREAM_ERROR","message":"The menu reader is unavailable, please retry"}}`,
  i.e. an `LlmError` from decode. It failed in both the API and UI specs in the same run. The Ethiopian decode passed.
  The Turkish decode passed on aae5fa2.
- No API log was captured: Docker Desktop stopped right after the run.
- Re-run on ac4e941 (with Claude API failure logging): not reproduced, Turkish decode passed in 10.6s.
  Likely transient (two slow or invalid model responses in a row). Left open; if it recurs, the api log
  now records status, error type, request id and duration for each failed call.

## Runs

| Date       | Commit                    | Result                           | Notes                                                                            |
| ---------- | ------------------------- | -------------------------------- | -------------------------------------------------------------------------------- |
| 2026-09-29 | devops runs (pre-aae5fa2) | 33 passed / 3 failed             | B2, B3, B4                                                                       |
| 2026-09-29 | aae5fa2                   | 36 passed / 0 failed / 0 skipped | Real Claude API; fresh DB; 34.6s                                                 |
| 2026-09-29 | c11fac4                   | 34 passed / 2 failed / 0 skipped | B5; db on port 55432 (dev stack held 5432); Docker Desktop stopped after the run |
| 2026-09-29 | ac4e941                   | 36 passed / 0 failed / 0 skipped | Real Claude API; fresh DB; 32.2s; B5 not reproduced                              |
