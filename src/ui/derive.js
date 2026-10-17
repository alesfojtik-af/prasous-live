/* Odvozená data pro UI (řádky pořadí, předpřipravená trasa) z čistých výpočtů v domain/. */
import { liveRanking, legProgress, kmAt, lastIndex, POINTS } from '../domain/calc.js';
import { lookOf } from './ctx.jsx';

export const totalKm = (race) => race.legs.reduce((a, l) => a + l.km, 0);

export function entriesUpTo(entries, T) {
  const out = {};
  for (const id in entries) out[id] = entries[id].map((m) => (m != null && m <= T ? m : null));
  return out;
}

/** Řádky pořadí s polohou na trati pro čas T (živě = now, přehrávání = T). */
export function buildRows(race, entries, T, settings) {
  const e = entriesUpTo(entries, T);
  const total = totalKm(race);
  return liveRanking(race, e, T).map((r) => {
    const idx = race.teams.findIndex((t) => t.id === r.team.id);
    const lp = legProgress(r.team, e[r.team.id], T);
    const km = kmAt(race, lp.leg, lp.p);
    return { ...r, look: lookOf(settings, r.team, idx), lp, km, progress: km / total, ent: e[r.team.id] };
  });
}

export const nextPoint = (ent) => lastIndex(ent) + 1; // 0 = start, 1..9, 10 = vše zapsáno
export { POINTS };

export function legLabel(row, race) {
  const { leg } = row.lp;
  if (leg === 0) return row.st.started ? 'na startu' : 'čeká na start';
  if (leg >= 10) return 'v cíli';
  return `úsek ${leg}`;
}
