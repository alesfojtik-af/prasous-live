/* Lokální adaptér: data v prohlížeči (localStorage), synchronizace mezi okny/záložkami přes BroadcastChannel.
   Hodí se pro zkoušení na jednom zařízení. Pro sdílení mezi telefony slouží adaptér Supabase. */

const RACE_KEY = 'prasous.race.v1';
const DYN_KEY = 'prasous.dyn.v1';
const EMPTY_DYN = { entries: {}, history: [], settings: {}, passwords: {} };

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

export function createLocalAdapter() {
  const chan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('prasous') : null;
  const ping = () => chan?.postMessage('changed');
  const dyn = () => ({ ...EMPTY_DYN, ...read(DYN_KEY, {}) });
  const saveDyn = (d) => { localStorage.setItem(DYN_KEY, JSON.stringify(d)); ping(); };

  return {
    name: 'local',
    async load() {
      const r = read(RACE_KEY, null);
      const d = dyn();
      return { race: r?.race ?? null, xlsxB64: r?.xlsxB64 ?? null, gpx: r?.gpx ?? null, ...d };
    },
    async saveRace(race, xlsxB64, gpx) {
      localStorage.setItem(RACE_KEY, JSON.stringify({ race, xlsxB64, gpx }));
      ping();
    },
    async upsertEntry({ team, point, minutes, by, at, src, reason, old }) {
      const d = dyn();
      const arr = (d.entries[team] ||= []);
      arr[point] = minutes == null ? null : { minutes, by, at, src };
      d.history.push({ id: Date.now() + Math.random(), team, point, old: old ?? null, new: minutes, by, reason: reason || '', at });
      d.history = d.history.slice(-2000);
      saveDyn(d);
    },
    async clearEntries() { const d = dyn(); d.entries = {}; d.history = []; saveDyn(d); },
    async setSetting(key, value) { const d = dyn(); d.settings[key] = value; saveDyn(d); },
    async setPassword(team, pw) { const d = dyn(); d.passwords[team] = pw; saveDyn(d); },
    subscribe(cb) {
      const h = () => cb();
      chan?.addEventListener('message', h);
      window.addEventListener('storage', h);
      return () => { chan?.removeEventListener('message', h); window.removeEventListener('storage', h); };
    },
  };
}
