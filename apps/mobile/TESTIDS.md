# Fare mobile: testIDs

On Expo web every `testID` renders as `data-testid`, so Playwright can use
`page.getByTestId('…')`. IDs are stable; if one changes, `frontend` messages `integration`.

Placeholders: `<id>` = server id (restaurant / dish), `<tempId>` = `ParsedDish.tempId` from
`POST /scans` (manual rows are `manual-1`, `manual-2`, …), `<slug>` = lower-case, spaces → `-`.

## Routes

| URL | Screen |
|---|---|
| `/` | redirects to `/onboarding` (first visit) or `/library` |
| `/onboarding` | taste profile questions, skippable |
| `/library` | shared restaurant library + search |
| `/restaurant/<id>` | decoded menu |
| `/scan` | camera / library capture + progress |
| `/review` | review/edit parsed dishes (or manual entry if opened without a scan) |
| `/feedback/<dishId>?restaurantId=<id>` | dish feedback |
| `/profile` | edit taste profile |

"Onboarded" is a localStorage flag (`fare.onboarded = "1"`); the API token is `fare.token`.
A fresh browser context always starts at onboarding.

## Global

- `app-loading` – spinner while the onboarding flag loads

## Taste profile form (shared by onboarding and profile)

- `profile-spice-<0|1|2|3>` – chips: No heat / Mild / Medium / Hot (every chip, incl. filters and sort-toggle, has `aria-selected="true"|"false"`)
- `profile-diet-<value>` – the shared DIETARY_RESTRICTIONS values: `vegetarian`, `vegan`, `pescatarian`, `gluten_free`, `dairy_free`, `nut_free`, `shellfish_free`, `halal`, `kosher`, `no_pork`, `no_beef`
- `profile-fav-input`, `profile-fav-add`, `profile-fav-remove-<slug>` – favourite ingredients (stored lower-case)
- `profile-avoid-input`, `profile-avoid-add`, `profile-avoid-remove-<slug>` – avoided ingredients
- `profile-cuisine-<slug>` – `ethiopian`, `turkish`, `indian`, `mexican`, `chinese`, `french`, `italian`, `japanese`, `thai`, `korean`, `vietnamese`, `lebanese`. A cuisine selected here makes that restaurant's cards use the `familiar` variant.

## Onboarding (`/onboarding`)

- `onboarding-screen`, `onboarding-title`
- `onboarding-skip` – "Skip for now" (no profile saved → all dishes unrated)
- `onboarding-save` – "Save and continue" (PUT /me/taste-profile, then → library)
- `onboarding-error`

## Profile (`/profile`)

- `profile-screen`, `profile-loading`, `profile-error`, `profile-retry`
- `profile-empty` – shown when the diner has no profile yet
- `profile-save`, `profile-saved` (text after a successful save; stays on the page), `profile-save-error`

## Library (`/library`)

- `library-screen`
- `library-profile-button` (header), `library-scan-button`
- `library-search` – text input, debounced 300 ms, calls `GET /restaurants?q=`
- `library-loading`, `library-error`, `library-retry`, `library-empty`
- `library-list`, `library-item-<id>` (press to open), `library-item-name-<id>`
- `library-mock-notice` – only when the app runs against the built-in mock API (no `EXPO_PUBLIC_API_URL`)

## Restaurant (`/restaurant/<id>`)

- `restaurant-screen`, `restaurant-name`, `restaurant-cuisine` (cuisine + address), `restaurant-loading`, `restaurant-error`, `restaurant-retry`
- Filters: `filter-spice-<any|none|mild|hot>`, `filter-adv-<any|familiar|adventurous>`
- `sort-toggle` – text "Sort by best match" / "Sorted by best match". Default is menu order.
- `menu-list`, `menu-empty`, `menu-empty-filtered`
- Shortlist bar: `shortlist-bar`, `shortlist-count`, `shortlist-total` (only when non-empty, e.g. `$34`), `shortlist-clear`

## Dish card (`dish-card-<id>`)

