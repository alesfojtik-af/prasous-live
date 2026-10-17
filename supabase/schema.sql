-- PraSouš Live: databáze v2 (ročníky + zápisy jen přes funkce s heslem).
-- Spusť celé v SQL Editoru (Run). Je bezpečné spustit i opakovaně, nic nemaže.
-- Staré tabulky app_* z první verze zůstávají nedotčené (aplikace je už nepoužívá, můžeš je později smazat ručně).
--
-- Po prvním spuštění nastav heslo admina JEDNOU samostatným dotazem (heslo si vymysli, nikomu ho neposílej):
--   select pl_init_admin('tvoje-heslo-min-8-znaku');

create extension if not exists pgcrypto with schema extensions;

-- ---------- tabulky ----------
create table if not exists pl_editions (          -- ročník závodu = trasa, týmy, plán, Excel, GPX
  id text primary key,                              -- např. '2026'
  label text not null,                              -- text u loga, např. '2026'
  race_date date,                                   -- den závodu (řídí chování před/po závodě)
  data jsonb not null,                              -- úseky a týmy z Excelu
  xlsx_b64 text,
  gpx text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists pl_edition_versions (    -- předchozí verze ročníku (pro obnovení)
  id bigserial primary key,
  edition text not null,
  saved_at timestamptz default now(),
  label text, race_date date, data jsonb, xlsx_b64 text, gpx text
);
create table if not exists pl_entries (             -- zapsané časy (minuty od půlnoci), point 0 = start, 9 = cíl
  edition text not null,
  team text not null,
  point int not null check (point between 0 and 9),
  minutes int not null check (minutes between 0 and 2879),
  by_who text,
  at timestamptz default now(),
  src text,
  primary key (edition, team, point)
);
alter table pl_entries drop constraint if exists pl_entries_minutes_check;  -- časy po půlnoci = nad 1440
alter table pl_entries add constraint pl_entries_minutes_check check (minutes between 0 and 2879);
create table if not exists pl_history (             -- každá změna zápisu, nic se nemaže
  id bigserial primary key,
  edition text not null, team text not null, point int not null,
  old_minutes int, new_minutes int, by_who text, reason text,
  at timestamptz default now()
);
create table if not exists pl_settings (key text primary key, value jsonb);  -- active_edition, looks:<ročník>
create table if not exists pl_team_pw (edition text, team text, pw_hash text, primary key (edition, team)); -- vlastní hesla týmů (otisk)
create table if not exists pl_admin (id int primary key default 1 check (id = 1), pw_hash text not null);
create table if not exists pl_attempts (who text not null, at timestamptz default now()); -- neúspěšná přihlášení

-- ---------- oprávnění: anonymní klíč smí jen číst veřejné tabulky ----------
alter table pl_editions enable row level security;
alter table pl_edition_versions enable row level security;
alter table pl_entries enable row level security;
alter table pl_history enable row level security;
alter table pl_settings enable row level security;
alter table pl_team_pw enable row level security;
alter table pl_admin enable row level security;
alter table pl_attempts enable row level security;

-- Původní Excel obsahuje osobní údaje (e-maily, ročníky narození), proto je v tabulce bez čtecí politiky:
-- čte ho jen admin přes funkci pl_admin_get_xlsx. Starý sloupec pl_editions.xlsx_b64 se po zkopírování vyprázdní.
create table if not exists pl_edition_files (edition text primary key, xlsx_b64 text);
alter table pl_edition_files enable row level security;
insert into pl_edition_files(edition, xlsx_b64) select id, xlsx_b64 from pl_editions where xlsx_b64 is not null on conflict (edition) do nothing;
update pl_editions set xlsx_b64 = null where xlsx_b64 is not null and exists (select 1 from pl_edition_files f where f.edition = pl_editions.id);

drop policy if exists pl_read on pl_editions;  create policy pl_read on pl_editions for select to anon, authenticated using (true);
drop policy if exists pl_read on pl_entries;   create policy pl_read on pl_entries for select to anon, authenticated using (true);
drop policy if exists pl_read on pl_history;   create policy pl_read on pl_history for select to anon, authenticated using (true);
drop policy if exists pl_read on pl_settings;  create policy pl_read on pl_settings for select to anon, authenticated using (true);
-- pl_team_pw, pl_admin, pl_attempts, pl_edition_versions: žádná politika = čtení ani zápis zvenčí

-- ---------- pomocné funkce ----------
create or replace function pl_throttle(p_who text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  -- proč: bcrypt zpomaluje hádání hesla, tady ho navíc omezíme na 10 neúspěšných pokusů za 10 minut
  if (select count(*) from pl_attempts where who = p_who and at > now() - interval '10 minutes') >= 10 then
    raise exception 'Příliš mnoho pokusů, zkus to za chvíli.';
  end if;
end $$;

create or replace function pl_admin_ok(p_pw text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean;
begin
  perform pl_throttle('admin');
  select exists (select 1 from pl_admin where pw_hash = crypt(coalesce(p_pw, ''), pw_hash)) into ok;
  if not ok then insert into pl_attempts(who) values ('admin'); end if;
  return ok;
end $$;

create or replace function pl_team_name(p_edition text, p_team text) returns text
language sql stable security definer set search_path = public, extensions as $$
  select t ->> 'name' from pl_editions e, jsonb_array_elements(e.data -> 'teams') t
  where e.id = p_edition and t ->> 'id' = p_team limit 1
$$;

create or replace function pl_team_ok(p_edition text, p_team text, p_pw text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare h text; ok boolean; nm text; who text := 'team:' || p_edition || ':' || p_team;
begin
  perform pl_throttle(who);
  select pw_hash into h from pl_team_pw where edition = p_edition and team = p_team;
  if h is not null then
    ok := h = crypt(coalesce(p_pw, ''), h);
  else  -- výchozí heslo = název týmu (bez ohledu na velikost písmen)
    nm := pl_team_name(p_edition, p_team);
    ok := nm is not null and lower(trim(coalesce(p_pw, ''))) = lower(trim(nm));
  end if;
  if not ok then insert into pl_attempts(who) values (who); end if;
  return ok;
end $$;

-- ---------- přihlášení ----------
create or replace function pl_check_admin(p_pw text) returns boolean
language sql security definer set search_path = public, extensions as $$ select pl_admin_ok(p_pw) $$;
create or replace function pl_check_team(p_edition text, p_team text, p_pw text) returns boolean
language sql security definer set search_path = public, extensions as $$ select pl_team_ok(p_edition, p_team, p_pw) $$;

-- ---------- zápis kapitána ----------
-- Pravidla na serveru: heslo týmu, jen aktivní ročník, jen v den závodu (+1 den), jen další bod v pořadí,
-- čas po předchozím bodě. Vrací 'ok' | 'conflict' | 'error: důvod'.
create or replace function pl_submit_entry(p_edition text, p_team text, p_point int, p_minutes int, p_by text, p_pw text, p_at timestamptz default now())
returns text language plpgsql security definer set search_path = public, extensions as $$
declare act text; d date; cur pl_entries; last_pt int; prev_min int; now_min numeric; plan_min numeric;
begin
  if not pl_team_ok(p_edition, p_team, p_pw) then return 'error: špatné heslo'; end if;
  select value #>> '{}' into act from pl_settings where key = 'active_edition';
  if act is distinct from p_edition then return 'error: ročník není aktivní'; end if;
  select race_date into d from pl_editions where id = p_edition;
  -- zápis je možný v den závodu a do 6:00 dalšího dne (stejně jako v aplikaci)
  if d is not null and not ((now() at time zone 'Europe/Prague') >= d::timestamp and (now() at time zone 'Europe/Prague') < d::timestamp + interval '1 day 6 hours') then
    return 'error: zápis je možný jen v den závodu';
  end if;
  if p_point is null or p_point not between 0 and 9 or p_minutes is null or p_minutes not between 0 and 2879 then
    return 'error: neplatná hodnota';
  end if;
  select * into cur from pl_entries where edition = p_edition and team = p_team and point = p_point;
  if found then
    if cur.minutes = p_minutes then return 'ok'; end if;  -- opakované odeslání téhož
    return 'conflict';
  end if;
  select coalesce(max(point), -1) into last_pt from pl_entries where edition = p_edition and team = p_team;
  if p_point <> last_pt + 1 then return 'error: zapiš nejdřív předchozí bod'; end if;
  if p_point > 0 then
    select minutes into prev_min from pl_entries where edition = p_edition and team = p_team and point = p_point - 1;
    if p_minutes <= prev_min then return 'error: čas musí být po předchozím bodě'; end if;
    -- délka úseku musí být rámcově jako v plánu (0,3× až 3×), jinak jde o překlep
    select (t -> 'legs' -> (p_point - 1) ->> 'planMin')::numeric into plan_min
      from pl_editions e, jsonb_array_elements(e.data -> 'teams') t where e.id = p_edition and t ->> 'id' = p_team limit 1;
    if plan_min is not null and plan_min > 0 and (p_minutes - prev_min < plan_min * 0.3 or p_minutes - prev_min > plan_min * 3) then
      return 'error: délka úseku je mimo rozumný rozsah proti plánu';
    end if;
  end if;
  -- čas nesmí být v budoucnosti (minuty od půlnoci dne závodu, pražský čas, tolerance 3 min)
  if d is not null then
    now_min := extract(epoch from ((now() at time zone 'Europe/Prague') - d::timestamp)) / 60;
    if p_minutes > now_min + 3 then return 'error: čas je v budoucnosti'; end if;
  end if;
  insert into pl_entries(edition, team, point, minutes, by_who, at, src) values (p_edition, p_team, p_point, p_minutes, p_by, p_at, 'captain');
  insert into pl_history(edition, team, point, old_minutes, new_minutes, by_who, reason, at) values (p_edition, p_team, p_point, null, p_minutes, p_by, '', p_at);
  return 'ok';
end $$;

-- ---------- funkce admina (vždy s heslem admina) ----------
create or replace function pl_admin_set_entry(p_admin_pw text, p_edition text, p_team text, p_point int, p_minutes int, p_reason text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare old int;
begin
  if not pl_admin_ok(p_admin_pw) then raise exception 'Špatné heslo admina.'; end if;
  if p_point not between 0 and 9 or (p_minutes is not null and p_minutes not between 0 and 2879) then raise exception 'Neplatná hodnota.'; end if;
  select minutes into old from pl_entries where edition = p_edition and team = p_team and point = p_point;
  if p_minutes is null then
    delete from pl_entries where edition = p_edition and team = p_team and point = p_point;
  else
    insert into pl_entries(edition, team, point, minutes, by_who, src) values (p_edition, p_team, p_point, p_minutes, 'admin', 'admin')
    on conflict (edition, team, point) do update set minutes = excluded.minutes, by_who = 'admin', at = now(), src = 'admin';
  end if;
  insert into pl_history(edition, team, point, old_minutes, new_minutes, by_who, reason) values (p_edition, p_team, p_point, old, p_minutes, 'admin', coalesce(p_reason, ''));
end $$;

create or replace function pl_admin_clear_entries(p_admin_pw text, p_edition text)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
  if not pl_admin_ok(p_admin_pw) then raise exception 'Špatné heslo admina.'; end if;
  -- proč: nejdřív zapsat do historie, aby šly smazané časy obnovit
  insert into pl_history(edition, team, point, old_minutes, new_minutes, by_who, reason)
    select edition, team, point, minutes, null, 'admin', 'smazání všech zápisů' from pl_entries where edition = p_edition;
  delete from pl_entries where edition = p_edition;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function pl_admin_save_edition(p_admin_pw text, p_id text, p_label text, p_date date, p_data jsonb, p_xlsx text, p_gpx text, p_replace boolean)
returns text language plpgsql security definer set search_path = public, extensions as $$
begin
  if not pl_admin_ok(p_admin_pw) then raise exception 'Špatné heslo admina.'; end if;
  if exists (select 1 from pl_editions where id = p_id) then
    if not p_replace then return 'exists'; end if;
    insert into pl_edition_versions(edition, label, race_date, data, xlsx_b64, gpx)
      select e.id, e.label, e.race_date, e.data, f.xlsx_b64, e.gpx from pl_editions e left join pl_edition_files f on f.edition = e.id where e.id = p_id;  -- stará verze zůstane pro obnovení
    update pl_editions set label = p_label, race_date = p_date, data = p_data, gpx = p_gpx, updated_at = now() where id = p_id;
  else
    insert into pl_editions(id, label, race_date, data, gpx) values (p_id, p_label, p_date, p_data, p_gpx);
  end if;
  insert into pl_edition_files(edition, xlsx_b64) values (p_id, p_xlsx) on conflict (edition) do update set xlsx_b64 = excluded.xlsx_b64;
  insert into pl_settings(key, value) values ('active_edition', to_jsonb(p_id)) on conflict (key) do nothing;
  return 'ok';
end $$;

create or replace function pl_admin_get_xlsx(p_admin_pw text, p_edition text)
returns text language plpgsql security definer set search_path = public, extensions as $$
begin
  if not pl_admin_ok(p_admin_pw) then raise exception 'Špatné heslo admina.'; end if;
  return (select xlsx_b64 from pl_edition_files where edition = p_edition);
end $$;

create or replace function pl_admin_versions(p_admin_pw text, p_edition text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  if not pl_admin_ok(p_admin_pw) then raise exception 'Špatné heslo admina.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'saved_at', saved_at, 'label', label) order by id desc)
                   from pl_edition_versions where edition = p_edition), '[]'::jsonb);
end $$;

create or replace function pl_admin_restore_version(p_admin_pw text, p_version_id bigint)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v pl_edition_versions;
begin
  if not pl_admin_ok(p_admin_pw) then raise exception 'Špatné heslo admina.'; end if;
  select * into v from pl_edition_versions where id = p_version_id;
  if not found then raise exception 'Verze neexistuje.'; end if;
  insert into pl_edition_versions(edition, label, race_date, data, xlsx_b64, gpx)
    select e.id, e.label, e.race_date, e.data, f.xlsx_b64, e.gpx from pl_editions e left join pl_edition_files f on f.edition = e.id where e.id = v.edition;  -- i současný stav se uloží
  update pl_editions set label = v.label, race_date = v.race_date, data = v.data, gpx = v.gpx, updated_at = now() where id = v.edition;
  insert into pl_edition_files(edition, xlsx_b64) values (v.edition, v.xlsx_b64) on conflict (edition) do update set xlsx_b64 = excluded.xlsx_b64;
end $$;

create or replace function pl_admin_set_active(p_admin_pw text, p_edition text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not pl_admin_ok(p_admin_pw) then raise exception 'Špatné heslo admina.'; end if;
  if not exists (select 1 from pl_editions where id = p_edition) then raise exception 'Ročník neexistuje.'; end if;
  insert into pl_settings(key, value) values ('active_edition', to_jsonb(p_edition)) on conflict (key) do update set value = excluded.value;
end $$;

create or replace function pl_admin_set_setting(p_admin_pw text, p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not pl_admin_ok(p_admin_pw) then raise exception 'Špatné heslo admina.'; end if;
  if p_key not like 'looks:%' and p_key not like 'fb:%' then raise exception 'Nepovolené nastavení.'; end if;
  insert into pl_settings(key, value) values (p_key, p_value) on conflict (key) do update set value = excluded.value;
end $$;

create or replace function pl_admin_set_team_pw(p_admin_pw text, p_edition text, p_team text, p_new text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not pl_admin_ok(p_admin_pw) then raise exception 'Špatné heslo admina.'; end if;
  if coalesce(p_new, '') = '' then
    delete from pl_team_pw where edition = p_edition and team = p_team;      -- zpět na výchozí heslo (název týmu)
  else
    insert into pl_team_pw(edition, team, pw_hash) values (p_edition, p_team, crypt(p_new, gen_salt('bf')))
    on conflict (edition, team) do update set pw_hash = excluded.pw_hash;
  end if;
end $$;

create or replace function pl_admin_change_pw(p_old text, p_new text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not pl_admin_ok(p_old) then raise exception 'Špatné heslo admina.'; end if;
  if length(coalesce(p_new, '')) < 8 then raise exception 'Nové heslo musí mít aspoň 8 znaků.'; end if;
  update pl_admin set pw_hash = crypt(p_new, gen_salt('bf')) where id = 1;
end $$;

-- první nastavení hesla admina: smí jen majitel databáze (SQL Editor), ne aplikace
create or replace function pl_init_admin(p_pw text) returns text
language plpgsql security definer set search_path = public, extensions as $$
begin
  if exists (select 1 from pl_admin) then return 'Heslo admina už je nastavené (změna: v aplikaci Admin → Ostatní).'; end if;
  if length(coalesce(p_pw, '')) < 8 then raise exception 'Heslo musí mít aspoň 8 znaků.'; end if;
  insert into pl_admin(id, pw_hash) values (1, crypt(p_pw, gen_salt('bf')));
  return 'Heslo admina nastaveno.';
end $$;
revoke all on function pl_init_admin(text) from public, anon, authenticated;
revoke all on function pl_admin_ok(text), pl_team_ok(text, text, text), pl_throttle(text), pl_team_name(text, text) from public, anon, authenticated;

-- ---------- živé aktualizace ----------
do $$
declare t text;
begin
  foreach t in array array['pl_editions','pl_entries','pl_history','pl_settings'] loop
    begin execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;
