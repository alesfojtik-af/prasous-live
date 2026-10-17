/* Obrazovka kapitána: zápis startu a předávek s kontrolou času, fronta zápisů a práce bez signálu. */
import { useMemo, useState } from 'react';
import { useApp, hashGo, lookOf } from './ctx.jsx';
import { lastIndex, teamState, rankingAtPoint } from '../domain/calc.js';
import { drawSelfieCard, fileToImage, shareCard, downloadBlob, canvasToBlob } from './share.js';
import { fmtHHMM, fmtDur, validateEntry, pointLabel, pointTitle } from '../domain/time.js';

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
  const val = useMemo(() => validateEntry(normTxt(txt), { prev: np > 0 ? ent[np - 1] : null, predicted, now, isAdmin: false, planStart: t.planStart, planLeg: np > 0 ? t.legs[np - 1].planMin : null }), [txt, np, ent, predicted, now, t]);
  const mine = s.outbox.filter((o) => o.team === t.id);
  const canWrite = s.phase === 'live' && !s.isArchive;
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
  const label = pointTitle(np);
  const last = lastIndex(ent); // poslední zapsaný bod (selfie patří k němu)
  const [selfie, setSelfie] = useState(null); // { url, canvas }
  const takeSelfie = async (file) => {
    if (!file) return;
    const photo = await fileToImage(file);
    const look = lookOf(s.settings, t, s.race.teams.findIndex((x) => x.id === t.id));
    const rank = last >= 1 ? rankingAtPoint(s.race, s.entries, last)[t.id] : null;
    const canvas = await drawSelfieCard({ photo, teamName: t.name, emoji: look.emoji, color: look.color, pointText: pointLabel(last), timeText: fmtHHMM(ent[last]),
      rankText: rank ? `${rank}. místo celkově po ${last}. úseku` : 'Vyrážíme!', hint: last >= 1 ? s.race.legs[last - 1].selfie : null, year: s.settings.year });
    setSelfie({ url: canvas.toDataURL('image/jpeg', 0.85), canvas });
  };
  const shareSelfie = async () => {
    const res = await shareCard(selfie.canvas, `${t.name} na PraSouši ${s.settings.year}: ${pointLabel(last)} 📸`);
    if (res === 'copied') toast('Obrázek je ve schránce a stažený. Ve Facebooku ho vložte Ctrl+V.');
  };

  return (
    <>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <h2>{t.name}</h2><span className="sp" />
        {!s.online && <span className="pill conf">📶 bez signálu</span>}
        {pending > 0 && <span className="pill pend">⏳ čeká: {pending}</span>}
      </div>
      {!canWrite && !done && <div className="card gold"><div className="sm">Zápis je možný jen v den závodu na aktuálním ročníku.</div></div>}
      {done ? <div className="card gold"><h3>Všechny body zapsány 🎉</h3><div className="sm">Čistý čas: {fmtDur(ent[9] - ent[0])}. Případné opravy provede admin.</div></div> : !canWrite ? null : (
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
          {txt && val.ok && val.nextDay && <div className="warnmsg">🌙 Čas je po půlnoci, počítá se jako další den ({fmtHHMM(val.minutes)}).</div>}
          {txt && val.ok && !val.warnings.length && <div className="okmsg">✓ Čas vypadá správně</div>}
          <div className="row">
            {val.suggestion != null && <button className="btn ghost sm" style={{ flex: 1 }} onClick={() => { setTxt(fmtHHMM(val.suggestion)); setConfirm(false); }}>Použít {fmtHHMM(val.suggestion)}</button>}
            <button className="btn ghost sm" style={{ flex: 1 }} onClick={() => { setTxt(fmtHHMM(now)); setConfirm(false); }}>Teď ({fmtHHMM(now)})</button>
          </div>
          <div className="keypad">{['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', ':'].map((k) => <button key={k} onClick={() => press(k)} aria-label={k}>{k}</button>)}</div>
          <button className="btn" disabled={!val.ok || busy} onClick={save}>{confirm ? 'Opravdu uložit' : np === 0 ? 'Uložit start' : 'Uložit předávku'}</button>
        </>
      )}
      {last >= 0 && (
        <div className="card" style={{ display: 'grid', gap: 8 }}>
          <b>📸 Selfie z bodu „{pointLabel(last)}“</b>
          {last >= 1 && s.race.legs[last - 1].selfie && <div className="xs muted">Tip: {s.race.legs[last - 1].selfie}</div>}
          <label className="btn ghost sm" style={{ textAlign: 'center' }}>{selfie ? 'Vyfotit znovu' : 'Vyfotit / vybrat fotku'}
            <input type="file" accept="image/*" capture="user" hidden onChange={(e) => takeSelfie(e.target.files?.[0])} /></label>
          {selfie && <>
            <img className="sharecard" src={selfie.url} alt="Selfie karta" />
            <button className="btn" onClick={shareSelfie}>📣 Sdílet na Facebook</button>
            <button className="btn ghost sm" onClick={async () => downloadBlob(await canvasToBlob(selfie.canvas), 'prasous-selfie.png')}>⬇ Uložit obrázek</button>
          </>}
          <div className="xs muted">Fotka zůstává jen ve tvém telefonu, do databáze se neukládá.</div>
        </div>
      )}
      <div className="sec">Moje zápisy</div>
      <div className="card" style={{ padding: '4px 12px' }}>
        <div className="list">
          {[...mine].reverse().map((o) => (
            <div className="li" key={o.id} style={{ cursor: 'default', flexWrap: 'wrap' }}>
              <div className="sp"><b>{pointLabel(o.point)} · <span className="t">{fmtHHMM(o.minutes)}</span></b>
                <div className="xs muted">zadáno {new Date(o.createdAt).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</div></div>
              {o.status === 'pending' && <span className="pill pend">⏳ čeká</span>}
              {o.status === 'sent' && <span className="pill sent">✓ odesláno</span>}
              {o.status === 'conflict' && <><span className="pill conf">⚠ k ověření</span>
                <div className="xs muted" style={{ width: '100%' }}>V databázi je už jiný čas. Zápis oprav přes admina.</div>
                <button className="btn sm ghost" onClick={() => store.retryConflict(o.id, false)}>Zahodit</button></>}
              {o.status === 'error' && <><span className="pill conf">✕ nepřijato</span>
                <div className="xs errmsg" style={{ width: '100%' }}>{o.error}</div>
                <button className="btn sm ghost" onClick={() => store.retryConflict(o.id, false)}>Zahodit</button></>}
            </div>
          ))}
          {ent.map((m, i) => (m != null && !mine.some((o) => o.point === i && o.status !== 'sent') && !mine.some((o) => o.point === i) ? (
            <div className="li" key={`e${i}`} style={{ cursor: 'default' }}>
              <div className="sp"><b>{pointLabel(i)} · <span className="t">{fmtHHMM(m)}</span></b><div className="xs muted">v databázi</div></div><span className="pill sent">✓</span></div>
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
