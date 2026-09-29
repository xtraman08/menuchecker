-- 0001_init: core schema for Fare (CLAUDE.md §5, docs/TEAM_PLAN.md "Database").
-- Runs as fare_owner. The runtime role fare_app gets only the grants below, and
-- every table has row-level security enabled with no default access (default deny).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type menu_source as enum ('scan', 'manual');
create type dish_source as enum ('ai_generated', 'diner_refined', 'restaurant_verified');
create type confidence as enum ('high', 'low');
create type match_state as enum ('unrated', 'preliminary', 'confident');

-- ---------------------------------------------------------------------------
-- Current request user. The API sets it per transaction with
--   select set_config('app.user_id', $1, true)
-- Returns null when unset/empty, so every policy denies by default.
-- ---------------------------------------------------------------------------
create function app_current_user_id() returns uuid
  language sql stable
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table users (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table restaurants (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 200),
  address    text check (address is null or length(address) <= 500),
  cuisine    text not null check (length(btrim(cuisine)) between 1 and 100),
  created_by uuid not null references users (id),
  created_at timestamptz not null default now()
);
create index restaurants_created_at_idx on restaurants (created_at desc);
create index restaurants_name_lower_idx on restaurants (lower(name));

create table menus (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  source        menu_source not null,
  created_by    uuid not null references users (id),
  created_at    timestamptz not null default now()
);
create index menus_restaurant_idx on menus (restaurant_id, created_at desc);

