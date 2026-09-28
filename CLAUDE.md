# CLAUDE.md — Fare (working name): Menu Comprehension & Match App

## 1. What we're building

A mobile app that tells a diner **what a dish actually is** the moment they look at a menu in a cuisine they don't know (Ethiopian, Turkish, Indian, Mexican, Chinese, etc.).

**The problem is a knowledge deficit, not choice overload.** People can't express preferences until they understand what they're looking at. So the app is **both** an *instant comprehension layer* **and** a *recommendation / preference-matching engine* — comprehension comes first, sequentially, then preference matching builds on top of it once a dish is understood.

**MVP promise:** point the camera at a menu (or open a saved restaurant) and every dish is instantly decoded — what it looks like, what it's like, how spicy, how adventurous — **and** ranked by how well it's likely to match the diner, once there's enough signal to rank it.

## 2. Product principles (do not violate)

1. **Comprehension unlocks preference, in that order.** A dish always shows its plain-language anchor, photo, and taste signals first. A match/preference score only ever appears once comprehension is on the card too — never a bare number with no explanation of what the dish is.
2. **Glanceable, never hidden.** The anchor line and, once available, the match signal are always visible on the card. No tap required to understand a dish or see how well it fits.
3. **Keep the native name.** Never replace "Kitfo" with an English label. Always pair the native name with its plain-language anchor.
4. **Photo first.** The visual leads the card; text and scores support it.
5. **Be honest about confidence.** AI-generated content is labelled as such until diners confirm it. A dish with no preference signal yet shows an honest "unrated" / "still learning your taste" state — never a guessed or default score presented as real.
6. **Respectful tone.** Anchors like "similar to steak tartare" help orientation; they must not flatten or trivialise a cuisine. Informative, never gimmicky.
7. **Different familiarity, different UI.** A familiar cuisine may need a lighter card than an unfamiliar one, and the match score may carry more visual weight once a cuisine is familiar to the diner. Keep the card component variant-driven.
8. **Preference match is earned, not assumed.** Matching is driven by what the diner has actually rated, ordered, or told the app (spice tolerance, dietary needs, past feedback) — never by a generic popularity score dressed up as personalization.

## 3. The dish card (atomic unit)

Fields per dish:

| Field | Purpose |
|---|---|
| `native_name` | Name as printed on the menu |
| `photo_url` | Representative image (required in the UI; use a placeholder state if missing) |
| `anchor` | One line: "Similar to X — <what it is>" |
| `description` | Plain-language ingredients and preparation |
| `spice` | 0–3 |
| `texture` | Short plain phrase, e.g. "Saucy, fall-apart" |
| `adventurousness` | 1–3 (familiar to adventurous) |
| `note` | Optional honest tip, e.g. "Ask for it cooked if raw isn't your thing", "Vegan" |
| `price` | As printed on the menu |
| `source` | `ai_generated` / `diner_refined` / `restaurant_verified` |
| `confidence` | `high` / `low` |
| `match_score` | 0–100, or `null` when there isn't enough signal yet (see below) |
| `match_state` | `unrated` (no signal yet) / `preliminary` (light signal) / `confident` (enough signal to trust) |

Card layout order: **photo + native name + price → anchor line → description → spice / texture / adventurousness → note → match indicator (or "still learning your taste" state) → add-to-order.**

The match indicator is a secondary visual element to the anchor/photo, not a replacement for them — comprehension content is never removed or shrunk to make room for the score.

## 4. MVP scope

### In
1. **Scan a menu** — camera capture or photo library, OCR + AI parsing into structured dishes.
2. **Review and correct** — editable list of parsed dishes with confidence badges (`Looks good` / `Check this` / `Manual entry`), discard and restore, manual add.
3. **Decode** — AI generates the first-pass dish card fields for every parsed dish.
4. **Browse the decoded menu** — instant-knowledge cards per restaurant.
5. **Shortlist** — add dishes to a simple order list with a running total (no real ordering or payments).
6. **Diner feedback** — lightweight "was this description accurate?" and "tastes like…" input to refine cards, plus a simple "liked it / not for me" rating per dish once ordered.
7. **Shared restaurant library** — once one user saves a menu, others see it.
8. **Taste profile** — a lightweight, editable set of preferences per diner: dietary restrictions, spice tolerance, favorite/avoided ingredients, and cuisines tried. Seeded by onboarding questions, refined by feedback.
9. **Preference matching** — a per-dish match score computed from the diner's taste profile plus their own and other diners' feedback on that dish. Shows an honest "unrated" state until there's enough signal (see section 5 for the threshold).

