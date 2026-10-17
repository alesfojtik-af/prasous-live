/* Záložky Týmy a detail týmu: pořadí, předávky, karta ke sdílení (PNG) na Facebook. */
import { useMemo, useRef, useEffect, useState } from 'react';
import { useApp, usePrepared, hashGo } from './ctx.jsx';
import { buildRows } from './derive.js';
import { TeamBadge, Delta } from './common.jsx';
import { legMinutes, legRanking, rankingAtPoint, netAt, cumPlan } from '../domain/calc.js';
import { fmtDur, fmtHHMM, fmtGap } from '../domain/time.js';
import { drawShareCard, shareCard, canvasToBlob, downloadBlob } from './share.js';

export function TeamList() {
  const { s, now, pinned, setPinned } = useApp();
  const rows = useMemo(() => (s.race ? buildRows(s.race, s.entries, now, s.settings) : []), [s.race, s.entries, now, s.settings]);
  if (!s.race) return <div className="card">Nejsou nahraná data závodu.</div>;
  return (
    <>
      <div className="xs muted">Klepnutím otevřeš detail týmu. Připnutý tým ({pinned ? 'můj' : 'žádný'}) se zobrazí nahoře v přehledu.</div>
      <div className="card" style={{ padding: '4px 12px' }}>
        <div className="list">
          {rows.map((r) => (
            <a key={r.team.id} className="li" onClick={() => hashGo(`/team/${encodeURIComponent(r.team.id)}`)}>
              <span className="pos">{r.rank}</span><TeamBadge look={r.look} />
              <div className="sp"><div className="nm">{r.team.name}</div><div className="xs muted">start {fmtHHMM(r.st.planStart)}{r.st.started ? '' : ' (plán)'}</div></div>
              <button className="chip" onClick={(e) => { e.stopPropagation(); setPinned(pinned === r.team.id ? null : r.team.id); }}>{pinned === r.team.id ? '📌 můj' : 'připnout'}</button>
            </a>
          ))}
        </div>
      </div>
    </>
  );
}

