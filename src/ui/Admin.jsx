import { useMemo, useState } from 'react';
import xlsxUrl from '../../data/2026/prasous-2026.xlsx?url';
import gpxUrl from '../../data/2026/trasa-2026.gpx?url';
import { useApp, hashGo, lookOf, PALETTE_COLORS } from './ctx.jsx';
import { parseWorkbook, exportWorkbook } from '../domain/excel.js';
import { parseGpx, locateHandovers } from '../domain/gpx.js';
import { validateEntry, fmtHHMM, parseHHMM, fmtDur } from '../domain/time.js';
import { downloadBlob } from './share.js';

const toB64 = (buf) => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
const SECTIONS = ['Import', 'Časy', 'Týmy', 'Simulace', 'Ostatní'];

export default function Admin() {
  const { auth } = useApp();
  const [sec, setSec] = useState('Import');
  if (auth.role !== 'admin') return <div className="card"><div className="sm">Tato stránka je jen pro admina.</div><button className="btn" style={{ marginTop: 10 }} onClick={() => hashGo('/login')}>Přihlásit</button></div>;
  return (
    <>
      <div className="chips">{SECTIONS.map((x) => <button key={x} className={`chip ${x === sec ? 'on' : ''}`} onClick={() => setSec(x)}>{x}</button>)}</div>
      {sec === 'Import' && <ImportSection />}
      {sec === 'Časy' && <TimesSection />}
      {sec === 'Týmy' && <TeamsSection />}
      {sec === 'Simulace' && <SimSection />}
      {sec === 'Ostatní' && <OtherSection />}
    </>
  );
}

/* ---------- Import ---------- */
function ImportSection() {
  const { s, store, toast } = useApp();
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);

  async function analyse(xlsxBuf, gpxText) {
    const parsed = xlsxBuf ? await parseWorkbook(xlsxBuf) : { race: s.race, report: { errors: [], warnings: [], info: [] } };
    const race = xlsxBuf ? { legs: parsed.legs, teams: parsed.teams } : s.race;
    const report = parsed.report;
    const text = gpxText ?? s.gpx;
    let gpxInfo = null;
    if (text && race) {
      try {
        const track = parseGpx(text);
        const pts = [race.legs[0].gpsStart, ...race.legs.map((l) => l.gpsEnd)];
        if (pts.every(Boolean)) {
          const { idx, distM } = locateHandovers(track, pts);
          const far = distM.filter((d) => d > 25).length;
          gpxInfo = `GPX ${track[track.length - 1].km.toFixed(1)} km · ${far ? `${far} bodů dál než 25 m od trasy` : `všech ${pts.length} bodů leží na trase (do ${Math.max(...distM).toFixed(0)} m)`}`;
          if (far) report.warnings.push('Některé souřadnice předávek neleží na GPX trase.');
          race.legs.forEach((l, i) => {
            const g = track[idx[i + 1]].km - track[idx[i]].km;
            if (Math.abs(g - l.km) > 0.3) report.warnings.push(`Úsek ${l.n}: GPX ${g.toFixed(1).replace('.', ',')} km × Excel ${l.km.toFixed(1).replace('.', ',')} km (platí Excel).`);
          });
        } else report.warnings.push('Chybí GPS souřadnice některých předávek, mapa nepůjde ověřit.');
      } catch (e) { report.errors.push(`GPX: ${e.message}`); }
    } else if (!text) report.warnings.push('Není nahraná GPX trasa, mapa nebude fungovat.');
    setDraft({ race, report, gpxInfo, xlsxBuf, gpxText: text, scenario: race?.teams.every((t) => t.scenario) });
  }

  const onFiles = async (e) => {
    setBusy(true);
    try {
      let xb = null, gt = null;
      for (const f of e.target.files) {
        if (/\.xlsx$/i.test(f.name)) xb = await f.arrayBuffer();
        else if (/\.gpx$/i.test(f.name)) gt = await f.text();
      }
      if (!xb && !gt) toast('Vyber soubor .xlsx nebo .gpx.'); else await analyse(xb, gt);
    } catch (err) { toast(`Soubor se nepodařilo přečíst: ${err.message}`); }
    setBusy(false); e.target.value = '';
  };
  const loadDemo = async () => {
    setBusy(true);
    try { await analyse(await (await fetch(xlsxUrl)).arrayBuffer(), await (await fetch(gpxUrl)).text()); }
    catch (err) { toast(`Načtení testovacích dat selhalo: ${err.message}`); }
    setBusy(false);
  };
  const confirm = async () => {
    setBusy(true);
    try {
      const hasEntries = Object.values(s.entries).some((a) => a.some((x) => x != null));
      if (draft.xlsxBuf && hasEntries && !window.confirm('Import nahradí data závodu. Zapsané časy zůstanou, pokud se shodují názvy týmů. Pokračovat?')) { setBusy(false); return; }
      const b64 = draft.xlsxBuf ? toB64(draft.xlsxBuf) : store.getFiles().xlsxB64;
      await store.saveRace(draft.race, b64, draft.gpxText);
      toast('Import uložen ✓'); setDraft(null);
    } catch (err) { toast(`Uložení selhalo: ${err.message}`); }
    setBusy(false);
  };

  return (
    <>
      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <h3>Soubory závodu</h3>
        <div className="sm muted">{s.race ? `Nahráno: ${s.race.teams.length} týmů, ${s.race.legs.length} úseků${s.gpx ? ', GPX trasa' : ', bez GPX'}.` : 'Zatím nic nenahráno.'}</div>
        <label className="btn dark" style={{ cursor: 'pointer' }}>Vybrat Excel a/nebo GPX<input type="file" accept=".xlsx,.gpx" multiple hidden onChange={onFiles} /></label>
        <button className="btn ghost" disabled={busy} onClick={loadDemo}>Načíst testovací závod 2026</button>
        <div className="xs muted">Excel má formát jako v roce 2026 (první list s úseky, list na tým, formát listu 8aD). Můžeš nahrát oba soubory najednou.</div>
      </div>
      {draft && (
        <div className="card" style={{ display: 'grid', gap: 6 }}>
          <h3>Kontrola importu</h3>
          {draft.report.info.map((x) => <div key={x} className="okmsg">✓ {x}</div>)}
          {draft.gpxInfo && <div className="okmsg">✓ {draft.gpxInfo}</div>}
          {draft.scenario && <div className="okmsg">✓ V Excelu jsou skutečné časy všech týmů, jdou použít pro simulaci.</div>}
          {draft.report.warnings.map((x) => <div key={x} className="warnmsg">⚠ {x}</div>)}
          {draft.report.errors.map((x) => <div key={x} className="errmsg">✕ {x}</div>)}
          <button className="btn" disabled={busy || draft.report.errors.length > 0} onClick={confirm}>Potvrdit import</button>
          <button className="btn ghost" onClick={() => setDraft(null)}>Zrušit</button>
        </div>
      )}
    </>
  );
}

