/* Slovní zhodnocení závodu: jedna pozitivní věta o plnění plánu (pro kartu týmu a video po konci závodu). */
import { cumPlan, netAt } from './calc.js';
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
  const mine = teamId && done.find((x) => x.team.id === teamId);
  if (!mine) return `Závod dokončilo ${done.length} týmů a ${everyone}.`;
  const vs = mine.gap < 0 ? `o ${-mine.gap} min rychleji než plán` : mine.gap === 0 ? 'přesně podle plánu' : `jen ${mine.gap} min za plánem`;
  return `Tým ${mine.team.name} doběhl na ${rank(mine)}. místě v čase ${fmtDur(mine.net)}, ${vs}, a celkově ${everyone}.`;
}
