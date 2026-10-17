/* Lokální adaptér: data jen v prohlížeči tohoto zařízení (localStorage), okna se synchronizují přes BroadcastChannel.
   Hodí se pro zkoušení bez databáze. Má stejné rozhraní jako adaptér Supabase (viz supabase.js). */

const ED_KEY = 'prasous.v2.editions';
const DYN_KEY = 'prasous.v2.dyn';
const ADMIN_PW = import.meta.env.VITE_ADMIN_PASSWORD || 'prasous-admin';
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const norm = (x) => String(x ?? '').trim().toLowerCase();

export function createLocalAdapter() {
  const chan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('prasous') : null;
  const ping = () => chan?.postMessage('changed');
  const eds = () => read(ED_KEY, { editions: {}, versions: [] });
  const dyn = () => ({ entries: {}, history: [], settings: {}, teamPw: {}, ...read(DYN_KEY, {}) });
  const saveEds = (e) => { localStorage.setItem(ED_KEY, JSON.stringify(e)); ping(); };
  const saveDyn = (d) => { localStorage.setItem(DYN_KEY, JSON.stringify(d)); ping(); };
  const needAdmin = (pw) => { if (pw !== ADMIN_PW) throw new Error('Špatné heslo admina.'); };
  const teamName = (ed, team) => eds().editions[ed]?.data?.teams?.find((t) => t.id === team)?.name;

  return {
    name: 'local',
    async loadCommon() {
      const e = eds();
      return {
        editions: Object.entries(e.editions).map(([id, x]) => ({ id, label: x.label, race_date: x.race_date, updated_at: x.updated_at })),
        settings: dyn().settings,
      };
    },
    async loadEditionBody(id) { const x = eds().editions[id]; return x ? { race: x.data, gpx: x.gpx, updated_at: x.updated_at } : null; },
    async loadXlsx(id) { return eds().editions[id]?.xlsx_b64 ?? null; },
    async loadEntries(id) { const d = dyn(); return { entries: d.entries[id] || {}, history: d.history.filter((h) => h.edition === id) }; },

    async checkAdmin(pw) { return pw === ADMIN_PW; },
    async checkTeam(ed, team, pw) { const own = dyn().teamPw[ed]?.[team]; return own != null ? pw === own : norm(pw) === norm(teamName(ed, team)); },

    async submitEntry({ edition, team, point, minutes, by, at, pw }) {
      if (!(await this.checkTeam(edition, team, pw))) return 'error: špatné heslo';
      const d = dyn();
      if (d.settings.active_edition !== edition) return 'error: ročník není aktivní';
      const arr = (d.entries[edition] ||= {})[team] ||= [];
      const cur = arr[point];
      if (cur) return cur.minutes === minutes ? 'ok' : 'conflict';
      const last = arr.reduce((m, x, i) => (x ? i : m), -1);
      if (point !== last + 1) return 'error: zapiš nejdřív předchozí bod';
      if (point > 0 && minutes <= arr[point - 1].minutes) return 'error: čas musí být po předchozím bodě';
      arr[point] = { minutes, by, at, src: 'captain' };
      d.history.push({ id: Date.now() + Math.random(), edition, team, point, old: null, new: minutes, by, reason: '', at });
      saveDyn(d);
      return 'ok';
    },
    async adminSetEntry({ adminPw, edition, team, point, minutes, reason }) {
      needAdmin(adminPw);
      const d = dyn();
      const arr = (d.entries[edition] ||= {})[team] ||= [];
      const old = arr[point]?.minutes ?? null;
      arr[point] = minutes == null ? null : { minutes, by: 'admin', at: new Date().toISOString(), src: 'admin' };
      d.history.push({ id: Date.now() + Math.random(), edition, team, point, old, new: minutes, by: 'admin', reason: reason || '', at: new Date().toISOString() });
      saveDyn(d);
    },
    async adminClear(adminPw, edition) {
      needAdmin(adminPw);
      const d = dyn();
      for (const [team, arr] of Object.entries(d.entries[edition] || {})) arr.forEach((e, point) => e && d.history.push({ id: Date.now() + Math.random(), edition, team, point, old: e.minutes, new: null, by: 'admin', reason: 'smazání všech zápisů', at: new Date().toISOString() }));
      delete d.entries[edition];
      saveDyn(d);
    },
    async adminSaveEdition(adminPw, { id, label, date, race, xlsxB64, gpx, replace }) {
      needAdmin(adminPw);
      const e = eds();
      const now = new Date().toISOString();
      if (e.editions[id]) {
        if (!replace) return 'exists';
        e.versions.push({ id: Date.now(), edition: id, saved_at: now, ...e.editions[id] });  // stará verze zůstane pro obnovení
      }
      e.editions[id] = { label, race_date: date, data: race, xlsx_b64: xlsxB64, gpx, updated_at: now };
      saveEds(e);
      const d = dyn();
      if (!d.settings.active_edition) { d.settings.active_edition = id; saveDyn(d); }
      return 'ok';
    },
    async adminVersions(adminPw, edition) { needAdmin(adminPw); return eds().versions.filter((v) => v.edition === edition).map((v) => ({ id: v.id, saved_at: v.saved_at, label: v.label })).reverse(); },
    async adminRestoreVersion(adminPw, versionId) {
      needAdmin(adminPw);
      const e = eds(), v = e.versions.find((x) => x.id === versionId);
      if (!v) throw new Error('Verze neexistuje.');
      e.versions.push({ id: Date.now(), edition: v.edition, saved_at: new Date().toISOString(), ...e.editions[v.edition] });
      const { id, edition, saved_at, ...body } = v;
      e.editions[v.edition] = { ...body, updated_at: new Date().toISOString() };
      saveEds(e);
    },
    async adminSetActive(adminPw, id) { needAdmin(adminPw); const d = dyn(); d.settings.active_edition = id; saveDyn(d); },
    async adminSetSetting(adminPw, key, value) { needAdmin(adminPw); const d = dyn(); d.settings[key] = value; saveDyn(d); },
    async adminSetTeamPw(adminPw, edition, team, pw) {
      needAdmin(adminPw);
      const d = dyn();
      d.teamPw[edition] ||= {};
      if (pw) d.teamPw[edition][team] = pw; else delete d.teamPw[edition][team];
      saveDyn(d);
    },
    async adminChangePw() { throw new Error('V lokálním režimu se heslo admina mění v proměnné VITE_ADMIN_PASSWORD.'); },

    subscribe(cb) {
      const h = () => cb();
      chan?.addEventListener('message', h);
      window.addEventListener('storage', h);
      return () => { chan?.removeEventListener('message', h); window.removeEventListener('storage', h); };
    },
  };
}