/* ---------- Opravy časů ---------- */
function TimesSection() {
  const { s, store, now, toast } = useApp();
  const race = s.race;
  const [sel, setSel] = useState(null); // {team, point}
  const [txt, setTxt] = useState('');
  const [reason, setReason] = useState('');
  if (!race) return <div className="card">Nejdřív nahraj data závodu.</div>;
  const ent = sel ? s.entries[sel.team] : null;
  const val = sel ? validateEntry(txt, { prev: sel.point > 0 ? ent[sel.point - 1] : null, next: ent[sel.point + 1] ?? null, now, isAdmin: true }) : null;
  const pick = (team, point) => { setSel({ team, point }); setTxt(fmtHHMM(s.entries[team][point] ?? null).replace('–', '')); setReason(''); };
  const save = async (minutes) => {
    try { await store.adminSet({ team: sel.team, point: sel.point, minutes, reason }); toast('Oprava uložena ✓'); setSel(null); }
    catch (e) { toast(`Nepodařilo se uložit: ${e.message}`); }
  };
  const tname = (id) => race.teams.find((t) => t.id === id)?.name ?? id;
  return (
    <>
      <div className="card scroll-x" style={{ padding: 6 }}>
        <table className="tbl"><thead><tr><th>Tým</th>{Array.from({ length: 10 }, (_, i) => <th key={i}>{i === 0 ? 'Start' : i === 9 ? 'Cíl' : `P${i}`}</th>)}</tr></thead>
          <tbody>{race.teams.map((t) => (
            <tr key={t.id}><td><b>{t.name}</b></td>{s.entries[t.id].map((m, i) => (
              <td key={i} className="cell" style={sel?.team === t.id && sel.point === i ? { background: 'var(--gold-soft)' } : undefined} onClick={() => pick(t.id, i)}>{m != null ? fmtHHMM(m) : '·'}</td>))}</tr>))}
          </tbody></table>
        <div className="xs muted" style={{ padding: 6 }}>Klepni na buňku pro opravu nebo doplnění. Každá změna se zapisuje do historie.</div>
      </div>
      {sel && (
        <div className="card" style={{ display: 'grid', gap: 8 }}>
          <h3>Oprava · {tname(sel.team)} · {sel.point === 0 ? 'start' : sel.point === 9 ? 'cíl' : `předávka ${sel.point}`}</h3>
          <div className={`field ${txt && !val.ok ? 'err' : ''}`}><label>Nový čas (HH:MM)</label><input value={txt} onChange={(e) => setTxt(e.target.value)} inputMode="numeric" placeholder="14:50" /></div>
          <div className="field"><label>Důvod</label><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="např. ověřeno u kapitána" /></div>
          {txt && val.errors.map((e) => <div key={e} className="errmsg">⚠ {e}</div>)}
          {txt && val.warnings.map((e) => <div key={e} className="warnmsg">⚠ {e}</div>)}
          <button className="btn" disabled={!val.ok} onClick={() => save(val.minutes)}>Uložit opravu</button>
          {ent[sel.point] != null && <button className="btn ghost" onClick={() => { if (window.confirm('Smazat tento zápis?')) save(null); }}>Smazat zápis</button>}
          <button className="btn ghost" onClick={() => setSel(null)}>Zavřít</button>
        </div>
      )}
      <div className="sec">Historie změn</div>
      <div className="card" style={{ padding: '4px 12px' }}>
        <div className="list">
          {[...s.history].reverse().slice(0, 40).map((h) => (
            <div key={h.id} className="li" style={{ cursor: 'default', flexWrap: 'wrap' }}>
              <div className="sp xs"><b>{tname(h.team)} · {h.point === 0 ? 'start' : h.point === 9 ? 'cíl' : `P${h.point}`}</b>: {fmtHHMM(h.old)} → {fmtHHMM(h.new)}
                <div className="muted">{new Date(h.at).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })} · {h.by}{h.reason ? ` · ${h.reason}` : ''}</div></div>
              {s.entries[h.team]?.[h.point] === h.new && <button className="btn sm ghost" onClick={async () => { try { await store.adminSet({ team: h.team, point: h.point, minutes: h.old, reason: 'vráceno z historie' }); toast('Změna vrácena ✓'); } catch (e) { toast(e.message); } }}>vrátit</button>}
            </div>
          ))}
          {!s.history.length && <div className="xs muted" style={{ padding: 8 }}>Zatím žádné změny.</div>}
        </div>
      </div>
    </>
  );
}

