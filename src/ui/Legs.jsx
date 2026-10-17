import { useMemo } from 'react';
import { useApp, lookOf, hashGo } from './ctx.jsx';
import { legMinutes, legRanking, POINTS } from '../domain/calc.js';
import { buildRows } from './derive.js';
import { TeamBadge, Delta } from './common.jsx';
import { fmtDur, fmtHHMM } from '../domain/time.js';

export default function Legs({ n }) {
  const { s, now } = useApp();
  const race = s.race;
  const leg = Math.min(9, Math.max(1, +n || 1));
  const rows = useMemo(() => (race ? buildRows(race, s.entries, now, s.settings) : []), [race, s.entries, now, s.settings]);
  if (!race) return <div className="card">Nejsou nahraná data závodu.</div>;
  const L = race.legs[leg - 1];
  const ranks = legRanking(race, s.entries, leg);
  const list = race.teams.map((t, i) => {
    const m = legMinutes(s.entries[t.id], leg);
    const plan = t.legs[leg - 1];
    return { t, i, m, plan, rank: ranks[t.id], look: lookOf(s.settings, t, i), running: rows.find((r) => r.team.id === t.id)?.lp.leg === leg };
  }).sort((a, b) => (a.m == null) - (b.m == null) || (a.m ?? 0) - (b.m ?? 0) || (b.running - a.running));

  return (
    <>
      <div className="chips">{race.legs.map((l) => <button key={l.n} className={`chip ${l.n === leg ? 'on' : ''}`} onClick={() => hashGo(`/legs/${l.n}`)}>Úsek {l.n}</button>)}</div>
      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <h3>Úsek {leg} · {L.from} → {L.to}</h3>
        <div className="sm">{L.km.toFixed(1).replace('.', ',')} km · ↑ {L.up} m · ↓ {L.down} m · 🚗 přejezd autem {L.carMin} min</div>
        <div className="nav2">
          <a className={`run ${L.navRun ? '' : 'off'}`} href={L.navRun || '#'} target="_blank" rel="noopener noreferrer">🏃 Běžec<small>trasa úseku pěšky</small></a>
          <a className={`car ${L.navCar ? '' : 'off'}`} href={L.navCar || '#'} target="_blank" rel="noopener noreferrer">🚗 Auto<small>doprovod na předávku</small></a>
        </div>
        <div className="xs muted">Odkaz otevře Mapy.cz v novém okně nebo v aplikaci.{L.selfie ? ` Selfie na předávce: ${L.selfie}.` : ''}</div>
      </div>
      <div className="sec">Pořadí na úseku {leg}</div>
      <div className="card" style={{ padding: '4px 12px' }}>
        <div className="list">
          {list.map(({ t, m, plan, rank, look, running }) => (
            <a key={t.id} className="li" onClick={() => hashGo(`/team/${encodeURIComponent(t.id)}`)}>
              <span className={`pos ${rank === 1 ? 'p1' : ''}`}>{rank ?? '–'}</span>
              <TeamBadge look={look} />
              <div className="sp"><div className="nm">{t.name}</div>
                <div className="xs muted">{plan.pair} · {m != null ? `${(L.km / (m / 60)).toFixed(1).replace('.', ',')} km/h` : running ? 'běží' : 'čeká'}</div></div>
              <div className="rt"><span className="tb" style={{ fontSize: 16 }}>{m != null ? fmtDur(m) : '–'}</span>{m != null && <Delta v={m - plan.planMin} />}</div>
            </a>
          ))}
        </div>
      </div>
    </>
  );
}
