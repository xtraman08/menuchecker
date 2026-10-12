-- 0002: what kind of reason a match explanation gives, so the card can pick the
-- right treatment (e.g. the dietary "verify with the restaurant" caveat).
-- Cached rows written before this have no kind; clear them so they are recomputed
-- instead of served with a null kind.
delete from dish_matches;

alter table dish_matches
  add column explanation_kind text
    check (explanation_kind in ('dietary', 'ingredients', 'spice', 'feedback')),
  add constraint dish_matches_kind_needs_explanation
    check (explanation is not null or explanation_kind is null);