/* ---------- Týmy ---------- */
function TeamsSection() {
  const { s, store, toast } = useApp();
  if (!s.race) return <div className="card">Nejdřív nahraj data závodu.</div>;
  const setLook = (t, patch) => store.setSetting('looks', { ...(s.settings.looks || {}), [t.id]: { ...(s.settings.looks?.[t.id] || {}), ...patch } });
  return (
    <>
      <div className="xs muted">Výchozí heslo kapitána je název týmu. Prázdné pole = výchozí heslo.</div>
      {s.race.teams.map((t, i) => {
        const look = lookOf(s.settings, t, i);
        return (
          <div className="card" key={t.id} style={{ display: 'grid', gap: 8 }}>
            <div className="row"><span className="badge" style={{ background: look.color + '26' }}>{look.emoji}</span><b>{t.name}</b></div>
            <div className="row">
              <div className="field sp"><label>Heslo kapitána</label><input defaultValue={s.passwords?.[t.id] ?? ''} placeholder={t.name} onBlur={async (e) => { if ((e.target.value || '') !== (s.passwords?.[t.id] ?? '')) { await store.setPassword(t.id, e.target.value); toast('Heslo uloženo ✓'); } }} /></div>
              <div className="field" style={{ width: 70 }}><label>Emoji</label><input defaultValue={look.emoji} onBlur={(e) => e.target.value && setLook(t, { emoji: e.target.value })} /></div>
            </div>
            <div className="chips">{PALETTE_COLORS.map((c) => <button key={c} className="chip" style={{ background: c, borderColor: look.color === c ? '#000' : c, width: 28, height: 28, padding: 0 }} onClick={() => setLook(t, { color: c })} aria-label={`Barva ${c}`} />)}</div>
          </div>
        );
      })}
    </>
  );
}