-- Decoded fields (anchor .. dietary_tags) are nullable until the AI decode pass
-- runs (decoded_at is set then), so reviewed dishes survive a failed decode.
create table dishes (
  id              uuid primary key default gen_random_uuid(),
  menu_id         uuid not null references menus (id) on delete cascade,
  position        integer not null default 0,
  native_name     text not null check (length(btrim(native_name)) between 1 and 200),
  price           text check (price is null or length(price) <= 50),
  raw_text        text check (raw_text is null or length(raw_text) <= 2000),
  anchor          text check (anchor is null or length(anchor) <= 300),
  description     text check (description is null or length(description) <= 2000),
  spice           smallint check (spice between 0 and 3),
  texture         text check (texture is null or length(texture) <= 200),
  adventurousness smallint check (adventurousness between 1 and 3),
  note            text check (note is null or length(note) <= 500),
  photo_url       text check (photo_url is null or length(photo_url) <= 2000),
  ingredients     text[] not null default '{}',
  dietary_tags    text[] not null default '{}',
  source          dish_source not null default 'ai_generated',
  confidence      confidence not null default 'low',
  feedback_up     integer not null default 0 check (feedback_up >= 0),
  feedback_down   integer not null default 0 check (feedback_down >= 0),
  decoded_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index dishes_menu_idx on dishes (menu_id, position);

-- One feedback row per (diner, dish); later submissions update it.
create table dish_feedback (
  id          uuid primary key default gen_random_uuid(),
  dish_id     uuid not null references dishes (id) on delete cascade,
  user_id     uuid not null references users (id) on delete cascade,
  accurate    boolean,
  tastes_like text check (tastes_like is null or length(tastes_like) <= 300),
  liked       boolean,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (dish_id, user_id)
);
create index dish_feedback_user_idx on dish_feedback (user_id);

create table taste_profiles (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null unique references users (id) on delete cascade,
  dietary_restrictions text[] not null default '{}',
  spice_tolerance      smallint not null default 1 check (spice_tolerance between 0 and 3),
  avoided_ingredients  text[] not null default '{}',
  favorite_ingredients text[] not null default '{}',
  cuisines_tried       text[] not null default '{}',
  updated_at           timestamptz not null default now()
);

-- Derived cache, written by the API's matching engine for the current user only.
create table dish_matches (
  id          uuid primary key default gen_random_uuid(),
  dish_id     uuid not null references dishes (id) on delete cascade,
  user_id     uuid not null references users (id) on delete cascade,
  match_score smallint check (match_score between 0 and 100),
  match_state match_state not null,
  explanation text check (explanation is null or length(explanation) <= 500),
  computed_at timestamptz not null default now(),
  unique (dish_id, user_id),
  -- Honest confidence: unrated never carries a score, rated states always do.
  check ((match_state = 'unrated') = (match_score is null))
);
create index dish_matches_user_idx on dish_matches (user_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create function touch_updated_at() returns trigger
  language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger dishes_touch before update on dishes
  for each row execute function touch_updated_at();
create trigger dish_feedback_touch before update on dish_feedback
  for each row execute function touch_updated_at();
create trigger taste_profiles_touch before update on taste_profiles
  for each row execute function touch_updated_at();

-- Keeps dishes.feedback_up/down (accurate = true/false counts) in sync and
-- invalidates every diner's cached match for the dish. SECURITY DEFINER because
-- the diner leaving feedback is usually not the dish's creator and cannot see
-- other diners' rows; it touches only the affected dish.
create function dish_feedback_sync() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  target uuid;
begin
  foreach target in array array[
    case when tg_op in ('INSERT', 'UPDATE') then new.dish_id end,
    case when tg_op in ('UPDATE', 'DELETE') then old.dish_id end
  ] loop
    continue when target is null;
    update dishes d
       set feedback_up   = (select count(*) from dish_feedback f where f.dish_id = target and f.accurate is true),
           feedback_down = (select count(*) from dish_feedback f where f.dish_id = target and f.accurate is false)
     where d.id = target;
    delete from dish_matches m where m.dish_id = target;
  end loop;
  return null;
end
$$;

create trigger dish_feedback_sync after insert or update or delete on dish_feedback
  for each row execute function dish_feedback_sync();

-- A profile change invalidates that diner's cached matches.
create function taste_profile_invalidate_matches() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  delete from dish_matches m where m.user_id = new.user_id;
  return null;
end
$$;

create trigger taste_profile_invalidate after insert or update on taste_profiles
  for each row execute function taste_profile_invalidate_matches();

-- ---------------------------------------------------------------------------
-- Aggregates over ALL diners (dish_feedback RLS hides other diners' rows).
-- Exposes only counts, never who said what.
-- ---------------------------------------------------------------------------
create function dish_feedback_stats(dish_ids uuid[])
  returns table (
    dish_id        uuid,
    entries        integer,
    accurate_up    integer,
    accurate_down  integer,
    liked_up       integer,
    liked_down     integer,
    liked_rate     numeric
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select f.dish_id,
         count(*)::integer,
         count(*) filter (where f.accurate is true)::integer,
         count(*) filter (where f.accurate is false)::integer,
         count(*) filter (where f.liked is true)::integer,
         count(*) filter (where f.liked is false)::integer,
         case when count(f.liked) = 0 then null
              else round((count(*) filter (where f.liked is true))::numeric / count(f.liked), 4)
         end
    from dish_feedback f
   where f.dish_id = any (dish_ids)
     and app_current_user_id() is not null
   group by f.dish_id
$$;

-- ---------------------------------------------------------------------------
-- Row-level security: enabled everywhere, access only through the policies below.
-- ---------------------------------------------------------------------------
alter table users          enable row level security;
alter table restaurants    enable row level security;
alter table menus          enable row level security;
alter table dishes         enable row level security;
alter table dish_feedback  enable row level security;
alter table taste_profiles enable row level security;
alter table dish_matches   enable row level security;

-- users: a diner sees and creates only their own row.
create policy users_select_own on users for select to fare_app
  using (id = app_current_user_id());
create policy users_insert_own on users for insert to fare_app
  with check (id = app_current_user_id());

-- Shared library: any authenticated diner reads restaurants/menus/dishes.
create policy restaurants_select on restaurants for select to fare_app
  using (app_current_user_id() is not null);
create policy restaurants_insert on restaurants for insert to fare_app
  with check (created_by = app_current_user_id());
create policy restaurants_update_creator on restaurants for update to fare_app
  using (created_by = app_current_user_id())
  with check (created_by = app_current_user_id());

create policy menus_select on menus for select to fare_app
  using (app_current_user_id() is not null);
create policy menus_insert on menus for insert to fare_app
  with check (
    created_by = app_current_user_id()
    and exists (select 1 from restaurants r
                 where r.id = restaurant_id and r.created_by = app_current_user_id())
  );

create policy dishes_select on dishes for select to fare_app
  using (app_current_user_id() is not null);
create policy dishes_insert_creator on dishes for insert to fare_app
  with check (exists (select 1 from menus m
                       where m.id = menu_id and m.created_by = app_current_user_id()));
create policy dishes_update_creator on dishes for update to fare_app
  using (exists (select 1 from menus m
                  where m.id = menu_id and m.created_by = app_current_user_id()))
  with check (exists (select 1 from menus m
                       where m.id = menu_id and m.created_by = app_current_user_id()));

-- Private per-diner tables.
create policy dish_feedback_own on dish_feedback for all to fare_app
  using (user_id = app_current_user_id())
  with check (user_id = app_current_user_id());
create policy taste_profiles_own on taste_profiles for all to fare_app
  using (user_id = app_current_user_id())
  with check (user_id = app_current_user_id());
create policy dish_matches_own on dish_matches for all to fare_app
  using (user_id = app_current_user_id())
  with check (user_id = app_current_user_id());

-- ---------------------------------------------------------------------------
-- Grants for the runtime role (least privilege; no DELETE on shared content).
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from public;
revoke all on all functions in schema public from public;

grant usage on schema public to fare_app;
grant select, insert on users to fare_app;
grant select, insert, update on restaurants, menus to fare_app;
grant select, insert,
      update (position, native_name, price, raw_text, anchor, description, spice, texture,
              adventurousness, note, photo_url, ingredients, dietary_tags, confidence, decoded_at)
  on dishes to fare_app;
grant select, insert, update, delete on dish_feedback, taste_profiles, dish_matches to fare_app;

grant execute on function app_current_user_id() to fare_app;
grant execute on function dish_feedback_stats(uuid[]) to fare_app;
grant execute on function touch_updated_at() to fare_app;