### Out (later)
- Group swipe-to-decide / group order matching
- Restaurant-owner claim dashboard
- Delivery-platform / website menu import
- Real ordering and payments
- Dish photo generation or crowdsourced photo upload (MVP uses curated or placeholder imagery)
- Collaborative filtering across diners with similar taste profiles (MVP match score is single-diner, rules/heuristics based; a learned model comes later once there's enough data)

## 5. Data model (proposed)

- `restaurants`: id, name, address, cuisine, created_by, created_at
- `menus`: id, restaurant_id, source (`scan`/`manual`), created_at
- `dishes`: id, menu_id, native_name, price, anchor, description, spice, texture, adventurousness, note, photo_url, source, confidence, feedback_up, feedback_down
- `dish_feedback`: id, dish_id, user_id, accurate (bool), tastes_like (text, optional), liked (bool, optional — "would order again"), created_at
- `users`: id, created_at (anonymous auth is fine for MVP)
- `taste_profiles`: id, user_id, dietary_restrictions (array), spice_tolerance (0–3), avoided_ingredients (array), favorite_ingredients (array), cuisines_tried (array), updated_at
- `dish_matches`: id, dish_id, user_id, match_score, match_state, computed_at (derived/cached, not user-editable)

**Data flow (comprehension):** photo → OCR/vision parse → structured dishes (with per-dish confidence) → user review → save → AI decode pass → cards. Diner feedback updates `feedback_*` counts and can promote `source` from `ai_generated` to `diner_refined` after a threshold (threshold TBD).

**Data flow (matching):** taste profile (onboarding + edits) + a diner's own dish feedback + aggregate feedback on that dish → match score computed server-side per diner per dish → cached in `dish_matches`, recomputed when the profile or relevant feedback changes. A dish shows `unrated` until the diner has a taste profile **and** the dish has minimum feedback volume (threshold TBD, see open questions); `preliminary` once a first score exists; `confident` past a second, higher threshold.

## 6. Proposed tech stack (assumptions — confirm or change)

- **App:** React Native with Expo, TypeScript, Expo Router
- **Backend:** Supabase (Postgres, auth, storage, edge functions)
- **AI:** Claude API (vision for menu parsing, text for dish decoding), called **only from a backend function**, never from the app
- **State/data:** TanStack Query
- **Testing:** Jest + React Native Testing Library; Maestro for a basic end-to-end flow

## 7. Security and privacy requirements

- API keys and model credentials live server-side only; the mobile client never holds them.
- Enable row-level security on every table from day one; default deny.
- Treat OCR/menu text as **untrusted input**: it goes to the model as data, never as instructions. Validate model output against a strict schema before saving.
- Rate-limit scan and decode endpoints per user; cap image size and count.
- Strip EXIF/location metadata from uploaded images.
- Store the minimum user data; anonymous auth for MVP, no PII collected.
- Keep secrets out of the repo (`.env` in `.gitignore`, use Expo/Supabase secrets).

## 8. Reference prototype

`menu-match-app.html` is a single-file interactive prototype and the visual/behavioural reference. It contains:
- Iteration 1: bistro menu with filters, match/value dial, order bar (familiar-cuisine variant; this dial is the starting point for the MVP match indicator)
- Iteration 2: scan → scanning progress → review/edit flow with confidence badges, discard/restore, "unrated" state
- Iteration 3: Ethiopian venue with the instant-knowledge card (photo-first, anchor line, spice/texture/adventurousness, notes; no dial was shown here because there was no taste-profile data yet in that mock — in the real MVP this card gains an "unrated" match indicator instead of omitting it)

Port the **flows and card design**, not the HTML. The canonical MVP dish card merges the Ethiopian card's comprehension layout with the bistro card's match dial, using the dial's "unrated" treatment (already built in iteration 2/3) whenever `match_state` is `unrated`.

> Note: `menu-match-app.html` is referenced as the design source of truth but is not yet checked into this repository. Add it under a `design/` or `prototypes/` folder when available, and update this section with its actual path.

## 9. Repository state & setup commands

This repository is currently **greenfield** — no app code, framework, or build/test tooling has been scaffolded yet. Do not invent or assume commands beyond what's below.

- Once the app is scaffolded per the stack in section 6 (e.g. via `npx create-expo-app`), update this section with the real, working commands for:
  - Install: e.g. `npm install`
  - Run/dev: e.g. `npx expo start`
  - Lint/typecheck: e.g. `npm run lint`, `npm run typecheck`
  - Test: e.g. `npm test` (Jest + React Native Testing Library), plus the Maestro flow command
  - Build: platform-specific build/EAS commands
- Keep this section accurate as tooling changes — an outdated command here is worse than no command.

## 10. Working agreement for Claude

- Read this file first each session; keep it updated when decisions change.
- Build in small vertical slices; each slice must run on a device or simulator before moving on.
- Suggested order: (1) project scaffold + navigation, (2) dish card component with static data (comprehension fields only), (3) menu browse screen, (4) scan capture UI, (5) backend parse + decode functions, (6) review/edit screen wired to real data, (7) save + shared library, (8) diner feedback, (9) taste-profile onboarding + editing, (10) match-score computation and the card's match indicator (including its `unrated`/`preliminary`/`confident` states). Comprehension ships and is usable end-to-end before matching is added — matching augments an already-working comprehension flow, it doesn't block it.
- Prefer boring, well-supported libraries. Ask before adding a dependency.
- Write a test for parsing/validation logic and for the card's confidence/unrated states.
- When a requirement is ambiguous, ask one focused question rather than guessing on anything in section 2.
- Update section 9 with real setup/lint/test/build commands as soon as the project is scaffolded.

## 11. Open questions

- App name and branding (Fare is a placeholder).
- Dish photo source for MVP: licensed stock, curated set per common dish, or AI-generated (with clear labelling)?
- How are anchor comparisons personalised later, given they rely on the diner's reference foods?
- Feedback threshold for promoting a dish from AI-generated to diner-refined.
- Launch cuisines and city for the first release.
- Dietary and allergen info: out of MVP, but if shown, it must carry a clear "verify with the restaurant" caveat.
- Exact match-score formula for MVP: simple weighted rule (dietary fit + spice fit + ingredient overlap + aggregate liked-rate) is the likely starting point — confirm before building.
- Minimum feedback volume to move a dish from `unrated` → `preliminary` → `confident`.
- Onboarding flow for the taste profile: how many questions before first use, and what's skippable.
- Whether the match score should ever influence sort order of the menu by default, or only be shown per-card with sorting as an explicit user action.
