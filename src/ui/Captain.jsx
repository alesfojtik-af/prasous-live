import { useMemo, useState } from 'react';
import { useApp, hashGo } from './ctx.jsx';
import { lastIndex, teamState } from '../domain/calc.js';
import { fmtHHMM, fmtDur, nowMinutes, validateEntry, parseHHMM } from '../domain/time.js';

const normTxt = (x) => (/^\d{3,4}$/.test(x) ? `${x.slice(0, -2)}:${x.slice(-2)}` : x);

export default function Captain() {
  const { s, auth } = useApp();
  const t = s.race?.teams.find((x) => x.id === auth.team);
  if (auth.role !== 'captain' || !t) return <div className="card"><div className="sm">Tato stránka je pro kapitány.</div><button className="btn" style={{ marginTop: 10 }} onClick={() => hashGo('/login')}>Přihlásit</button></div>;
  return <CaptainInner t={t} />;
}

function CaptainInner({ t }) {
  const { s, store, now, toast } = useApp();
  const [txt, setTxt] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const ent = s.entries[t.id], np = lastIndex(ent) + 1;
  const st = teamState(t, ent, now);
  const done = np >= 10;
  const pairNow = np === 0 ? t.legs[0] : t.legs[Math.min(np, 9) - 1];
  const pairNext = np === 0 ? null : t.legs[np] ?? null;
  const planClock = np === 0 ? t.planStart : (ent[0] ?? t.planStart) + t.legs.slice(0, np).reduce((a, l) => a + Math.round(l.planMin), 0);
  const predicted = np === 0 ? t.planStart : st.predicted[np];
  const val = useMemo(() => validateEntry(normTxt(txt), { prev: np > 0 ? ent[np - 1] : null, predicted, now, isAdmin: false }), [txt, np, ent, predicted, now]);
  const mine = s.outbox.filter((o) => o.team === t.id);
  const pending = mine.filter((o) => o.status === 'pending').length;

  const press = (k) => setTxt((cur) => {
    setConfirm(false);
    if (k === '⌫') return cur.slice(0, -1);
    if (k === ':' && (cur.includes(':') || !cur)) return cur;
    return cur.length >= 5 ? cur : cur + k;
  });
  const save = async () => {
    if (!val.ok) return;
    if (val.warnings.length && !confirm) { setConfirm(true); return; }
    setBusy(true);
    await store.submitEntry({ team: t.id, point: np, minutes: val.minutes, by: `kapitán ${t.name}` });
    setTxt(''); setConfirm(false); setBusy(false);
    toast(s.online ? 'Předávka zapsána ✓' : 'Uloženo v telefonu, odešle se po obnovení signálu.');
  };
  const label = np === 0 ? 'Start týmu' : np === 9 ? 'Cíl · konec úseku 9' : `Předávka ${np} · konec úseku ${np}`;

  return (
    <>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <h2>{t.name}</h2><span className="sp" />
        {!s.online && <span className="pill conf">📶 bez signálu</span>}
        {pending > 0 && <span className="pill pend">⏳ čeká: {pending}</span>}
      </div>
      {done ? <div className="card gold"><h3>Všechny body zapsány 🎉</h3><div className="sm">Čistý čas: {fmtDur(ent[9] - ent[0])}. Případné opravy provede admin.</div></div> : (
        <>
          <div className="card" style={{ display: 'grid', gap: 4 }}>
            <span className="sec" style={{ margin: 0 }}>Další bod</span>
            <b style={{ fontFamily: 'var(--f-display)', fontSize: 16 }}>{label}</b>
            {np === 0
              ? <div className="xs muted">Startuje: {pairNow.pair} · plánovaný start <span className="t">{fmtHHMM(t.planStart)}</span></div>
              : <div className="xs muted">Dobíhá: {pairNow.pair}{pairNext ? ` · Přebírá: ${pairNext.pair}` : ' · cíl'}</div>}
            {np > 0 && <div className="xs muted">Plán <span className="t">{fmtHHMM(planClock)}</span> · predikce <span className="t">{fmtHHMM(predicted)}</span></div>}
          </div>
          <div className={`field ${val.errors.length && txt ? 'err' : ''}`}>
            <label>Čas {np === 0 ? 'startu' : 'předávky'} (HH:MM)</label>
            <div className="timebox">{txt ? normTxt(txt) : <span className="muted">––:––</span>}</div>
          </div>
          {txt && val.errors.map((e) => <div key={e} className="errmsg">⚠ {e}</div>)}
          {txt && val.warnings.map((e) => <div key={e} className="warnmsg">⚠ {e}{confirm ? ' Klepni znovu pro potvrzení.' : ''}</div>)}
          {txt && val.ok && !val.warnings.length && <div className="okmsg">✓ Čas vypadá správně</div>}
          <div className="row">
            {val.suggestion != null && <button className="btn ghost sm" style={{ flex: 1 }} onClick={() => { setTxt(fmtHHMM(val.suggestion)); setConfirm(false); }}>Použít {fmtHHMM(val.suggestion)}</button>}
            <button className="btn ghost sm" style={{ flex: 1 }} onClick={() => { setTxt(fmtHHMM(now)); setConfirm(false); }}>Teď ({fmtHHMM(now)})</button>
          </div>
          <div className="keypad">{['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', ':'].map((k) => <button key={k} onClick={() => press(k)} aria-label={k}>{k}</button>)}</div>
          <button className="btn" disabled={!val.ok || busy} onClick={save}>{confirm ? 'Opravdu uložit' : np === 0 ? 'Uložit start' : 'Uložit předávku'}</button>
        </>
      )}
      <div className="sec">Moje zápisy</div>
      <div className="card" style={{ padding: '4px 12px' }}>
        <div className="list">
          {[...mine].reverse().map((o) => (
            <div className="li" key={o.id} style={{ cursor: 'default', flexWrap: 'wrap' }}>
              <div className="sp"><b>{o.point === 0 ? 'Start' : o.point === 9 ? 'Cíl' : `Předávka ${o.point}`} · <span className="t">{fmtHHMM(o.minutes)}</span></b>
                <div className="xs muted">zadáno {new Date(o.createdAt).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</div></div>
              {o.status === 'pending' && <span className="pill pend">⏳ čeká</span>}
              {o.status === 'sent' && <span className="pill sent">✓ odesláno</span>}
              {o.status === 'conflict' && <><span className="pill conf">⚠ k ověření</span>
                <button className="btn sm ghost" onClick={() => store.retryConflict(o.id, true)}>Přepsat moje</button>
                <button className="btn sm ghost" onClick={() => store.retryConflict(o.id, false)}>Zahodit</button></>}
            </div>
          ))}
          {ent.map((m, i) => (m != null && !mine.some((o) => o.point === i && o.status !== 'sent') && !mine.some((o) => o.point === i) ? (
            <div className="li" key={`e${i}`} style={{ cursor: 'default' }}>
              <div className="sp"><b>{i === 0 ? 'Start' : i === 9 ? 'Cíl' : `Předávka ${i}`} · <span className="t">{fmtHHMM(m)}</span></b><div className="xs muted">v databázi</div></div><span className="pill sent">✓</span></div>
          ) : null))}
        </div>
        {!mine.length && !ent.some((x) => x != null) && <div className="xs muted" style={{ padding: 8 }}>Zatím nic nezapsáno.</div>}
      </div>
      <div className="row">
        <button className="btn ghost sm" onClick={() => store.flush()}>Odeslat teď</button>
        <label className="xs muted row" style={{ gap: 6 }}><input type="checkbox" checked={s.forceOffline} onChange={(e) => store.setForceOffline(e.target.checked)} /> Vyzkoušet bez signálu</label>
      </div>
      <div className="xs muted">Zapisuješ jen předávky svého týmu. Cizí nebo chybný zápis opraví admin.</div>
    </>
  );
}
