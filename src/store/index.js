/* Datová vrstva aplikace: ročníky, zápisy, přihlašovací údaje, offline fronta a simulace.
   Adaptér (local.js / supabase.js) řeší jen uložení. Pravidla zápisu hlídá server (supabase/schema.sql). */
import { createLocalAdapter } from './local.js';
import { createSupabaseAdapter } from './supabase.js';
import { POINTS } from '../domain/calc.js';
import { racePhase } from '../domain/phase.js';

const OUTBOX_KEY = 'prasous.outbox.v2';
const SIM_KEY = 'prasous.sim.v1';
const VIEW_KEY = 'prasous.view';
const OFFLINE_KEY = 'prasous.forceOffline';
const env = import.meta.env || {};
const readJson = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const emptyLine = () => Array(POINTS).fill(null);

// Facebooková událost ročníku, dokud ji admin nenastaví v Admin → Ostatní
const SEED_ID = '2026';
const DEFAULT_FB = { 2026: 'https://fb.me/e/5srJiXC2r' };

export function createStore() {
  let adapter = null;
  let common = { editions: [], settings: {} };
  let body = null;                 // { id, race, gpx, updated_at } vybraného ročníku (načítá se jen při změně)
  let live = { entries: {}, history: [] };
  let outbox = readJson(OUTBOX_KEY, []);
  let sim = readJson(SIM_KEY, { on: false });
  let creds = { role: 'viewer' };
  let forceOffline = localStorage.getItem(OFFLINE_KEY) === '1';
  let viewOverride = sessionStorage.getItem(VIEW_KEY);
  let flushing = false;
  let state = {};
  const subs = new Set();

  const activeId = () => common.settings.active_edition ?? common.editions[0]?.id ?? null;
  const viewId = () => (viewOverride && common.editions.some((e) => e.id === viewOverride) ? viewOverride : activeId());

  function derive(extra = {}) {
    const vid = viewId();
    const edition = common.editions.find((e) => e.id === vid) ?? null;
    const race = body?.id === vid ? body.race : null;
    const entries = {}, meta = {};
    for (const t of race?.teams || []) {
      entries[t.id] = emptyLine(); meta[t.id] = emptyLine();
      if (sim.on) { (sim.entries?.[t.id] || []).forEach((m, i) => { entries[t.id][i] = m ?? null; }); continue; }
      (live.entries[t.id] || []).forEach((e, i) => { if (e) { entries[t.id][i] = e.minutes; meta[t.id][i] = e; } });
      for (const o of outbox) if (o.status === 'pending' && o.edition === vid && entries[o.team]) entries[o.team][o.point] = o.minutes;
    }
    state = {
      ...state,
      editions: common.editions, activeId: activeId(), viewId: vid, edition, isArchive: !!vid && vid !== activeId(),
      race, gpx: body?.id === vid ? body.gpx : null,
      entries, meta, history: sim.on ? sim.history || [] : live.history,
      settings: { year: edition?.label ?? '', date: edition?.race_date ?? null, fb: common.settings[`fb:${vid}`] || DEFAULT_FB[vid] || '', looks: common.settings[`looks:${vid}`] || {}, sim: sim.on ? sim : { on: false } },
      phase: racePhase(edition?.race_date, new Date(), !!sim.on),
      outbox: outbox.filter((o) => !vid || o.edition === vid), online: !forceOffline && navigator.onLine !== false, forceOffline,
      ...extra,
    };
    subs.forEach((f) => f());
  }
  const saveOutbox = () => localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
  const saveSim = () => { localStorage.setItem(SIM_KEY, JSON.stringify(sim)); derive(); };

  // Vestavěný ročník 2026 (výsledky jako dokončená simulace): je v aplikaci pro každého, dokud ho nepřebije ročník v databázi se stejným označením.
  let seed = null;
  const loadSeed = async () => (seed ||= (await import('../../data/seed/2026.json')).default);
  const isSeedView = (vid) => vid === SEED_ID && !common.editions.some((e) => e.id === SEED_ID && !e.builtin);

  async function refresh() {
    try {
      common = await adapter.loadCommon();
      if (!common.editions.some((e) => e.id === SEED_ID)) {
        const sd = await loadSeed();
        common = { ...common, editions: [...common.editions, { id: sd.id, label: sd.label, race_date: sd.race_date, updated_at: 'seed', builtin: true }].sort((a, b) => a.id.localeCompare(b.id)) };
      }
      const vid = viewId();
      if (vid && isSeedView(vid)) {
        const sd = await loadSeed();
        body = { id: vid, race: sd.race, gpx: sd.gpx, updated_at: 'seed' };
        live = { entries: Object.fromEntries(Object.entries(sd.entries).map(([t, arr]) => [t, arr.map((m) => (m == null ? null : { minutes: m, by: 'výsledky', src: 'seed' }))])), history: [] };
      } else if (vid) {
        const meta = common.editions.find((e) => e.id === vid);
        if (!body || body.id !== vid || body.updated_at !== meta?.updated_at) { // těžká data (trasa, týmy) jen když se změnila
          const b = await adapter.loadEditionBody(vid);
          body = b ? { id: vid, ...b } : null;
        }
        live = await adapter.loadEntries(vid, creds.role === 'admin');
      } else { body = null; live = { entries: {}, history: [] }; }
      derive({ error: null });
    } catch (e) { derive({ error: `Databáze nedostupná: ${e.message}` }); }
  }

  /** Odešle čekající zápisy kapitána. Při chybě spojení se zkusí znovu později. */
  async function flush() {
    if (flushing || !adapter || forceOffline || navigator.onLine === false) return;
    flushing = true;
    let sentAny = false;
    try {
      for (const o of outbox.filter((x) => x.status === 'pending')) {
        if (creds.role !== 'captain' || creds.team !== o.team) continue; // bez hesla týmu zápis neodešleme, počká
        try {
          const res = await adapter.submitEntry({ edition: o.edition, team: o.team, point: o.point, minutes: o.minutes, by: o.by, at: o.createdAt, pw: creds.pw });
          if (res === 'ok') { o.status = 'sent'; o.sentAt = new Date().toISOString(); sentAny = true; }
          else if (res === 'conflict') o.status = 'conflict';
          else { o.status = 'error'; o.error = String(res).replace(/^error:\s*/, ''); }
        } catch { break; } // bez signálu
      }
      outbox = outbox.filter((x) => x.status !== 'sent' || Date.now() - Date.parse(x.sentAt) < 6 * 3600e3);
      saveOutbox();
    } finally { flushing = false; }
    if (sentAny) await refresh(); // bez odeslaných zápisů se data nenačítají
    else derive();
  }

  const needAdmin = () => { if (creds.role !== 'admin') throw new Error('Tato akce je jen pro admina.'); return creds.adminPw; };
  const simWriteEntry = (team, point, minutes, by, reason) => {
    const arr = (sim.entries[team] ||= emptyLine());
    const old = arr[point];
    arr[point] = minutes;
    (sim.history ||= []).push({ id: Date.now() + Math.random(), team, point, old, new: minutes, by, reason: reason || '', at: new Date().toISOString() });
  };

  const store = {
    getState: () => state,
    subscribe(f) { subs.add(f); return () => subs.delete(f); },

    async init() {
      const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_KEY;
      const wantLocal = new URLSearchParams(location.search).has('local') || localStorage.getItem('prasous.mode') === 'local';
      let banner = null;
      if (url && key && !wantLocal) {
        adapter = createSupabaseAdapter(url, key);
        try { await adapter.loadCommon(); }
        catch (e) { banner = `Databáze Supabase není dostupná nebo nemá tabulky (${e.message}). Běží lokální režim bez sdílení mezi zařízeními.`; adapter = null; }
      }
      if (!adapter) adapter = createLocalAdapter();
      state = { ready: true, mode: adapter.name, banner };
      await refresh();
      adapter.subscribe(refresh);
      window.addEventListener('online', flush);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); }); // po návratu do aplikace hned čerstvá data
      setInterval(flush, 10000);
      flush();
    },
    setCreds(c) { const wasAdmin = creds.role === 'admin'; creds = c; flush(); if (c.role === 'admin' && !wasAdmin) refresh(); }, // admin potřebuje i historii změn

    // ---- přihlášení (hesla ověřuje server) ----
    checkAdmin: (pw) => adapter.checkAdmin(pw),
    checkTeam: (teamId, pw) => adapter.checkTeam(activeId(), teamId, pw),

    // ---- ročníky ----
    viewEdition(id) { viewOverride = id; if (id) sessionStorage.setItem(VIEW_KEY, id); else sessionStorage.removeItem(VIEW_KEY); return refresh(); },
    async saveEdition(e) { const r = await adapter.adminSaveEdition(needAdmin(), e); await refresh(); return r; },
    async setActive(id) { await adapter.adminSetActive(needAdmin(), id); viewOverride = null; sessionStorage.removeItem(VIEW_KEY); await refresh(); },
    versions: (id) => adapter.adminVersions(needAdmin(), id),
    async restoreVersion(vid) { await adapter.adminRestoreVersion(needAdmin(), vid); await refresh(); },
    getXlsx: () => adapter.loadXlsx(needAdmin(), viewId()),
    selfTest: () => adapter.selfTest(needAdmin()),

    // ---- zápisy ----
    /** Zápis předávky kapitánem: nejdřív do telefonu (fronta), pak odeslání na server. V simulaci jen v tomto zařízení. */
    async submitEntry({ team, point, minutes, by }) {
      if (sim.on) { simWriteEntry(team, point, minutes, by); saveSim(); return; }
      outbox.push({ id: crypto.randomUUID?.() || String(Math.random()), edition: viewId(), team, point, minutes, by, createdAt: new Date().toISOString(), status: 'pending' });
      saveOutbox(); derive();
      await flush();
    },
    async retryConflict(id, keepMine) {
      outbox = keepMine ? outbox.filter((x) => x.id !== id) : outbox.filter((x) => x.id !== id);
      saveOutbox(); derive(); // přepsání cizího zápisu smí jen admin; kapitán nesprávný zápis zahodí a nechá opravit adminem
      await refresh();
    },
    async adminSetEntry({ team, point, minutes, reason }) {
      if (sim.on) { simWriteEntry(team, point, minutes, 'admin', reason); saveSim(); return; }
      await adapter.adminSetEntry({ adminPw: needAdmin(), edition: viewId(), team, point, minutes, reason });
      await refresh();
    },
    /** Doplní do ročníku výsledky z Excelu (skutečné časy všech týmů = dokončená simulace). Vrací počet zapsaných časů. */
    async importResultsFromExcel() {
      const rows = (state.race?.teams || []).flatMap((t) => (t.scenario || []).map((minutes, point) => ({ team: t.id, point, minutes })).filter((r) => r.minutes != null));
      if (!rows.length) throw new Error('V Excelu nejsou skutečné časy.');
      const n = await adapter.adminSetEntries({ adminPw: needAdmin(), edition: viewId(), rows, reason: 'výsledky z Excelu' });
      await refresh(); return n;
    },
    async clearEntries() { await adapter.adminClear(needAdmin(), viewId()); outbox = outbox.filter((o) => o.edition !== viewId()); saveOutbox(); await refresh(); },

    // ---- nastavení ročníku ----
    async setLooks(looks) { await adapter.adminSetSetting(needAdmin(), `looks:${viewId()}`, looks); await refresh(); },
    async setFbEvent(url) { await adapter.adminSetSetting(needAdmin(), `fb:${viewId()}`, url); await refresh(); },
    setTeamPw: (team, pw) => adapter.adminSetTeamPw(needAdmin(), viewId(), team, pw),
    changeAdminPw: (oldPw, newPw) => adapter.adminChangePw(oldPw, newPw),

    // ---- simulace: jen v zařízení admina, nic se neukládá do databáze ----
    startSim(startMinutes) { sim = { on: true, running: true, now: startMinutes, rate: 6, entries: {}, history: [] }; saveSim(); },
    simSet(patch) { sim = { ...sim, ...patch }; saveSim(); },
    stopSim() { sim = { on: false }; saveSim(); }, // všechny simulované hodnoty se zahodí
    simTick() {
      if (!sim.on || !sim.running || !state.race) return;
      const teams = state.race.teams;
      const end = Math.max(...teams.map((t) => t.scenario?.[9] ?? 0)) + 10;
      const next = Math.min(end, sim.now + (sim.rate || 6));
      for (const t of teams) for (let i = 0; i < POINTS; i++) {
        const m = t.scenario?.[i];
        if (m != null && m <= next && sim.entries[t.id]?.[i] == null) simWriteEntry(t.id, i, m, 'simulace');
      }
      sim = { ...sim, now: next, running: next < end };
      saveSim();
    },
    simEnd: () => (state.race ? Math.max(...state.race.teams.map((t) => t.scenario?.[9] ?? 0)) + 10 : 0),

    // ---- ostatní ----
    setForceOffline(v) { forceOffline = v; localStorage.setItem(OFFLINE_KEY, v ? '1' : '0'); derive(); if (!v) flush(); },
    flush, refresh,
    switchMode(mode) { localStorage.setItem('prasous.mode', mode); location.reload(); },
  };
  return store;
}
