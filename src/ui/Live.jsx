import { useMemo } from 'react';
import { useApp, usePrepared, hashGo } from './ctx.jsx';
import { buildRows, totalKm, legLabel } from './derive.js';
import { TeamBadge, Delta, Silhouette } from './common.jsx';
import { fmtDur, fmtHHMM } from '../domain/time.js';

export default function Live() {
  const { s, now, pinned } = useApp();
  const race = s.race;
  const prep = usePrepared(s);
  const rows = useMemo(() => (race ? buildRows(race, s.entries, now, s.settings) : []), [race, s.entries, now, s.settings]);
  if (!race) return <Empty />;

  const leader = rows[0];
  const starts = rows.filter((r) => r.st.started).map((r) => r.ent[0]);
  const raceStart = starts.length ? Math.min(...starts) : null;
  const mine = pinned && rows.find((r) => r.team.id === pinned);
  const finished = rows.every((r) => r.st.finished);

  const Row = ({ r, card }) => (
    <a className={card ? undefined : 'li'} onClick={() => hashGo(`/team/${encodeURIComponent(r.team.id)}`)} style={card ? { display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' } : undefined}>
      <span className={`pos ${r.rank === 1 ? 'p1' : ''}`}>{r.rank}</span>
      <TeamBadge look={r.look} />
      <div className="sp">
        <div className="nm">{r.team.name}</div>
        <div className="xs muted">{legLabel(r, race)} · {Math.round(r.progress * 100)} % trati</div>
        <div className="bar" style={{ marginTop: 4 }}><i style={{ width: `${r.progress * 100}%`, background: r.look.color }} /></div>
      </div>
      <div className="rt">
        <span className="tb" style={{ fontSize: 17 }}>{fmtDur(r.st.finished ? r.st.projectedNet : r.st.projectedNet)}</span>
        <Delta v={r.st.gap} />
      </div>
    </a>
  );

  return (
    <>
      <div className="grid3">
        <div className="kpi"><b>{raceStart != null ? fmtDur(Math.max(0, now - raceStart)) : '–'}</b><span>V závodě</span></div>
        <div className="kpi"><b>{leader.lp.leg >= 10 ? 'cíl' : `${Math.max(1, leader.lp.leg)}/9`}</b><span>Úsek vedoucího</span></div>
        <div className="kpi"><b>{fmtHHMM(leader.st.projectedFinish)}</b><span>Predikce 1. v cíli</span></div>
      </div>
      {prep?.profile && <div className="card" style={{ padding: '8px 10px' }}>
        <Silhouette profile={prep.profile} progress={leader.progress} height={52} />
        <div className="xs muted">Vedoucí tým: {leader.team.name} · {leader.km.toFixed(1)} z {totalKm(race).toFixed(1)} km</div>
      </div>}
      <div className="xs muted">Pořadí podle čistého času od vlastního startu. {finished ? 'Závod je dokončen.' : 'Čas = predikce čistého času v cíli (zapsané předávky + plán + uplynulý čas).'}</div>
      {mine && <div className="card gold"><div className="xs" style={{ fontWeight: 700 }}>📌 Můj tým</div><Row r={mine} card /></div>}
      <div className="card" style={{ padding: '4px 12px' }}>
        <div className="list">{rows.map((r) => <Row key={r.team.id} r={r} />)}</div>
      </div>
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
