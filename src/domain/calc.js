/* Výpočty závodu: stav týmu, predikce cíle (poslední předávka + zbývající plán), pořadí podle čistého času od vlastního startu (soutěžní pořadí), pořadí na úseku a poloha na trati. Čas = minuty od půlnoci. */
import { competitionRank } from './time.js';

/* Výpočty závodu. entries[teamId] = [start, p1..p9] (minuty od půlnoci nebo null). */

export const POINTS = 10;

export function lastIndex(ent) {
  let k = -1;
  for (let i = 0; i < POINTS; i++) if (ent?.[i] != null) k = i;
  return k;
}

export const cumPlan = (team, i) => team.legs.slice(0, i).reduce((a, l) => a + l.planMin, 0);

/** Čistý čas týmu v bodě i (od vlastního startu). */
export const netAt = (ent, i) => (ent?.[0] != null && ent?.[i] != null ? ent[i] - ent[0] : null);
export const legMinutes = (ent, i) => (ent?.[i] != null && ent?.[i - 1] != null ? ent[i] - ent[i - 1] : null);

/** Stav týmu v čase now. */
export function teamState(team, ent, now) {
  const k = lastIndex(ent);
  const started = ent?.[0] != null;
  const finished = ent?.[9] != null;
  const planStart = ent?.[0] ?? team.planStart;
  // predikce času předávek = poslední zapsaná předávka + plán zbývajících úseků (= plán + GAP)
  const base = k >= 0 ? ent[k] : planStart;
  const baseIdx = Math.max(k, 0);
  const predicted = Array(POINTS).fill(null);
  for (let i = 0; i < POINTS; i++) {
    if (ent?.[i] != null) predicted[i] = ent[i];
    else predicted[i] = base + cumPlan(team, i) - cumPlan(team, baseIdx);
  }
  const gap = k >= 1 ? netAt(ent, k) - cumPlan(team, k) : k === 0 ? 0 : null;
  // zpoždění běžícího úseku: už je po predikci, ale předávka není zapsaná
  let overdue = 0;
  if (started && !finished && now != null) overdue = Math.max(0, now - predicted[k + 1]);
  const projectedFinish = predicted[9] + overdue;
  const projectedNet = projectedFinish - planStart;
  return { k, started, finished, planStart, predicted, gap, overdue, projectedFinish, projectedNet };
}

/** Průběžné pořadí (z posledního zápisu + predikce + uplynulého času). */
export function liveRanking(race, entries, now) {
  const rows = race.teams.map((t) => ({ team: t, st: teamState(t, entries[t.id], now) }));
  const ranks = competitionRank(rows.map((r) => ({ id: r.team.id, v: Math.round(r.st.projectedNet) })));
  rows.forEach((r) => (r.rank = ranks[r.team.id]));
  return rows.sort((a, b) => a.rank - b.rank || a.team.name.localeCompare(b.team.name, 'cs'));
}

/** Pořadí celkově po bodu i podle čistého času od vlastního startu (jako list SOUHRN). */
export function rankingAtPoint(race, entries, i) {
  return competitionRank(race.teams.map((t) => ({ id: t.id, v: netAt(entries[t.id], i) })));
}

/** Pořadí na úseku i (1..9). */
export function legRanking(race, entries, i) {
  return competitionRank(race.teams.map((t) => ({ id: t.id, v: legMinutes(entries[t.id], i) })));
}

/** Poloha týmu v čase T: { leg: 0 (před startem) | 1..9 | 10 (v cíli), p: 0..1 } */
export function legProgress(team, ent, T) {
  const k = lastIndex(ent);
  if (ent?.[0] == null) return { leg: 0, p: 0 };
  if (T < ent[0]) return { leg: 0, p: 0 };
  // poslední zapsaný bod před T (zápisy po T ignorujeme = přehrávání minulosti)
  let j = 0;
  for (let i = 0; i < POINTS; i++) if (ent[i] != null && ent[i] <= T) j = i;
  if (j === 9) return { leg: 10, p: 1 };
  const next = ent[j + 1];
  if (next != null) return { leg: j + 1, p: (T - ent[j]) / Math.max(1, next - ent[j]) };
  const plan = team.legs[j].planMin;
  return { leg: j + 1, p: Math.min(0.97, (T - ent[j]) / plan) };
}

/** Kilometr závodu (podle Excelu) pro dané leg/p. */
export function kmAt(race, leg, p) {
  const km = race.legs.map((l) => l.km);
  if (leg <= 0) return 0;
  if (leg >= 10) return km.reduce((a, b) => a + b, 0);
  return km.slice(0, leg - 1).reduce((a, b) => a + b, 0) + km[leg - 1] * p;
}

/** Zápisy podle scénáře do času T (pro simulaci a přehrávání). */
export function entriesFromScenario(race, T = 1e9) {
  const out = {};
  for (const t of race.teams) out[t.id] = Array.from({ length: POINTS }, (_, i) => (t.scenario && t.scenario[i] != null && t.scenario[i] <= T ? t.scenario[i] : null));
  return out;
}
