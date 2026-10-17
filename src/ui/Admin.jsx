/* Administrace: import ročníku, správa ročníků a verzí, opravy časů, týmy a hesla, simulace, export. */
import { useEffect, useState } from 'react';
import xlsxUrl from '../../data/2026/prasous-2026.xlsx?url';
import gpxUrl from '../../data/2026/trasa-2026.gpx?url';
import { useApp, usePrepared, hashGo, lookOf, PALETTE_COLORS } from './ctx.jsx';
import { recordRaceVideo } from './video.js';
import { parseWorkbook, exportWorkbook } from '../domain/excel.js';
import { parseGpx, locateHandovers } from '../domain/gpx.js';
import { validateEntry, fmtHHMM, parseHHMM, pointLabel, pointShort } from '../domain/time.js';
import { downloadBlob } from './share.js';

const toB64 = (buf) => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
const SECTIONS = ['Import', 'Ročníky', 'Časy', 'Týmy', 'Simulace', 'Ostatní'];
const czDate = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('cs-CZ') : '–');

/** Stáhne Excel ve formátu importu se zapsanými časy. Vrací false, když export není možný. */
async function exportExcel({ s, store, toast }) {
  const xlsxB64 = await store.getXlsx();
  if (!xlsxB64 || !s.race) { toast('Není uložený původní Excel, export není možný.'); return false; }
  try {
    const out = await exportWorkbook(fromB64(xlsxB64), s.race, s.entries);
    downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `prasous-${s.settings.year}-vysledky.xlsx`);
    return true;
  } catch (e) { toast(`Export selhal: ${e.message}`); return false; }
}

