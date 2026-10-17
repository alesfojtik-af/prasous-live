/* Záložka Úseky: seznam úseků, pořadí a čas na úseku. */
import { useMemo } from 'react';
import { useApp, lookOf, hashGo } from './ctx.jsx';
import { legMinutes, legRanking, rankingAtPoint, netAt, cumPlan } from '../domain/calc.js';
import { buildRows } from './derive.js';
import { TeamBadge, Delta } from './common.jsx';
import { fmtDur, fmtHHMM, fmtGap } from '../domain/time.js';

export default function Legs({ n }) {
  const { s, now } = useApp();
  const race = s.race;
  const leg = Math.min(9, Math.max(1, +n || 1));
  const rows = useMemo(() => (race ? buildRows(race, s.entries, now, s.settings) : []), [race, s.entries, now, s.settings]);
  if (!race) return <div className="card">Nejsou nahraná data závodu.</div>;
  const L = race.legs[leg - 1];
  const ranks = legRanking(race, s.entries, leg);
  const ranksAfter = rankingAtPoint(race, s.entries, leg);
  const kmDone = race.legs.slice(0, leg).reduce((a, l) => a + l.km, 0);
  // Nejlepší čas na úseku a nejlepší kumulativní čas po úseku = základ pro ztráty.
  const mins = race.teams.map((t) => legMinutes(s.entries[t.id], leg)).filter((m) => m != null);
  const nets = race.teams.map((t) => netAt(s.entries[t.id], leg)).filter((m) => m != null);
  const bestLeg = mins.length ? Math.min(...mins) : null, bestNet = nets.length ? Math.min(...nets) : null;
  const list = race.teams.map((t, i) => {
    const ent = s.entries[t.id];
    const m = legMinutes(ent, leg), net = netAt(ent, leg);
    return { t, m, net, plan: t.legs[leg - 1], rank: ranks[t.id], rankAfter: net != null ? ranksAfter[t.id] : null, look: lookOf(s.settings, t, i),
      running: rows.find((r) => r.team.id === t.id)?.lp.leg === leg, clock: ent?.[leg], vsPlan: net != null ? net - cumPlan(t, leg) : null };
  }).sort((a, b) => (a.net == null) - (b.net == null) || (a.net ?? 0) - (b.net ?? 0) || (b.running - a.running));
  const gapTxt = (v) => (v == null ? '–' : v === 0 ? '0′' : fmtGap(Math.round(v)));

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
      <div className="sec">Úsek {leg} a pořadí po něm</div>
      <div className="card" style={{ padding: '4px 8px', overflowX: 'auto' }}>
        <table className="tbl">
          <thead><tr><th>Tým</th><th>Poř. úsek</th><th>Čas úseku</th><th>Ztráta úsek</th><th>km/h úsek</th><th>Poř. celkem</th><th>Odstup od 1.</th><th>Vs plán</th><th>Předávka</th><th>Ø km/h</th></tr></thead>
          <tbody>
            {list.map(({ t, m, net, plan, rank, rankAfter, look, running, clock, vsPlan }) => (
              <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => hashGo(`/team/${encodeURIComponent(t.id)}`)}>
                <td><span className="row" style={{ gap: 6 }}><TeamBadge look={look} size={22} />{t.name}</span><div className="xs muted">{plan.pair}</div></td>
                <td>{rank ?? (running ? 'běží' : '–')}</td>
                <td className="tb">{m != null ? fmtDur(m) : '–'}</td>
                <td>{m != null ? gapTxt(m - bestLeg) : '–'}</td>
                <td>{m != null ? (L.km / (m / 60)).toFixed(1).replace('.', ',') : '–'}</td>
                <td><b>{rankAfter ?? '–'}</b></td>
                <td>{net != null ? gapTxt(net - bestNet) : '–'}</td>
                <td>{net != null ? <Delta v={vsPlan} /> : '–'}</td>
                <td className="tb">{clock != null ? fmtHHMM(clock) : '–'}</td>
                <td>{net != null ? (kmDone / (net / 60)).toFixed(1).replace('.', ',') : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="xs muted">Ztráta úseku = proti nejrychlejšímu času na úseku. Odstup od 1. = čistý čas od vlastního startu proti nejlepšímu týmu po úseku. Vs plán = kumulativně proti plánu. Ø km/h = od startu po tento úsek.</div>
    </>
  );
}