/* ---------- Simulace ---------- */
function SimSection() {
  const { s, store, toast } = useApp();
  const race = s.race;
  const sim = s.settings.sim || { on: false };
  const [start, setStart] = useState('');
  if (!race) return <div className="card">Nejdřív nahraj data závodu.</div>;
  const hasScn = race.teams.every((t) => t.scenario);
  const simEnd = Math.max(...race.teams.map((t) => t.scenario?.[9] ?? 0)) + 10;
  const defStart = fmtHHMM(Math.min(...race.teams.map((t) => t.planStart)) - 5);
  const begin = async () => {
    const m = parseHHMM(start || defStart);
    if (m == null) return toast('Zadej čas ve tvaru HH:MM.');
    if (!window.confirm('Simulace smaže všechny zapsané časy a bude je vkládat podle Excelu. Spustit?')) return;
    await store.clearEntries();
    await store.setSetting('sim', { on: true, running: true, now: m, rate: 6 });
  };
  const set = (patch) => store.setSetting('sim', { ...sim, ...patch });
  return (
    <>
      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <h3>Simulace závodu na datech z Excelu</h3>
        {!hasScn && <div className="warnmsg">V Excelu nejsou skutečné časy všech týmů, simulace není k dispozici.</div>}
        <div className="sm muted">Skutečné časy z Excelu se „zapisují“ zrychleně jako od kapitánů. Simulace běží, dokud máš otevřenou tuto aplikaci jako admin.</div>
        {!sim.on ? (
          <>
            <div className="field"><label>Začít v čase</label><input value={start} placeholder={defStart} onChange={(e) => setStart(e.target.value)} /></div>
            <button className="btn" disabled={!hasScn} onClick={begin}>▶ Spustit simulaci</button>
          </>
        ) : (
          <>
            <div className="row"><span className="clock">{fmtHHMM(sim.now)}</span><span className="sp" /><span className="pill pend">{sim.running ? 'běží' : 'pozastaveno'}</span></div>
            <div className="chips">{[[1, '1 min/s'], [6, '1 h = 10 s'], [30, '5× rychleji']].map(([r, l]) => <button key={r} className={`chip ${sim.rate === r ? 'on' : ''}`} onClick={() => set({ rate: r })}>{l}</button>)}</div>
            <div className="row">
              <button className="btn dark sm" style={{ flex: 1 }} onClick={() => set({ running: !sim.running })}>{sim.running ? '❚❚ Pauza' : '▶ Pokračovat'}</button>
              <button className="btn ghost sm" style={{ flex: 1 }} onClick={() => set({ now: Math.min(simEnd, sim.now + 60) })}>+1 h</button>
            </div>
            <button className="btn ghost" onClick={() => set({ on: false, running: false })}>Ukončit simulaci (zápisy zůstanou)</button>
          </>
        )}
      </div>
      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <h3>Smazat všechny zápisy</h3>
        <div className="sm muted">Vrátí aplikaci do stavu před závodem. Nelze vrátit zpět.</div>
        <button className="btn ghost" onClick={async () => { if (window.confirm('Opravdu smazat všechny zapsané časy a historii?')) { await store.clearEntries(); await store.setSetting('sim', { on: false }); toast('Zápisy smazány.'); } }}>Smazat zápisy</button>
      </div>
    </>
  );
}

/* ---------- Ostatní ---------- */
function OtherSection() {
  const { s, store, toast } = useApp();
  const race = s.race;
  const all = race && race.teams.every((t) => s.entries[t.id]?.[9] != null);
  const doExport = async () => {
    const { xlsxB64 } = store.getFiles();
    if (!xlsxB64) return toast('Není uložený původní Excel, export není možný.');
    try {
      const out = await exportWorkbook(fromB64(xlsxB64), race, s.entries);
      downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `prasous-${s.settings.year}-vysledky.xlsx`);
    } catch (e) { toast(`Export selhal: ${e.message}`); }
  };
  return (
    <>
      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <h3>Ročník</h3>
        <div className="row">
          <div className="field sp"><label>Rok</label><input defaultValue={s.settings.year} inputMode="numeric" onBlur={(e) => +e.target.value && store.setSetting('year', +e.target.value)} /></div>
          <div className="field sp"><label>Datum</label><input type="date" defaultValue={s.settings.date} onBlur={(e) => e.target.value && store.setSetting('date', e.target.value)} /></div>
        </div>
      </div>
      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <h3>Po závodě</h3>
        <button className="btn dark" disabled={!race} onClick={doExport}>⬇ Export Excelu (stejný formát jako import)</button>
        <button className="btn" disabled={!all} onClick={() => hashGo('/finale')}>🎬 Vygenerovat video závodu</button>
        <div className="xs muted">{all ? 'Všechny týmy jsou v cíli: otevře se přehrání celého závodu a stažení výsledkových karet týmů.' : 'Tlačítko se odemkne, až všechny týmy zapíšou cíl.'}</div>
      </div>
      <div className="card" style={{ display: 'grid', gap: 6 }}>
        <h3>Datové úložiště</h3>
        <div className="sm">Režim: <b>{s.mode === 'supabase' ? 'Supabase (sdílené mezi zařízeními)' : 'lokální (jen toto zařízení)'}</b></div>
        {s.mode === 'supabase' ? <button className="btn ghost" onClick={() => store.switchMode('local')}>Přepnout na lokální režim (zkoušení)</button>
          : <button className="btn ghost" onClick={() => { localStorage.removeItem('prasous.mode'); location.search ? (location.href = location.pathname) : location.reload(); }}>Zkusit znovu Supabase</button>}
        {s.banner && <div className="warnmsg">{s.banner}</div>}
      </div>
    </>
  );
}
