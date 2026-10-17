import { createLocalAdapter } from './local.js';
import { createSupabaseAdapter } from './supabase.js';
import { POINTS, entriesFromScenario } from '../domain/calc.js';

const OUTBOX_KEY = 'prasous.outbox.v1';
const OFFLINE_KEY = 'prasous.forceOffline';
export const DEFAULT_SETTINGS = { year: 2026, date: '2026-04-25', sim: { on: false } };

const env = import.meta.env || {};
const readJson = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

export function createStore() {
  let adapter = null;
  let raw = { race: null, xlsxB64: null, gpx: null, entries: {}, history: [], settings: {}, passwords: {} };
  let outbox = readJson(OUTBOX_KEY, []);
  let forceOffline = localStorage.getItem(OFFLINE_KEY) === '1';
  let flushing = false;
  let state = {};
  const subs = new Set();

  function derive(extra = {}) {
    const entries = {}, meta = {};
    for (const t of raw.race?.teams || []) {
      entries[t.id] = Array(POINTS).fill(null);
      meta[t.id] = Array(POINTS).fill(null);
      (raw.entries[t.id] || []).forEach((e, i) => { if (e) { entries[t.id][i] = e.minutes; meta[t.id][i] = e; } });
    }
    for (const o of outbox) if (o.status === 'pending' && entries[o.team]) entries[o.team][o.point] = o.minutes;
    state = {
      ...state,
      race: raw.race, hasFiles: !!raw.xlsxB64, gpx: raw.gpx,
      entries, meta, history: raw.history, passwords: raw.passwords,
      settings: { ...DEFAULT_SETTINGS, ...raw.settings },
      outbox: [...outbox], online: !forceOffline && navigator.onLine !== false, forceOffline,
      ...extra,
    };
    subs.forEach((f) => f());
  }
  const saveOutbox = () => localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));

  async function refresh() {
    try {
      raw = await adapter.load();
      derive({ error: null });
    } catch (e) {
      derive({ error: `Databáze nedostupná: ${e.message}` });
    }
  }

  async function flush() {
    if (flushing || !adapter || forceOffline || navigator.onLine === false) return;
    flushing = true;
    let sentAny = false;
    try {
      for (const o of outbox.filter((x) => x.status === 'pending')) {
        const cur = raw.entries[o.team]?.[o.point];
        // konflikt: admin mezitím zapsal jinou hodnotu novější než tento zápis
        if (cur && cur.by === 'admin' && cur.minutes !== o.minutes && cur.at > o.createdAt) { o.status = 'conflict'; continue; }
        try {
          await adapter.upsertEntry({ team: o.team, point: o.point, minutes: o.minutes, by: o.by, at: o.createdAt, src: o.src, old: cur?.minutes ?? null });
          o.status = 'sent'; o.sentAt = new Date().toISOString(); sentAny = true;
        } catch { break; } // bez signálu: zkusíme znovu později
      }
      outbox = outbox.filter((x) => x.status !== 'sent' || Date.now() - Date.parse(x.sentAt) < 6 * 3600e3);
      saveOutbox();
    } finally { flushing = false; }
    if (sentAny) await refresh(); // bez odeslaných zápisů se data nenačítají (šetří databázi, nic se zbytečně nepřekresluje)
  }

  const store = {
    getState: () => state,
    subscribe(f) { subs.add(f); return () => subs.delete(f); },

    async init() {
      const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_KEY;
      const wantLocal = new URLSearchParams(location.search).has('local') || localStorage.getItem('prasous.mode') === 'local';
      let banner = null;
      if (url && key && !wantLocal) {
        adapter = createSupabaseAdapter(url, key);
        try { raw = await adapter.load(); }
        catch (e) { banner = `Databáze Supabase není dostupná nebo nemá tabulky (${e.message}). Běží lokální režim bez sdílení mezi zařízeními.`; adapter = null; }
      }
      if (!adapter) { adapter = createLocalAdapter(); raw = await adapter.load(); }
      derive({ ready: true, mode: adapter.name, banner, error: null });
      adapter.subscribe(refresh);
      window.addEventListener('online', flush);
      setInterval(flush, 10000);
      flush();
    },

    // ---- zápisy ----
    /** Zápis předávky kapitánem: nejdřív do telefonu (fronta), pak odeslání. */
    async submitEntry({ team, point, minutes, by }) {
      outbox.push({ id: crypto.randomUUID?.() || String(Math.random()), team, point, minutes, by, src: 'captain', createdAt: new Date().toISOString(), status: 'pending' });
      saveOutbox(); derive();
      await flush();
    },
    async retryConflict(id, keepMine) {
      const o = outbox.find((x) => x.id === id);
      if (!o) return;
      if (keepMine) o.status = 'pending'; else outbox = outbox.filter((x) => x.id !== id);
      saveOutbox(); derive(); await flush();
    },
    /** Oprava adminem (přímo, vyžaduje spojení). */
    async adminSet({ team, point, minutes, reason }) {
      const old = raw.entries[team]?.[point]?.minutes ?? null;
      await adapter.upsertEntry({ team, point, minutes, by: 'admin', at: new Date().toISOString(), src: 'admin', reason, old });
      await refresh();
    },
    async simWrite(list) {
      for (const e of list) await adapter.upsertEntry({ ...e, by: 'simulace', at: new Date().toISOString(), src: 'sim', old: raw.entries[e.team]?.[e.point]?.minutes ?? null });
      await refresh();
    },
    async clearEntries() { outbox = []; saveOutbox(); await adapter.clearEntries(); await refresh(); },

    // ---- nastavení ----
    async setSetting(key, value) { raw.settings = { ...raw.settings, [key]: value }; derive(); await adapter.setSetting(key, value); },
    async setPassword(team, pw) { await adapter.setPassword(team, pw); await refresh(); },
    async saveRace(race, xlsxB64, gpx) { await adapter.saveRace(race, xlsxB64, gpx); await refresh(); },
    getFiles: () => ({ xlsxB64: raw.xlsxB64, gpx: raw.gpx }),

    setForceOffline(v) { forceOffline = v; localStorage.setItem(OFFLINE_KEY, v ? '1' : '0'); derive(); if (!v) flush(); },
    flush, refresh,
    scenarioEntries: (T) => entriesFromScenario(raw.race, T),
    switchMode(mode) { localStorage.setItem('prasous.mode', mode); location.reload(); },
  };
  return store;
}
