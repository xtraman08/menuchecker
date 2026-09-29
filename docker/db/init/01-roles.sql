-- Runs once, as the postgres superuser, when the `db` volume is first created
-- (docker-entrypoint-initdb.d). Local/dev credentials only; they match .env.example.
--
--   fare_owner: owns the `fare` database (and so its public schema); runs migrations + seed.
--   fare_app:   API runtime role. No superuser, no BYPASSRLS: row-level security always applies.
--               Table grants are issued by the migrations (db/migrations).

create role fare_owner with login password 'fare_owner' nosuperuser nocreatedb nocreaterole nobypassrls;
create role fare_app   with login password 'fare_app'   nosuperuser nocreatedb nocreaterole nobypassrls noinherit;

alter database fare owner to fare_owner;
revoke all on database fare from public;
grant connect, temporary on database fare to fare_owner, fare_app;