Layout order: photo, name, price, anchor, description, signals, note, provenance, match, actions.

- `dish-card-photo-<id>` or `dish-card-photo-placeholder-<id>` (when `photoUrl` is null or fails to load)
- `dish-card-compact-<id>` – present only in the `familiar` variant
- `dish-card-name-<id>`, `dish-card-price-<id>`
- `dish-card-anchor-<id>`, `dish-card-description-<id>`
- `dish-card-spice-<id>` (text contains No heat / Mild / Medium / Hot), `dish-card-texture-<id>`, `dish-card-adventurousness-<id>` (Familiar / A little new / Adventurous)
- `dish-card-note-<id>`
- `dish-card-diet-tags-<id>` – "Marked as vegan, gluten free…" from `DishCard.dietaryTags` (AI-generated)
- `dish-card-note-caveat-<id>` – "Dietary info is AI-generated — verify with the restaurant"; shown whenever dietary tags are present, or when the note makes a dietary claim (e.g. "Vegan") on a non-restaurant-verified dish
- `dish-card-source-<id>` – "AI-written, not yet confirmed by diners" | "Refined by diners" | "Verified by the restaurant"
- `dish-card-low-confidence-<id>` – when `confidence === 'low'`
- `dish-card-feedback-counts-<id>` – "N diners found this accurate, M didn't" (when any feedback)
- `dish-card-match-<id>` – always present
  - `dish-card-match-unrated-<id>` – "Still learning your taste" (unrated, or no score)
  - `dish-card-match-score-<id>` – number 0–100 (preliminary/confident only)
  - `dish-card-match-state-<id>` – "Early estimate" | "Based on solid feedback"
  - `dish-card-match-reason-<id>` – `matchExplanation` text when the API sends one (may appear while unrated)
  - `dish-card-match-caveat-<id>` – "Dietary info is AI-generated — verify with the restaurant", shown only when `matchExplanationKind === "dietary"`
- `dish-card-add-<id>` – "Add to order" / "Add another (N)"
- `dish-card-feedback-<id>` – "Rate this dish" → feedback screen

## Scan (`/scan`)

- `scan-screen`
- `scan-camera` – "Take a photo". On web this opens a file chooser (with `capture`); if the browser can't, it falls back to a plain file chooser.
- `scan-library` – "Choose from library". On web: `const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('scan-library').click()]); await fc.setFiles('fixtures/menu.png');`
- `scan-progress` – visible while `POST /scans` runs
- `scan-error` – picker/permission/API error text
- `scan-manual` – "Enter dishes by hand" → `/review` with no scan

## Review (`/review`)

- `review-screen`, `review-summary` ("N dishes found, M to check…")
- `review-restaurant-name`, `review-restaurant-cuisine`, `review-restaurant-address` (inputs, prefilled from `restaurantGuess`)
- `review-list`
- Per row: `review-item-<tempId>`, `review-badge-<tempId>` ("Looks good" | "Check this" | "Manual entry"), `review-name-<tempId>` (input), `review-price-<tempId>` (input), `review-discard-<tempId>`, `review-raw-<tempId>` (raw OCR text, low-confidence rows only)
- `review-add-manual` – adds a `manual-N` row
- `review-discarded-list`, `review-discarded-<tempId>`, `review-restore-<tempId>`
- `review-save` – "Save menu"; `review-save-blocker` (validation message), `review-saving` (while `POST /restaurants` + decode run), `review-save-error`
- On success → `/restaurant/<newId>`

## Feedback (`/feedback/<dishId>?restaurantId=<id>`)

- `feedback-screen`, `feedback-dish-name`
- `feedback-accurate-yes`, `feedback-accurate-no`
- `feedback-tastes-like` (input, optional)
- `feedback-liked-yes` ("Liked it"), `feedback-liked-no` ("Not for me")
- `feedback-submit` (disabled until something is answered), `feedback-error`
- `feedback-success`, `feedback-done` (back to the menu, which shows the updated card)
