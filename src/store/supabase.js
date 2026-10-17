import { createClient } from '@supabase/supabase-js';

/* Adaptér Supabase (Postgres + realtime). Tabulky viz supabase/schema.sql. */

export function createSupabaseAdapter(url, key) {
  const sb = createClient(url, key, { realtime: { params: { eventsPerSecond: 10 } } });
  const must = (res) => { if (res.error) throw new Error(res.error.message); return res.data; };

  return {
    name: 'supabase',
    async load() {
      const [race, entries, history, settings, passwords] = await Promise.all([
        sb.from('app_race').select('*').eq('id', 1).maybeSingle().then(must),
        sb.from('app_entries').select('*').then(must),
        sb.from('app_history').select('*').order('id', { ascending: false }).limit(300).then(must),
        sb.from('app_settings').select('*').then(must),
        sb.from('app_passwords').select('*').then(must),
      ]);
      const ent = {};
      for (const e of entries) (ent[e.team] ||= [])[e.point] = { minutes: e.minutes, by: e.by_who, at: e.at, src: e.src };
      return {
        race: race?.data ?? null, xlsxB64: race?.xlsx_b64 ?? null, gpx: race?.gpx ?? null,
        entries: ent,
        history: history.reverse().map((h) => ({ id: h.id, team: h.team, point: h.point, old: h.old_minutes, new: h.new_minutes, by: h.by_who, reason: h.reason, at: h.at })),
        settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
        passwords: Object.fromEntries(passwords.map((p) => [p.team, p.password])),
      };
    },
    async saveRace(race, xlsxB64, gpx) {
      must(await sb.from('app_race').upsert({ id: 1, data: race, xlsx_b64: xlsxB64, gpx, updated_at: new Date().toISOString() }));
    },
    async upsertEntry({ team, point, minutes, by, at, src, reason, old }) {
      must(await sb.from('app_history').insert({ team, point, old_minutes: old ?? null, new_minutes: minutes, by_who: by, reason: reason || '', at }));
      if (minutes == null) must(await sb.from('app_entries').delete().eq('team', team).eq('point', point));
      else must(await sb.from('app_entries').upsert({ team, point, minutes, by_who: by, at, src }));
    },
    async clearEntries() {
      must(await sb.from('app_entries').delete().neq('team', '\u0000'));
      must(await sb.from('app_history').delete().neq('id', -1));
    },
    async setSetting(key, value) { must(await sb.from('app_settings').upsert({ key, value })); },
    async setPassword(team, password) { must(await sb.from('app_passwords').upsert({ team, password })); },
    subscribe(cb) {
      let t;
      const kick = () => { clearTimeout(t); t = setTimeout(cb, 250); };
      const ch = sb.channel('prasous-live');
      for (const table of ['app_race', 'app_entries', 'app_history', 'app_settings', 'app_passwords'])
        ch.on('postgres_changes', { event: '*', schema: 'public', table }, kick);
      ch.subscribe();
      const poll = setInterval(cb, 20000); // pojistka, kdyby realtime vypadl
      return () => { clearInterval(poll); sb.removeChannel(ch); };
    },
  };
}
