/* Slovní zhodnocení závodu: jedna pozitivní věta o plnění plánu (pro kartu týmu a video po konci závodu). */
import { cumPlan, netAt, legMinutes, rankingAtPoint } from './calc.js';
import { fmtDur } from './time.js';

export const CONGRATS = 'Gratulujeme, skvělý výkon!';

/** Rozdíl cílového čistého času proti plánu v minutách (záporný = rychleji než plán), jen pro týmy v cíli. */
export function planGaps(race, entries) {
  return race.teams
    .filter((t) => netAt(entries[t.id], 9) != null)
    .map((t) => ({ team: t, net: netAt(entries[t.id], 9), gap: Math.round(netAt(entries[t.id], 9) - cumPlan(t, 9)) }));
}

/**
 * Jedna věta: jak tým (nebo celý závod) dopadl vůči plánu a komu se plán dařilo plnit a překonávat.
 * Vždy pozitivní tón, ale jen z čísel, která v datech jsou.
 */
export function raceComment(race, entries, teamId = null) {
  const done = planGaps(race, entries);
  if (!done.length) return '';
  const rank = (g) => 1 + done.filter((x) => x.net < g.net).length;
  const best = done.reduce((a, b) => (b.gap < a.gap ? b : a));
  const beat = done.filter((x) => x.gap <= 0).length;
  const everyone = `${beat > 0 ? `plán splnilo nebo překonalo ${beat} z ${done.length} týmů, nejvíc ${best.team.name} (${best.gap < 0 ? `o ${-best.gap} min rychleji` : 'přesně podle plánu'})`
    : `všechny týmy se plánu těsně držely, nejblíže ${best.team.name} (jen ${best.gap} min za plánem)`}`;
  if (teamId) return teamComment(race, entries, teamId);
  return `Závod dokončilo ${done.length} týmů a ${everyone}.`;
}

/**
 * Komentář jen k jednomu týmu a jeho dvojicím: výsledek proti plánu, nejlepší pozice a po kterém úseku, kolikrát se měnila pozice
 * a která dvojice plán překonala nejvíc. Jiné týmy se nezmiňují.
 */
export function teamComment(race, entries, teamId) {
  const t = race.teams.find((x) => x.id === teamId), ent = entries[teamId];
  if (!t || netAt(ent, 9) == null) return '';
  const gap = Math.round(netAt(ent, 9) - cumPlan(t, 9));
  const ranks = Array.from({ length: 9 }, (_, i) => rankingAtPoint(race, entries, i + 1)[teamId]);
  const best = Math.min(...ranks), bestLeg = ranks.indexOf(best) + 1;
  const changes = ranks.slice(1).filter((r, i) => r !== ranks[i]).length;
  const pairs = {};
  t.legs.forEach((l, i) => { const p = (pairs[l.pairNo ?? l.pair] ||= { name: l.pair, diff: 0 }); p.diff += legMinutes(ent, i + 1) - l.planMin; });
  const bestPair = Object.values(pairs).reduce((a, b) => (b.diff < a.diff ? b : a));
  const d = Math.round(bestPair.diff);
  const vs = gap < 0 ? `o ${-gap} min rychleji než plán` : gap === 0 ? 'přesně podle plánu' : `jen ${gap} min za plánem`;
  const pos = `Nejlépe jste stáli na ${best}. místě po ${bestLeg}. úseku${changes ? ` a o pozice jste se přetahovali ${changes}×` : ' a pozici jste si drželi celý závod'}.`;
  const pair = d < 0 ? `Plán nejvíc překonala dvojice ${bestPair.name} (o ${-d} min).` : d === 0 ? `Plán přesně splnila dvojice ${bestPair.name}.` : `Plánu se nejvíc přiblížila dvojice ${bestPair.name} (jen ${d} min za ním).`;
  const rank = 1 + race.teams.filter((x) => netAt(entries[x.id], 9) != null && netAt(entries[x.id], 9) < netAt(ent, 9)).length;
  return `Doběhli jste na ${rank}. místě ${vs}. ${pos} ${pair}`;
}
