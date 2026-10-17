/* Přehled „Živě“: pořadí týmů, vedoucí tým a siluetu trati. Před závodem odpočet a plán, po závodě konečné výsledky. */
import { useMemo, useState } from 'react';
import { useApp, usePrepared, hashGo } from './ctx.jsx';
import { buildRows, totalKm, legLabel } from './derive.js';
import { TeamBadge, Delta, Silhouette } from './common.jsx';
import { fmtDur, fmtHHMM } from '../domain/time.js';
import { daysUntil } from '../domain/phase.js';

function LiveRow({ r, race, card }) {
  return (
    <a className={card ? undefined : 'li'} onClick={() => hashGo(`/team/${encodeURIComponent(r.team.id)}`)} style={card ? { display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' } : undefined}>
      <span className={`pos ${r.rank === 1 ? 'p1' : ''}`}>{r.rank}</span>
      <TeamBadge look={r.look} />
      <div className="sp">
        <div className="nm">{r.team.name}</div>
        <div className="xs muted">{legLabel(r, race)} · {Math.round(r.progress * 100)} % trati</div>
        <div className="bar" style={{ marginTop: 4 }}><i style={{ width: `${r.progress * 100}%`, background: r.look.color }} /></div>
      </div>
      <div className="rt">
        <span className="tb" style={{ fontSize: 17 }}>{fmtDur(r.st.projectedNet)}</span>
        <Delta v={r.st.gap} />
      </div>
    </a>
  );
}

/** Přepínač ročníků pod seznamem týmů (jen když je ročníků víc). Aktuální ročník = aktivní v databázi. */
function EditionSwitch() {
  const { s, store } = useApp();
  if (s.editions.length < 2) return null;
  return (
    <div style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
      <div className="xs muted">Ročníky závodu</div>
      <div className="chips" style={{ justifyContent: 'center' }}>
        {[...s.editions].reverse().map((e) => (
          <button key={e.id} className={`chip ${e.id === s.viewId ? 'on' : ''}`} onClick={() => store.viewEdition(e.id === s.activeId ? null : e.id)}>{e.label}{e.id === s.activeId ? ' (aktuální)' : ''}</button>
        ))}
      </div>
    </div>
  );
}

export default function Live() {
  const { s, now, pinned } = useApp();
  const race = s.race;
  const prep = usePrepared(s);
  const [cardTeam, setCardTeam] = useState(null); // tým vybraný pro kartu ke sdílení po závodě
  const rows = useMemo(() => (race ? buildRows(race, s.entries, now, s.settings) : []), [race, s.entries, now, s.settings]);
  if (!race) return <Empty />;
  if (s.phase === 'before') return <PreRace rows={rows} />;

  const leader = rows[0];
  const starts = rows.filter((r) => r.st.started).map((r) => r.ent[0]);
  const raceStart = starts.length ? Math.min(...starts) : null;
  const mine = pinned && rows.find((r) => r.team.id === pinned);
  const over = s.phase === 'after' || rows.every((r) => r.st.finished);

  return (
    <>
      {over && <div className="card gold"><h3>{s.phase === 'after' ? `Závod ${s.settings.year} skončil` : 'Všechny týmy jsou v cíli'}</h3><div className="sm">Konečné výsledky podle čistého času od vlastního startu.</div>
        <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
          <select aria-label="Tým" value={cardTeam ?? (mine || rows[0]).team.id} onChange={(e) => setCardTeam(e.target.value)} style={{ flex: 1 }}>
            {rows.map((r) => <option key={r.team.id} value={r.team.id}>{r.rank}. {r.team.name}</option>)}</select>
          <button className="btn sm" onClick={() => hashGo(`/team/${encodeURIComponent(cardTeam ?? (mine || rows[0]).team.id)}`)}>📣 Karta týmu ke sdílení</button>
          <button className="btn ghost sm" onClick={() => hashGo('/finale')}>🎬 Přehrát závod</button></div></div>}
      <div className="grid3">
        <div className="kpi"><b>{raceStart != null ? fmtDur(over ? leader.st.projectedNet : Math.max(0, now - raceStart)) : '–'}</b><span>{over ? 'Čas vítěze' : 'V závodě'}</span></div>
        <div className="kpi"><b>{leader.lp.leg >= 10 ? 'cíl' : `${Math.max(1, leader.lp.leg)}/9`}</b><span>Úsek vedoucího</span></div>
        <div className="kpi"><b>{fmtHHMM(leader.st.projectedFinish)}</b><span>{over ? 'Cíl vítěze' : 'Predikce 1. v cíli'}</span></div>
      </div>
      {prep?.profile && <div className="card" style={{ padding: '8px 10px' }}>
        <Silhouette profile={prep.profile} progress={leader.progress} height={52} />
        <div className="xs muted">Vedoucí tým: {leader.team.name} · {leader.km.toFixed(1)} z {totalKm(race).toFixed(1)} km</div>
      </div>}
      <div className="xs muted">Pořadí podle čistého času od vlastního startu. {over ? '' : 'Čas = predikce čistého času v cíli (zapsané předávky + plán + uplynulý čas).'}</div>
      {mine && <div className="card gold"><div className="xs" style={{ fontWeight: 700 }}>📌 Můj tým</div><LiveRow r={mine} race={race} card /></div>}
      <div className="card" style={{ padding: '4px 12px' }}>
        <div className="list">{rows.map((r) => <LiveRow key={r.team.id} r={r} race={race} />)}</div>
      </div>
      <EditionSwitch />
    </>
  );
}

/** Před závodem: odpočet a plánované starty (pořadí a predikce by byly zavádějící). */
function PreRace({ rows }) {
  const { s } = useApp();
  const d = daysUntil(s.settings.date);
  const first = Math.min(...rows.map((r) => r.st.planStart));
  const dateText = new Date(`${s.settings.date}T12:00:00`).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <>
      <div className="card gold" style={{ display: 'grid', gap: 4 }}>
        <h3>Závod {s.settings.year} začne {dateText}</h3>
        <div className="sm">První start v {fmtHHMM(first)} · {d === 1 ? 'zítra' : `za ${d} dní`}</div>
      </div>
      <div className="sec">Plánované starty a cíle</div>
      <div className="card" style={{ padding: '4px 12px' }}>
        <div className="list">
          {[...rows].sort((a, b) => a.st.planStart - b.st.planStart).map((r) => (
            <a key={r.team.id} className="li" onClick={() => hashGo(`/team/${encodeURIComponent(r.team.id)}`)}>
              <TeamBadge look={r.look} />
              <div className="sp"><div className="nm">{r.team.name}</div><div className="xs muted">plánovaný cíl {fmtHHMM(r.st.predicted[9])}</div></div>
              <span className="tb">{fmtHHMM(r.st.planStart)}</span>
            </a>
          ))}
        </div>
      </div>
      <EditionSwitch />
    </>
  );
}

function Empty() {
  const { auth } = useApp();
  return (
    <div className="card" style={{ display: 'grid', gap: 10 }}>
      <h3>Zatím tu nejsou data závodu</h3>
      <div className="sm muted">Admin musí nahrát Excel a GPX trasu (nebo načíst testovací závod 2026).</div>
      <button className="btn" onClick={() => hashGo(auth.role === 'admin' ? '/admin' : '/login')}>{auth.role === 'admin' ? 'Otevřít admin' : 'Přihlásit jako admin'}</button>
    </div>
  );
}
