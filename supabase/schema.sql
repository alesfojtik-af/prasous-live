-- PraSouš Live: tabulky pro Supabase. Vlož celé do SQL Editoru a spusť (Run).
-- Prototyp: čtení i zápis je povolen anonymnímu klíči (hesla týmů hlídá aplikace, ne databáze).

create table if not exists app_race (
  id int primary key,
  data jsonb,
  xlsx_b64 text,
  gpx text,
  updated_at timestamptz default now()
);
create table if not exists app_entries (
  team text not null,
  point int not null check (point between 0 and 9),
  minutes int not null,
  by_who text,
  at timestamptz default now(),
  src text,
  primary key (team, point)
);
create table if not exists app_history (
  id bigserial primary key,
  team text not null,
  point int not null,
  old_minutes int,
  new_minutes int,
  by_who text,
  reason text,
  at timestamptz default now()
);
create table if not exists app_settings (key text primary key, value jsonb);
create table if not exists app_passwords (team text primary key, password text);

alter table app_race enable row level security;
alter table app_entries enable row level security;
alter table app_history enable row level security;
alter table app_settings enable row level security;
alter table app_passwords enable row level security;

do $$
declare t text;
begin
  foreach t in array array['app_race','app_entries','app_history','app_settings','app_passwords'] loop
    execute format('drop policy if exists "prasous_open" on %I', t);
    execute format('create policy "prasous_open" on %I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- realtime (živé aktualizace)
do $$
declare t text;
begin
  foreach t in array array['app_race','app_entries','app_history','app_settings','app_passwords'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