export default function Admin() {
  const { auth } = useApp();
  const [sec, setSec] = useState('Import');
  if (auth.role !== 'admin') return <div className="card"><div className="sm">Tato stránka je jen pro admina.</div><button className="btn" style={{ marginTop: 10 }} onClick={() => hashGo('/login')}>Přihlásit</button></div>;
  return (
    <>
      <div className="chips">{SECTIONS.map((x) => <button key={x} className={`chip ${x === sec ? 'on' : ''}`} onClick={() => setSec(x)}>{x}</button>)}</div>
      {sec === 'Import' && <ImportSection />}
      {sec === 'Ročníky' && <EditionsSection />}
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
  const [meta, setMeta] = useState({ label: '', date: '', replace: false });

  async function analyse(xlsxBuf, gpxText, defaults) {
    const parsed = xlsxBuf ? await parseWorkbook(xlsxBuf) : { legs: s.race?.legs, teams: s.race?.teams, report: { errors: [], warnings: [], info: [] } };
    const race = { legs: parsed.legs, teams: parsed.teams };
    const report = parsed.report;
    const text = gpxText ?? s.gpx;
    let gpxInfo = null;
    if (text && race.legs) {
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
    if (!xlsxBuf && !s.race) report.errors.push('Nejdřív nahraj Excel.');
    if (xlsxBuf) setMeta({ label: defaults?.label ?? meta.label ?? '', date: defaults?.date ?? meta.date ?? '', replace: false });
    else setMeta({ label: s.edition?.label ?? '', date: s.edition?.race_date ?? '', replace: true });
    setDraft({ race, report, gpxInfo, xlsxBuf, gpxText: text, scenario: race.teams?.every((t) => t.scenario) });
  }
  const onFiles = async (e) => {
    setBusy(true);
    try {
      let xb = null, gt = null;
      for (const f of e.target.files) {
        if (/\.xlsx$/i.test(f.name)) xb = await f.arrayBuffer();
        else if (/\.gpx$/i.test(f.name)) gt = await f.text();
      }
      if (!xb && !gt) toast('Vyber soubor .xlsx nebo .gpx.');
      else await analyse(xb, gt, { label: String(new Date().getFullYear() + (s.edition ? 1 : 0)), date: '' });
    } catch (err) { toast(`Soubor se nepodařilo přečíst: ${err.message}`); }
    setBusy(false); e.target.value = '';
  };
  const loadDemo = async () => {
    setBusy(true);
    try { await analyse(await (await fetch(xlsxUrl)).arrayBuffer(), await (await fetch(gpxUrl)).text(), { label: '2026', date: '2026-04-25' }); }
    catch (err) { toast(`Načtení testovacích dat selhalo: ${err.message}`); }
    setBusy(false);
  };
  const id = meta.label.trim();
  const exists = s.editions.some((e) => e.id === id);
  const gpxOnly = draft && !draft.xlsxBuf;
  const confirm = async () => {
    setBusy(true);
    try {
      const target = gpxOnly ? s.viewId : id;
      const b64 = draft.xlsxBuf ? toB64(draft.xlsxBuf) : await store.getXlsx();
      const r = await store.saveEdition({ id: target, label: gpxOnly ? s.edition.label : id, date: meta.date || null, race: draft.race, xlsxB64: b64, gpx: draft.gpxText, replace: gpxOnly || meta.replace });
      if (r === 'exists') toast('Ročník s tímto označením už existuje. Zaškrtni „Nahradit“ (stará verze zůstane uložená).');
      else { toast('Import uložen ✓'); setDraft(null); }
    } catch (err) { toast(`Uložení selhalo: ${err.message}`); }
    setBusy(false);
  };

  return (
    <>
      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <h3>Soubory závodu</h3>
        <div className="sm muted">Zobrazený ročník: {s.edition ? `${s.edition.label} (${s.race?.teams.length ?? 0} týmů${s.gpx ? ', GPX trasa' : ', bez GPX'})` : 'žádný'}.</div>
        <label className="btn dark" style={{ cursor: 'pointer' }}>Vybrat Excel a/nebo GPX<input type="file" accept=".xlsx,.gpx" multiple hidden onChange={onFiles} /></label>
        <button className="btn ghost" disabled={busy} onClick={loadDemo}>Načíst testovací závod 2026</button>
        <div className="xs muted">Nový Excel se uloží jako nový ročník. Starší ročníky a jejich výsledky zůstávají uložené. Pouze GPX nahraješ do zobrazeného ročníku (stará verze zůstane k obnovení).</div>
      </div>
      {draft && (
        <div className="card" style={{ display: 'grid', gap: 6 }}>
          <h3>Kontrola importu</h3>
          {draft.report.info.map((x) => <div key={x} className="okmsg">✓ {x}</div>)}
          {draft.gpxInfo && <div className="okmsg">✓ {draft.gpxInfo}</div>}
          {draft.scenario && <div className="okmsg">✓ V Excelu jsou skutečné časy všech týmů, jdou použít pro simulaci.</div>}
          {draft.report.warnings.map((x) => <div key={x} className="warnmsg">⚠ {x}</div>)}
          {draft.report.errors.map((x) => <div key={x} className="errmsg">✕ {x}</div>)}
          {!gpxOnly && <div className="row">
            <div className="field sp"><label>Ročník (označení)</label><input value={meta.label} onChange={(e) => setMeta({ ...meta, label: e.target.value })} placeholder="2027" /></div>
            <div className="field sp"><label>Datum závodu</label><input type="date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} /></div>
          </div>}
          {!gpxOnly && exists && <label className="xs warnmsg row"><input type="checkbox" checked={meta.replace} onChange={(e) => setMeta({ ...meta, replace: e.target.checked })} /> Ročník „{id}“ už existuje. Nahradit (stará verze zůstane uložená a půjde obnovit)</label>}
          {!gpxOnly && !meta.date && <div className="warnmsg xs">Bez data závodu aplikace nepozná, kdy je živě a kdy po závodě.</div>}
          <button className="btn" disabled={busy || draft.report.errors.length > 0 || (!gpxOnly && (!id || (exists && !meta.replace)))} onClick={confirm}>Potvrdit import</button>
          <button className="btn ghost" onClick={() => setDraft(null)}>Zrušit</button>
        </div>
      )}
    </>
  );
}

/* ---------- Ročníky ---------- */
function EditionsSection() {
  const { s, store, toast } = useApp();
  const [versions, setVersions] = useState([]);
  useEffect(() => { if (s.viewId) store.versions(s.viewId).then(setVersions).catch(() => setVersions([])); }, [s.viewId, s.edition?.updated_at]); // eslint-disable-line
  const act = async (fn, ok) => { try { await fn(); toast(ok); } catch (e) { toast(e.message); } };
  return (
    <>
      <div className="xs muted">Aktivní ročník vidí diváci a kapitáni. Starší ročníky zůstávají uložené, jejich výsledky jdou prohlížet v archivu.</div>
      <div className="card" style={{ padding: '4px 12px' }}>
        <div className="list">
          {[...s.editions].reverse().map((e) => (
            <div key={e.id} className="li" style={{ cursor: 'default', flexWrap: 'wrap' }}>
              <div className="sp"><div className="nm">PraSouš {e.label}</div><div className="xs muted">{czDate(e.race_date)}{e.id === s.activeId ? ' · aktivní' : ''}{e.id === s.viewId ? ' · zobrazený' : ''}</div></div>
              {e.id !== s.viewId && <button className="btn sm ghost" onClick={() => store.viewEdition(e.id)}>Zobrazit</button>}
              {e.id !== s.activeId && <button className="btn sm" onClick={() => { if (window.confirm(`Aktivovat ročník ${e.label}? Diváci a kapitáni uvidí tento ročník.`)) act(() => store.setActive(e.id), 'Ročník aktivován ✓'); }}>Aktivovat</button>}
            </div>
          ))}
          {!s.editions.length && <div className="xs muted" style={{ padding: 8 }}>Zatím žádný ročník. Nahraj Excel v sekci Import.</div>}
        </div>
      </div>
      {s.edition && (
        <>
          <div className="sec">Předchozí verze ročníku {s.edition.label}</div>
          <div className="card" style={{ padding: '4px 12px' }}>
            <div className="list">
              {versions.map((v) => (
                <div key={v.id} className="li" style={{ cursor: 'default' }}>
                  <div className="sp xs">{new Date(v.saved_at).toLocaleString('cs-CZ')}</div>
                  <button className="btn sm ghost" onClick={() => { if (window.confirm('Obnovit tuto verzi? Současná verze se uloží mezi předchozí.')) act(() => store.restoreVersion(v.id), 'Verze obnovena ✓'); }}>Obnovit</button>
                </div>
              ))}
              {!versions.length && <div className="xs muted" style={{ padding: 8 }}>Žádné předchozí verze (vzniknou při nahrazení ročníku).</div>}
            </div>
          </div>
        </>
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
    try { await store.adminSetEntry({ team: sel.team, point: sel.point, minutes, reason }); toast('Oprava uložena ✓'); setSel(null); }
    catch (e) { toast(`Nepodařilo se uložit: ${e.message}`); }
  };
  const tname = (id) => race.teams.find((t) => t.id === id)?.name ?? id;
  return (
    <>
      <div className="card scroll-x" style={{ padding: 6 }}>
        <table className="tbl"><thead><tr><th>Tým</th>{Array.from({ length: 10 }, (_, i) => <th key={i}>{pointShort(i)}</th>)}</tr></thead>
          <tbody>{race.teams.map((t) => (
            <tr key={t.id}><td><b>{t.name}</b></td>{s.entries[t.id].map((m, i) => (
              <td key={i} className="cell" style={sel?.team === t.id && sel.point === i ? { background: 'var(--gold-soft)' } : undefined} onClick={() => pick(t.id, i)}>{m != null ? fmtHHMM(m) : '·'}</td>))}</tr>))}
          </tbody></table>
        <div className="xs muted" style={{ padding: 6 }}>Klepni na buňku pro opravu nebo doplnění. Každá změna se zapisuje do historie.</div>
      </div>
      {sel && (
        <div className="card" style={{ display: 'grid', gap: 8 }}>
          <h3>Oprava · {tname(sel.team)} · {pointLabel(sel.point).toLowerCase()}</h3>
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
              <div className="sp xs"><b>{tname(h.team)} · {pointShort(h.point).toLowerCase()}</b>: {fmtHHMM(h.old)} → {fmtHHMM(h.new)}
                <div className="muted">{new Date(h.at).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })} · {h.by}{h.reason ? ` · ${h.reason}` : ''}</div></div>
              {s.entries[h.team]?.[h.point] === h.new && <button className="btn sm ghost" onClick={async () => { try { await store.adminSetEntry({ team: h.team, point: h.point, minutes: h.old, reason: 'vráceno z historie' }); toast('Změna vrácena ✓'); } catch (e) { toast(e.message); } }}>vrátit</button>}
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
  const setLook = async (t, patch) => {
    try { await store.setLooks({ ...(s.settings.looks || {}), [t.id]: { ...(s.settings.looks?.[t.id] || {}), ...patch } }); }
    catch (e) { toast(e.message); }
  };
  const savePw = async (t, pw) => { try { await store.setTeamPw(t.id, pw); toast(pw ? 'Heslo uloženo ✓' : 'Vráceno výchozí heslo (název týmu) ✓'); } catch (e) { toast(e.message); } };
  return (
    <>
      <div className="xs muted">Výchozí heslo kapitána je název týmu. Uložená hesla nejsou vidět (jsou jen v podobě otisku), můžeš nastavit nové nebo vrátit výchozí.</div>
      {s.race.teams.map((t, i) => {
        const look = lookOf(s.settings, t, i);
        return (
          <div className="card" key={t.id} style={{ display: 'grid', gap: 8 }}>
            <div className="row"><span className="badge" style={{ background: look.color + '26' }}>{look.emoji}</span><b>{t.name}</b></div>
            <div className="row">
              <div className="field sp"><label>Nové heslo kapitána</label><input id={`pw-${t.id}`} type="text" autoComplete="off" placeholder="nové heslo" /></div>
              <div className="field" style={{ width: 70 }}><label>Emoji</label><input defaultValue={look.emoji} onBlur={(e) => e.target.value && e.target.value !== look.emoji && setLook(t, { emoji: e.target.value })} /></div>
            </div>
            <div className="row">
              <button className="btn sm dark" onClick={() => { const el = document.getElementById(`pw-${t.id}`); if (el.value) { savePw(t, el.value); el.value = ''; } }}>Uložit heslo</button>
              <button className="btn sm ghost" onClick={() => savePw(t, '')}>Výchozí heslo</button>
            </div>
            <div className="chips">{PALETTE_COLORS.map((c) => <button key={c} className="chip" style={{ background: c, borderColor: look.color === c ? '#000' : c, width: 28, height: 28, padding: 0 }} onClick={() => setLook(t, { color: c })} aria-label={`Barva ${c}`} />)}</div>
          </div>
        );
      })}
    </>
  );
}

/* ---------- Simulace (jen v tomto zařízení) ---------- */
function SimSection() {
  const { s, store, toast } = useApp();
  const race = s.race;
  const sim = s.settings.sim;
  const [start, setStart] = useState('');
  if (!race) return <div className="card">Nejdřív nahraj data závodu.</div>;
  const hasScn = race.teams.every((t) => t.scenario);
  const defStart = fmtHHMM(Math.min(...race.teams.map((t) => t.planStart)) - 5);
  const begin = () => {
    const m = parseHHMM(start || defStart);
    if (m == null) return toast('Zadej čas ve tvaru HH:MM.');
    store.startSim(m);
  };
  return (
    <div className="card" style={{ display: 'grid', gap: 8 }}>
      <h3>Simulace závodu na datech z Excelu</h3>
      {!hasScn && <div className="warnmsg">V Excelu nejsou skutečné časy všech týmů, simulace není k dispozici.</div>}
      <div className="sm muted">Jen pro zkoušení: běží pouze v tomto zařízení a <b>nic se neukládá do databáze</b>. Ostatní uživatelé simulaci nevidí. Zápis kapitána a opravy admina během simulace jdou také jen do simulace. Ukončením se všechny simulované časy zahodí.</div>
      {!sim.on ? (
        <>
          <div className="field"><label>Začít v čase</label><input value={start} placeholder={defStart} onChange={(e) => setStart(e.target.value)} /></div>
          <button className="btn" disabled={!hasScn} onClick={begin}>▶ Spustit simulaci</button>
        </>
      ) : (
        <>
          <div className="row"><span className="clock">{fmtHHMM(sim.now)}</span><span className="sp" /><span className="pill pend">{sim.running ? 'běží' : 'pozastaveno'}</span></div>
          <div className="chips">{[[1, '1 min/s'], [6, '1 h = 10 s'], [30, '5× rychleji']].map(([r, l]) => <button key={r} className={`chip ${sim.rate === r ? 'on' : ''}`} onClick={() => store.simSet({ rate: r })}>{l}</button>)}</div>
          <div className="row">
            <button className="btn dark sm" style={{ flex: 1 }} onClick={() => store.simSet({ running: !sim.running })}>{sim.running ? '❚❚ Pauza' : '▶ Pokračovat'}</button>
            <button className="btn ghost sm" style={{ flex: 1 }} onClick={() => store.simSet({ now: Math.min(store.simEnd(), sim.now + 60), running: true })}>+1 h</button>
          </div>
          <button className="btn ghost" onClick={() => { if (window.confirm('Ukončit simulaci a zahodit všechny simulované časy?')) store.stopSim(); }}>Ukončit simulaci a zahodit časy</button>
        </>
      )}
    </div>
  );
}

/* ---------- Ostatní ---------- */
function OtherSection() {
  const ctx = useApp();
  const { s, store, toast } = ctx;
  const race = s.race;
  const all = race && race.teams.every((t) => s.entries[t.id]?.[9] != null);
  const prep = usePrepared(s);
  const [vid, setVid] = useState({ busy: false, p: 0 });
  const makeVideo = async () => {
    setVid({ busy: true, p: 0 });
    try {
      const { blob, ext } = await recordRaceVideo({ race, entries: s.entries, prep, settings: s.settings }, (p) => setVid({ busy: true, p }));
      downloadBlob(blob, `prasous-${s.settings.year}-video.${ext}`); toast('Video je stažené ✓');
    } catch (e) { toast(e.message); }
    setVid({ busy: false, p: 0 });
  };
  const [pw, setPw] = useState({ old: '', next: '' });
  const wipe = async () => {
    if (!race) return;
    if (window.prompt('Smazat všechny zápisy ročníku? Nejdřív se stáhne záloha Excelu. Pro potvrzení napiš SMAZAT:') !== 'SMAZAT') return;
    if (!(await exportExcel(ctx))) return toast('Záloha se nepodařila, nic jsem nesmazal.');
    try { await store.clearEntries(); toast('Zápisy smazány (zůstaly v historii změn).'); } catch (e) { toast(e.message); }
  };
  return (
    <>
      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <h3>Po závodě</h3>
        <button className="btn dark" disabled={!race} onClick={() => exportExcel(ctx)}>⬇ Export Excelu (stejný formát jako import)</button>
        <button className="btn" disabled={!all} onClick={() => hashGo('/finale')}>🎬 Vygenerovat video závodu</button>
        <button className="btn dark" disabled={!all || vid.busy} onClick={makeVideo}>{vid.busy ? `⏺ Nahrávám… ${Math.round(vid.p * 100)} %` : '🎥 Stáhnout video jako soubor'}</button>
        {vid.busy && <div className="xs muted">Video (30–60 s) se nahrává v reálném čase. Nech tuto stránku otevřenou.</div>}
        <div className="xs muted">{all ? 'Všechny týmy jsou v cíli: otevře se přehrání celého závodu a stažení výsledkových karet týmů.' : 'Tlačítko se odemkne, až všechny týmy zapíšou cíl.'}</div>
      </div>
      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <h3>Heslo admina</h3>
        <div className="field"><label>Současné heslo</label><input type="password" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} /></div>
        <div className="field"><label>Nové heslo (aspoň 8 znaků)</label><input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></div>
        <button className="btn dark" disabled={!pw.old || pw.next.length < 8} onClick={async () => { try { await store.changeAdminPw(pw.old, pw.next); toast('Heslo změněno. Přihlas se znovu.'); ctx.setAuth({ role: 'viewer' }); hashGo('/login'); } catch (e) { toast(e.message); } }}>Změnit heslo</button>
      </div>
      <div className="card" style={{ display: 'grid', gap: 6 }}>
        <h3>Datové úložiště</h3>
        <div className="sm">Režim: <b>{s.mode === 'supabase' ? 'Supabase (sdílené mezi zařízeními)' : 'lokální (jen toto zařízení)'}</b></div>
        {s.mode === 'supabase' ? <button className="btn ghost" onClick={() => store.switchMode('local')}>Přepnout na lokální režim (zkoušení)</button>
          : <button className="btn ghost" onClick={() => { localStorage.removeItem('prasous.mode'); location.search ? (location.href = location.pathname) : location.reload(); }}>Zkusit znovu Supabase</button>}
        {s.banner && <div className="warnmsg">{s.banner}</div>}
      </div>
      <div className="card" style={{ display: 'grid', gap: 6 }}>
        <h3>Smazat zápisy ročníku</h3>
        <div className="sm muted">Vrátí ročník do stavu před závodem. Záloha Excelu se stáhne automaticky a smazané časy zůstanou v historii změn.</div>
        <button className="btn ghost" disabled={!race} onClick={wipe}>Smazat zápisy…</button>
      </div>
    </>
  );
}
