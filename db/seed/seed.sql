-- Dev + E2E seed. Idempotent: fixed UUIDs and ON CONFLICT DO NOTHING, so it is
-- safe to run after every migrate. Runs as fare_owner (RLS does not apply to the
-- table owner); feedback counters are maintained by the dish_feedback trigger.
--
-- Fixtures the E2E suite relies on (see db/README.md):
--   Selam Ethiopian Kitchen  11111111-1111-4111-8111-111111111111
--   Le Petit Coin (bistro)   22222222-2222-4222-8222-222222222222
--   Kitfo      – no feedback             → always "unrated"
--   Doro Wat   – 10 diners of feedback   → "confident" once a diner has a profile
--   Steak Frites – 3 diners of feedback  → "preliminary" once a diner has a profile
-- Photos are intentionally null (MVP photo source is an open question) so the
-- card's placeholder state is exercised.

begin;

-- Seed author plus ten anonymous diners who left feedback.
insert into users (id)
select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
  from generate_series(1, 11) n
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Selam Ethiopian Kitchen
-- ---------------------------------------------------------------------------
insert into restaurants (id, name, address, cuisine, created_by) values
  ('11111111-1111-4111-8111-111111111111', 'Selam Ethiopian Kitchen', '214 Market Street',
   'Ethiopian', '00000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into menus (id, restaurant_id, source, created_by) values
  ('11111111-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'manual',
   '00000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into dishes (id, menu_id, position, native_name, price, anchor, description, spice, texture,
                    adventurousness, note, ingredients, dietary_tags, source, confidence, decoded_at)
values
  ('11111111-0000-4000-8000-000000000101', '11111111-0000-4000-8000-000000000001', 0,
   'Kitfo', '$18',
   'Similar to steak tartare — finely minced beef seasoned with spiced butter and chili',
   'Lean beef, hand-minced and warmed in niter kibbeh (clarified butter infused with herbs and spices) with mitmita, a fiery chili blend. Served with ayib, a mild fresh cheese, and greens.',
   2, 'Soft, silky, rich', 3,
   'Traditionally served raw. Ask for it "leb leb" (lightly warmed) or fully cooked if raw isn''t your thing.',
   array['beef', 'niter kibbeh', 'mitmita', 'ayib', 'collard greens'],
   array['nut_free', 'no_pork', 'shellfish_free'],
   'ai_generated', 'high', now()),

  ('11111111-0000-4000-8000-000000000102', '11111111-0000-4000-8000-000000000001', 1,
   'Doro Wat', '$19',
   'Similar to a slow-braised chicken stew — deep, red, and richly spiced',
   'Chicken on the bone and a hard-boiled egg simmered for hours in a sauce of slowly caramelised onions, berbere spice blend and niter kibbeh. Often served for celebrations.',
   3, 'Saucy, fall-apart', 2,
   'One of the spicier dishes on the menu. Scoop it up with injera.',
   array['chicken', 'egg', 'onion', 'berbere', 'niter kibbeh', 'garlic', 'ginger'],
   array['nut_free', 'no_pork', 'no_beef', 'shellfish_free'],
   'diner_refined', 'high', now()),

  ('11111111-0000-4000-8000-000000000103', '11111111-0000-4000-8000-000000000001', 2,
   'Shiro', '$14',
   'Similar to a warm, smooth hummus-style stew — ground chickpeas simmered with spices',
   'Chickpea and broad bean flour cooked slowly with onion, garlic and a little berbere until thick and creamy.',
   1, 'Smooth, creamy', 1,
   'Vegan when made with oil rather than butter — confirm with the restaurant.',
   array['chickpea', 'broad bean', 'onion', 'garlic', 'berbere'],
   array['vegetarian', 'pescatarian', 'nut_free', 'no_pork', 'no_beef', 'shellfish_free'],
   'ai_generated', 'high', now()),

  ('11111111-0000-4000-8000-000000000104', '11111111-0000-4000-8000-000000000001', 3,
   'Tibs', '$17',
   'Similar to a sizzling beef stir-fry — seared cubes of beef with onion and pepper',
   'Cubes of beef sautéed with onion, rosemary, green chili and niter kibbeh. Sometimes brought to the table sizzling in a clay dish.',
   1, 'Tender, seared', 1,
   'A gentle first Ethiopian dish for meat eaters.',
   array['beef', 'onion', 'rosemary', 'green chili', 'niter kibbeh'],
   array['nut_free', 'no_pork', 'shellfish_free'],
   'ai_generated', 'high', now()),

  ('11111111-0000-4000-8000-000000000105', '11111111-0000-4000-8000-000000000001', 4,
   'Misir Wat', '$13',
   'Similar to a spiced red lentil dal',
   'Red lentils simmered with onion, garlic and berbere into a thick, warming stew.',
   2, 'Thick, spoonable', 1,
   'Vegan',
   array['red lentils', 'onion', 'garlic', 'berbere'],
   array['vegan', 'vegetarian', 'pescatarian', 'dairy_free', 'nut_free', 'no_pork', 'no_beef', 'shellfish_free'],
   'ai_generated', 'high', now()),

  ('11111111-0000-4000-8000-000000000106', '11111111-0000-4000-8000-000000000001', 5,
   'Gomen', '$12',
   'Similar to braised collard greens — slow-cooked with garlic and ginger',
   'Collard greens cooked down with garlic, ginger, onion and mild green chili.',
   0, 'Tender, silky greens', 1,
   'Vegan',
   array['collard greens', 'garlic', 'ginger', 'onion', 'green chili'],
   array['vegan', 'vegetarian', 'pescatarian', 'dairy_free', 'nut_free', 'no_pork', 'no_beef', 'shellfish_free'],
   'ai_generated', 'high', now()),

  ('11111111-0000-4000-8000-000000000107', '11111111-0000-4000-8000-000000000001', 6,
   'Beyaynetu', '$22',
   'Similar to a thali — a shared platter of several vegetable stews on injera',
   'An assortment of vegetable dishes such as misir wat, shiro, gomen and yellow split peas (kik alicha), arranged in portions on a large round of injera.',
   1, 'Varied: creamy, saucy, tender', 1,
   'A good first order for a table: a sampler to share.',
   array['red lentils', 'chickpea', 'collard greens', 'split peas', 'teff', 'berbere'],
   array['vegan', 'vegetarian', 'pescatarian', 'dairy_free', 'nut_free', 'no_pork', 'no_beef', 'shellfish_free'],
   'ai_generated', 'high', now()),

  ('11111111-0000-4000-8000-000000000108', '11111111-0000-4000-8000-000000000001', 7,
   'Injera', '$3',
   'Similar to a sourdough crêpe — a spongy, tangy fermented flatbread',
   'A large, thin flatbread made from fermented teff batter, cooked on one side. It serves as both plate and utensil.',
   0, 'Spongy, soft, tangy', 2,
   'Tear off a piece and use it to pinch up food with your right hand.',
   array['teff', 'water'],
   array['vegan', 'vegetarian', 'pescatarian', 'dairy_free', 'nut_free', 'no_pork', 'no_beef', 'shellfish_free'],
   'ai_generated', 'high', now())
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Le Petit Coin (bistro, familiar-cuisine variant)
-- ---------------------------------------------------------------------------
insert into restaurants (id, name, address, cuisine, created_by) values
  ('22222222-2222-4222-8222-222222222222', 'Le Petit Coin', '9 Rue des Fleurs',
   'French', '00000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into menus (id, restaurant_id, source, created_by) values
  ('22222222-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'manual',
   '00000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into dishes (id, menu_id, position, native_name, price, anchor, description, spice, texture,
                    adventurousness, note, ingredients, dietary_tags, source, confidence, decoded_at)
values
  ('22222222-0000-4000-8000-000000000101', '22222222-0000-4000-8000-000000000001', 0,
   'Soupe à l''oignon gratinée', '€9',
   'Similar to a rich onion soup — topped with bread and melted cheese',
   'Onions slowly caramelised and simmered in beef stock, finished under the grill with a slice of bread and Gruyère.',
   0, 'Brothy, gooey top', 1, null,
   array['onion', 'beef stock', 'bread', 'gruyère', 'butter'],
   array['nut_free', 'no_pork', 'shellfish_free'],
   'ai_generated', 'high', now()),

  ('22222222-0000-4000-8000-000000000102', '22222222-0000-4000-8000-000000000001', 1,
   'Moules marinières', '€16',
   'Similar to steamed clams — mussels in a white wine and garlic broth',
   'Mussels steamed open in white wine with shallots, garlic, parsley and butter. Served with bread for the broth.',
   0, 'Tender, brothy', 2, null,
   array['mussels', 'white wine', 'shallot', 'garlic', 'parsley', 'butter'],
   array['pescatarian', 'nut_free', 'no_pork', 'no_beef'],
   'ai_generated', 'high', now()),

  ('22222222-0000-4000-8000-000000000103', '22222222-0000-4000-8000-000000000001', 2,
   'Steak frites', '€24',
   'Similar to steak and fries — seared steak with thin, crisp chips',
   'A pan-seared steak with a knob of herb butter, served with thin fried potatoes.',
   0, 'Juicy, crisp', 1,
   'Cooked medium-rare unless you ask otherwise.',
   array['beef', 'potato', 'butter', 'herbs'],
   array['gluten_free', 'nut_free', 'no_pork', 'shellfish_free'],
   'ai_generated', 'high', now()),

  ('22222222-0000-4000-8000-000000000104', '22222222-0000-4000-8000-000000000001', 3,
   'Confit de canard', '€22',
   'Similar to slow-roasted duck — a leg cooked in its own fat until crisp',
   'Duck leg slowly cooked in duck fat, then roasted until the skin crackles. Served with garlic potatoes.',
   0, 'Crisp skin, fall-apart meat', 2, null,
   array['duck', 'potato', 'garlic', 'thyme'],
   array['dairy_free', 'gluten_free', 'nut_free', 'no_pork', 'no_beef', 'shellfish_free'],
   'ai_generated', 'high', now()),

  ('22222222-0000-4000-8000-000000000105', '22222222-0000-4000-8000-000000000001', 4,
   'Salade niçoise', '€15',
   'Similar to a hearty tuna salad — with egg, olives and green beans',
   'Tuna, boiled egg, green beans, potatoes, tomatoes, olives and anchovies with a vinaigrette.',
   0, 'Fresh, crunchy', 1, null,
   array['tuna', 'egg', 'green beans', 'potato', 'tomato', 'olives', 'anchovy'],
   array['pescatarian', 'dairy_free', 'gluten_free', 'nut_free', 'no_pork', 'no_beef', 'shellfish_free'],
   'ai_generated', 'high', now()),

  ('22222222-0000-4000-8000-000000000106', '22222222-0000-4000-8000-000000000001', 5,
   'Crème brûlée', '€8',
   'Similar to a vanilla custard — with a crackly caramelised sugar top',
   'Baked vanilla cream custard, chilled, with a thin layer of sugar torched to a hard caramel.',
   0, 'Creamy, crackly top', 1, 'Vegetarian',
   array['cream', 'egg', 'sugar', 'vanilla'],
   array['vegetarian', 'pescatarian', 'gluten_free', 'nut_free', 'no_pork', 'no_beef', 'shellfish_free'],
   'ai_generated', 'high', now())
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Feedback from the seeded diners (users 2..11).
-- ---------------------------------------------------------------------------
-- Doro Wat: 10 diners, 9 say accurate, 8 liked it.
insert into dish_feedback (dish_id, user_id, accurate, tastes_like, liked)
select '11111111-0000-4000-8000-000000000102',
       ('00000000-0000-4000-8000-' || lpad((n + 1)::text, 12, '0'))::uuid,
       n <> 10,
       case when n = 1 then 'A spicier, deeper coq au vin' end,
       n <= 8
  from generate_series(1, 10) n
on conflict (dish_id, user_id) do nothing;

-- Steak frites: 3 diners, all accurate, 2 liked it.
insert into dish_feedback (dish_id, user_id, accurate, liked)
select '22222222-0000-4000-8000-000000000103',
       ('00000000-0000-4000-8000-' || lpad((n + 1)::text, 12, '0'))::uuid,
       true,
       n <= 2
  from generate_series(1, 3) n
on conflict (dish_id, user_id) do nothing;

commit;