export function TeamDetail({ id }) {
  const { s, now, pinned, setPinned, toast } = useApp();
  const prep = usePrepared(s);
  const race = s.race;
  const rows = useMemo(() => (race ? buildRows(race, s.entries, now, s.settings) : []), [race, s.entries, now, s.settings]);
  const [card, setCard] = useState(null);
  const r = rows.find((x) => x.team.id === id);
  const rankAfter = useMemo(() => (race ? Array.from({ length: 9 }, (_, i) => rankingAtPoint(race, s.entries, i + 1)) : []), [race, s.entries]);
  const bestNet = (n) => Math.min(...race.teams.map((x) => netAt(s.entries[x.id], n)).filter((v) => v != null));
  const rankLegs = useMemo(() => (race ? Array.from({ length: 9 }, (_, i) => legRanking(race, s.entries, i + 1)) : []), [race, s.entries]);
  if (!r) return <div className="card">Tým nenalezen.</div>;
  const t = r.team, ent = s.entries[t.id], k = r.st.k;

  const pairs = {};
  t.legs.forEach((l, i) => { const p = (pairs[l.pairNo ?? l.pair] ||= { name: l.pair, legs: [], km: 0, up: 0, down: 0 }); p.legs.push(i + 1); p.km += race.legs[i].km; p.up += race.legs[i].up; p.down += race.legs[i].down; });

  const makeCard = async () => drawShareCard({
    teamName: t.name, emoji: r.look.emoji, color: r.look.color, rank: r.rank, netText: fmtDur(r.st.projectedNet),
    statusText: r.st.finished ? 'v cíli' : r.lp.leg ? `úsek ${r.lp.leg} z 9` : 'před startem', progress: Math.min(1, r.progress), profile: prep?.profile, year: s.settings.year,
  });
  const share = async () => {
    const c = await makeCard(); setCard(c.toDataURL());
    const res = await shareCard(c, `${t.name} na PraSouši ${s.settings.year}: ${r.rank}. místo, čistý čas ${fmtDur(r.st.projectedNet)} 🏃`);
    if (res === 'copied') toast('Obrázek je ve schránce a stažený. Ve Facebooku ho vložte Ctrl+V.');
    else if (res === 'fallback') toast('Karta se stáhla, Facebook se otevřel v novém okně.');
  };

  return (
    <>
      <a className="xs muted" style={{ cursor: 'pointer' }} onClick={() => hashGo('/teams')}>‹ Týmy</a>
      <div className="row"><TeamBadge look={r.look} size={52} />
        <div className="sp"><h2>{t.name}</h2><div className="xs muted">start {fmtHHMM(r.st.planStart)} · {r.rank}. místo</div></div>
        <button className="chip" onClick={() => setPinned(pinned === t.id ? null : t.id)}>{pinned === t.id ? '📌 můj' : 'připnout'}</button></div>
      <div className="grid3">
        <div className="kpi"><b>{fmtDur(r.st.projectedNet)}</b><span>{r.st.finished ? 'Čistý čas' : 'Čistý čas (predikce)'}</span></div>
        <div className="kpi"><b>{fmtHHMM(r.st.projectedFinish)}</b><span>Cíl</span></div>
        <div className="kpi"><b>{r.st.gap == null ? '–' : `${r.st.gap > 0 ? '+' : r.st.gap < 0 ? '−' : ''}${Math.abs(Math.round(r.st.gap))}′`}</b><span>Proti plánu</span></div>
      </div>
      <div className="sec">Dvojice</div>
      <div className="card" style={{ display: 'grid', gap: 6 }}>
        {Object.entries(pairs).map(([no, p], i) => (
          <div key={no} className="row"><b style={{ width: 70 }}>Dvojice {i + 1}</b><div className="sp sm">{p.name}<div className="xs muted">úseky {p.legs.join(', ')} · {p.km.toFixed(1).replace('.', ',')} km · ↑{p.up} ↓{p.down} m</div></div></div>
        ))}
      </div>
      <div className="sec">Časová osa</div>
      <div className="card"><div className="tl">
        <div className="st"><span className={`nd ${ent[0] != null ? 'done' : ''}`} /><div><b>Start</b><div className="xs muted">{ent[0] != null ? 'zapsáno' : 'plán'}</div></div><span className="tb">{fmtHHMM(ent[0] ?? t.planStart)}</span></div>
        {t.legs.map((l, i) => {
          const n = i + 1, done = ent[n] != null, running = !done && n === k + 1 && r.st.started;
          const m = legMinutes(ent, n);
          return (
            <div className="st" key={n}>
              <span className={`nd ${done ? 'done' : running ? 'now' : ''}`} />
              <div><b>Ú{n} · {l.pair}</b> <span className="xs muted">{race.legs[i].km.toFixed(1).replace('.', ',')} km</span>
                <div className="xs muted">{done ? `${fmtDur(m)} · plán ${fmtDur(l.planMin)} · ${rankLegs[i][t.id]}. na úseku` : running ? `právě běží · predikce předávky` : `plán ${fmtDur(l.planMin)}`}</div>
                {done && <div className="xs muted">celkem {rankAfter[i][t.id]}. · {netAt(ent, n) - bestNet(n) === 0 ? 'vedoucí' : `ztráta ${fmtGap(Math.round(netAt(ent, n) - bestNet(n)))}`} · proti plánu {fmtGap(Math.round(netAt(ent, n) - cumPlan(t, n)))}</div>}
              </div>
              <div className="rt" style={{ textAlign: 'right', display: 'grid', gap: 3, justifyItems: 'end' }}>
                <span className="tb">{fmtHHMM(done ? ent[n] : r.st.predicted[n])}</span>{done && <Delta v={m - l.planMin} />}</div>
            </div>
          );
        })}
      </div></div>
      <button className="btn" onClick={share}>📣 Sdílet na Facebook</button>
      {card && <img className="sharecard" src={card} alt="Karta ke sdílení" />}
    </>
  );
}

export async function downloadAllCards(rows, prep, settings) {
  for (const r of rows) {
    const c = await drawShareCard({ teamName: r.team.name, emoji: r.look.emoji, color: r.look.color, rank: r.rank, netText: fmtDur(r.st.projectedNet), statusText: r.st.finished ? 'v cíli' : 'v závodě', progress: Math.min(1, r.progress), profile: prep?.profile, year: settings.year });
    downloadBlob(await canvasToBlob(c), `prasous-${settings.year}-${r.rank}-${r.team.name.replace(/\W+/g, '_')}.png`);
    await new Promise((res) => setTimeout(res, 350));
  }
}
