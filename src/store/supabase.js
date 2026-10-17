/* Adaptér úložiště pro Supabase: čte z tabulek pl_*, zapisuje výhradně přes funkce v databázi (supabase/schema.sql), které ověřují hesla a pravidla. */
import { createClient } from '@supabase/supabase-js';

/* Adaptér Supabase (Postgres + realtime). Čtení jde přímo z tabulek, všechny zápisy přes funkce v databázi,
   které na serveru ověří heslo (viz supabase/schema.sql). Rozhraní je stejné jako u lokálního adaptéru. */

export function createSupabaseAdapter(url, key) {
  const sb = createClient(url, key, { realtime: { params: { eventsPerSecond: 10 } } });
  const must = (res) => { if (res.error) throw new Error(res.error.message); return res.data; };
  const rpc = async (fn, args) => must(await sb.rpc(fn, args));

  return {
    name: 'supabase',
    async loadCommon() {
      const [editions, settings] = await Promise.all([
        sb.from('pl_editions').select('id,label,race_date,updated_at').order('id').then(must),
        sb.from('pl_settings').select('*').then(must),
      ]);
      return { editions, settings: Object.fromEntries(settings.map((s) => [s.key, s.value])) };
    },
    async loadEditionBody(id) {
      const r = must(await sb.from('pl_editions').select('data,gpx,updated_at').eq('id', id).maybeSingle());
      return r ? { race: r.data, gpx: r.gpx, updated_at: r.updated_at } : null;
    },
    loadXlsx: (adminPw, id) => rpc('pl_admin_get_xlsx', { p_admin_pw: adminPw, p_edition: id }),
    /** Historii změn čte jen admin (diváci ji nepotřebují, šetří se tím data při každé obnově). */
    async loadEntries(id, withHistory = false) {
      const [entries, history] = await Promise.all([
        sb.from('pl_entries').select('team,point,minutes,by_who,at,src').eq('edition', id).then(must),
        withHistory ? sb.from('pl_history').select('*').eq('edition', id).order('id', { ascending: false }).limit(300).then(must) : [],
      ]);
      const ent = {};
      for (const e of entries) (ent[e.team] ||= [])[e.point] = { minutes: e.minutes, by: e.by_who, at: e.at, src: e.src };
      return { entries: ent, history: history.reverse().map((h) => ({ id: h.id, edition: h.edition, team: h.team, point: h.point, old: h.old_minutes, new: h.new_minutes, by: h.by_who, reason: h.reason, at: h.at })) };
    },

    checkAdmin: (pw) => rpc('pl_check_admin', { p_pw: pw }),
    checkTeam: (ed, team, pw) => rpc('pl_check_team', { p_edition: ed, p_team: team, p_pw: pw }),
    submitEntry: ({ edition, team, point, minutes, by, at, pw }) => rpc('pl_submit_entry', { p_edition: edition, p_team: team, p_point: point, p_minutes: minutes, p_by: by, p_pw: pw, p_at: at }),
    adminSetEntry: ({ adminPw, edition, team, point, minutes, reason }) => rpc('pl_admin_set_entry', { p_admin_pw: adminPw, p_edition: edition, p_team: team, p_point: point, p_minutes: minutes, p_reason: reason || '' }),
    adminClear: (adminPw, edition) => rpc('pl_admin_clear_entries', { p_admin_pw: adminPw, p_edition: edition }),
    adminSaveEdition: (adminPw, { id, label, date, race, xlsxB64, gpx, replace }) => rpc('pl_admin_save_edition', { p_admin_pw: adminPw, p_id: id, p_label: label, p_date: date || null, p_data: race, p_xlsx: xlsxB64, p_gpx: gpx, p_replace: !!replace }),
    adminVersions: (adminPw, edition) => rpc('pl_admin_versions', { p_admin_pw: adminPw, p_edition: edition }),
    adminRestoreVersion: (adminPw, versionId) => rpc('pl_admin_restore_version', { p_admin_pw: adminPw, p_version_id: versionId }),
    adminSetActive: (adminPw, id) => rpc('pl_admin_set_active', { p_admin_pw: adminPw, p_edition: id }),
    adminSetSetting: (adminPw, key, value) => rpc('pl_admin_set_setting', { p_admin_pw: adminPw, p_key: key, p_value: value }),
    adminSetTeamPw: (adminPw, edition, team, pw) => rpc('pl_admin_set_team_pw', { p_admin_pw: adminPw, p_edition: edition, p_team: team, p_new: pw || '' }),
    adminChangePw: (oldPw, newPw) => rpc('pl_admin_change_pw', { p_old: oldPw, p_new: newPw }),

    /** Zkouška spojení a oprávnění pro admina (tlačítko v Admin → Ostatní). Vrací [{ name, ok, detail }]. */
    async selfTest(adminPw) {
      const out = [];
      const step = async (name, fn) => { try { const r = await fn(); out.push({ name, ok: !!r.ok, detail: r.detail || '' }); } catch (e) { out.push({ name, ok: false, detail: e.message }); } };
      await step('Čtení ročníků', async () => { const r = must(await sb.from('pl_editions').select('id').limit(5)); return { ok: true, detail: `${r.length} ročníků` }; });
      await step('Čtení zápisů a nastavení', async () => { must(await sb.from('pl_entries').select('team').limit(1)); must(await sb.from('pl_settings').select('key').limit(1)); return { ok: true }; });
      await step('Zápis přímo do tabulky je zakázán', async () => { const r = await sb.from('pl_entries').insert({ edition: '__test', team: 'x', point: 0, minutes: 1 }); return { ok: !!r.error, detail: r.error ? 'odmítnuto' : 'POZOR: zápis prošel' }; });
      await step('Tabulka souborů není veřejně čitelná', async () => { const r = await sb.from('pl_edition_files').select('xlsx_b64').limit(1); return { ok: !r.error && !(r.data || []).length, detail: (r.data || []).length ? 'POZOR: čitelné' : 'prázdné/odmítnuto' }; });
      await step('Špatné heslo admina je odmítnuto', async () => ({ ok: (await rpc('pl_check_admin', { p_pw: '__spatne__' })) === false }));
      await step('Správné heslo admina projde', async () => ({ ok: (await rpc('pl_check_admin', { p_pw: adminPw })) === true }));
      await step('Špatné heslo kapitána je odmítnuto', async () => ({ ok: (await rpc('pl_submit_entry', { p_edition: '__test', p_team: 'x', p_point: 0, p_minutes: 1, p_by: 'test', p_pw: '__spatne__', p_at: new Date().toISOString() })) === 'error: špatné heslo' }));
      return out;
    },

    subscribe(cb) {
      let t;
      const kick = () => { clearTimeout(t); t = setTimeout(cb, 250); };
      const ch = sb.channel('prasous-live');
      for (const table of ['pl_editions', 'pl_entries', 'pl_history', 'pl_settings'])
        ch.on('postgres_changes', { event: '*', schema: 'public', table }, kick);
      ch.subscribe();
      const poll = setInterval(cb, 20000); // pojistka, kdyby realtime vypadl
      return () => { clearInterval(poll); sb.removeChannel(ch); };
    },
  };
}
