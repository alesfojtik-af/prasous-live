import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { parseWorkbook, exportWorkbook } from '../src/domain/excel.js';
import { parseGpx, locateHandovers } from '../src/domain/gpx.js';
import { entriesFromScenario, netAt, rankingAtPoint, legRanking, teamState, liveRanking } from '../src/domain/calc.js';
import { validateEntry, parseHHMM, fmtHHMM } from '../src/domain/time.js';

const xlsx = fs.readFileSync('data/2026/prasous-2026.xlsx');
let race, souhrn;

beforeAll(async () => {
  race = await parseWorkbook(xlsx);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsx);
  souhrn = wb.getWorksheet('SOUHRN');
});
const val = (a) => { const v = souhrn.getCell(a).value; return v && typeof v === 'object' ? v.result : v; };
const col = (i) => String.fromCharCode('B'.charCodeAt(0) + i);
const colK = (i) => String.fromCharCode('K'.charCodeAt(0) + i);

describe('import Excelu 2026', () => {
  it('načte 7 týmů a 9 úseků, 156,6 km', () => {
    expect(race.report.errors).toEqual([]);
    expect(race.teams).toHaveLength(7);
    expect(race.legs).toHaveLength(9);
    expect(race.legs.reduce((a, l) => a + l.km, 0)).toBeCloseTo(156.6, 5);
    expect(race.teams.map((t) => t.name)).toContain('8aD');
  });
  it('jména dvojic jsou správná (ne ze vzorců H16+)', () => {
    const t = race.teams.find((x) => x.name === '8aD');
    expect(t.legs.map((l) => l.pair)).toEqual(['Tomáš-Jaroslav', 'Šárka-Jakub', 'Magdalena-Jakub', 'Tomáš-Jaroslav', 'Šárka-Jakub', 'Magdalena-Jakub', 'Tomáš-Jaroslav', 'Šárka-Jakub', 'Magdalena-Jakub']);
  });
  it('FAKEER (jiné rozložení) bere dvojice z výběru', () => {
    const t = race.teams.find((x) => x.name === 'FAKEER');
    expect(t.layout).toBe('helper');
    expect(t.legs[0].pair).toBe('Martin-Radek');
  });
});

describe('shoda se SOUHRN z Excelu 2026', () => {
  it('čistý čas, celkové pořadí a pořadí na úsecích po každém úseku', () => {
    const entries = entriesFromScenario(race);
    race.teams.forEach((t, ti) => {
      for (let i = 1; i <= 9; i++) {
        expect(netAt(entries[t.id], i)).toBeCloseTo(val(`${colK(ti)}${30 + i}`), 6);
      }
    });
    for (let i = 1; i <= 9; i++) {
      const overall = rankingAtPoint(race, entries, i);
      const legs = legRanking(race, entries, i);
      race.teams.forEach((t, ti) => {
        expect(overall[t.id], `celkově ${t.name} po ${i}`).toBe(val(`${col(ti)}${30 + i}`));
        expect(legs[t.id], `úsek ${i} ${t.name}`).toBe(val(`${col(ti)}${44 + i}`));
      });
    }
  });
});

describe('GPX', () => {
  it('všech 10 předávek leží na trase do 25 m a pořadí je rostoucí', () => {
    const track = parseGpx(fs.readFileSync('data/2026/trasa-2026.gpx', 'utf8'));
    expect(track[track.length - 1].km).toBeGreaterThan(155);
    const pts = [race.legs[0].gpsStart, ...race.legs.map((l) => l.gpsEnd)];
    const { idx, distM } = locateHandovers(track, pts);
    distM.forEach((d) => expect(d).toBeLessThan(25));
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThan(idx[i - 1]);
  });
});

describe('predikce a validace', () => {
  it('predikce = poslední zápis + plán zbývajících úseků', () => {
    const t = race.teams.find((x) => x.name === '8aD');
    const ent = entriesFromScenario(race, 12 * 60 + 50)['8aD']; // po 4. předávce (12:43)
    const st = teamState(t, ent, 13 * 60);
    expect(st.k).toBe(4);
    expect(st.predicted[5]).toBe(ent[4] + Math.round(0) + t.legs[4].planMin);
    expect(st.gap).toBeCloseTo(ent[4] - ent[0] - t.legs.slice(0, 4).reduce((a, l) => a + l.planMin, 0), 6);
  });
  it('živé pořadí vrací všechny týmy', () => {
    const r = liveRanking(race, entriesFromScenario(race, 13 * 60), 13 * 60);
    expect(r).toHaveLength(7);
  });
  it('validace: formát, pořadí, budoucnost, překlep v hodinách', () => {
    expect(validateEntry('abc').ok).toBe(false);
    expect(validateEntry('25:00').ok).toBe(false);
    expect(validateEntry('7:00', { prev: 8 * 60, now: 9 * 60 }).ok).toBe(false);
    expect(validateEntry('15:00', { now: 14 * 60 }).ok).toBe(false);
    const v = validateEntry('22:50', { predicted: 14 * 60 + 50, now: 23 * 60 });
    expect(v.ok).toBe(false);
    expect(v.suggestion).toBe(14 * 60 + 50);
    expect(validateEntry('14:52', { predicted: 14 * 60 + 50, now: 15 * 60 }).ok).toBe(true);
    expect(parseHHMM('7.06')).toBe(426);
    expect(fmtHHMM(426)).toBe('7:06');
  });
});

describe('export', () => {
  it('zapíše skutečné časy do původního Excelu', async () => {
    const entries = entriesFromScenario(race);
    entries['8aD'][5] += 3; for (let i = 6; i <= 9; i++) entries['8aD'][i] += 3;
    const out = await exportWorkbook(xlsx, race, entries);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(out);
    const ws = wb.getWorksheet('8aD');
    const t = race.teams.find((x) => x.name === '8aD');
    expect(ws.getCell(`R${t._rows.hr + 5}`).value).toBe(entries['8aD'][5] - entries['8aD'][4]);
    expect(wb.getWorksheet('SOUHRN')).toBeTruthy();
  });
});

import { racePhase, daysUntil } from '../src/domain/phase.js';
import { pointLabel, pointShort, pointTitle } from '../src/domain/time.js';
describe('fáze závodu a názvy bodů', () => {
  const d = (s) => new Date(s);
  it('racePhase', () => {
    expect(racePhase('2026-04-25', d('2026-04-20T10:00:00+02:00'), false)).toBe('before');
    expect(racePhase('2026-04-25', d('2026-04-25T12:00:00+02:00'), false)).toBe('live');
    expect(racePhase('2026-04-25', d('2026-04-30T12:00:00+02:00'), false)).toBe('after');
    expect(racePhase('2026-04-25', d('2026-04-20T10:00:00+02:00'), true)).toBe('live');
    expect(daysUntil('2026-04-25', d('2026-04-20T10:00:00+02:00'))).toBe(5);
  });
  it('pointLabel', () => {
    expect([pointLabel(0), pointLabel(3), pointLabel(9)]).toEqual(['Start', 'Předávka 3', 'Cíl']);
    expect([pointShort(0), pointShort(3), pointShort(9)]).toEqual(['Start', 'P3', 'Cíl']);
    expect(pointTitle(3)).toBe('Předávka 3 · konec úseku 3');
  });
});

import { resolveClock } from '../src/domain/time.js';
describe('přechod přes půlnoc', () => {
  it('menší čas než předchozí = další den', () => {
    expect(resolveClock('0:25', { prev: 23 * 60 + 40 })).toBe(1465);
    expect(resolveClock('15:00', { prev: 14 * 60 })).toBe(900);
    expect(resolveClock('0:05', { planStart: 23 * 60 + 50 })).toBe(1445);
  });
  it('délka úseku 0,3× až 3× plán', () => {
    const base = { prev: 23 * 60 + 40, planLeg: 60, now: 1600, predicted: 1465 };
    expect(validateEntry('0:25', base).ok).toBe(true);
    expect(validateEntry('0:25', base).nextDay).toBe(true);
    expect(validateEntry('23:45', base).ok).toBe(false);  // 5 min < 0,3× plán
    expect(validateEntry('4:00', base).ok).toBe(false);   // 4 h 20 > 3× plán
  });
});

import { unwrapDays } from '../src/domain/excel.js';
describe('Excel po půlnoci', () => {
  it('hodiny po půlnoci se rozbalí na další den', () => {
    expect(unwrapDays([22 * 60, 23 * 60 + 30, 40, 100])).toEqual([1320, 1410, 1480, 1540]);
    expect(unwrapDays([300, 400, 500])).toEqual([300, 400, 500]);
  });
});

import { raceComment } from '../src/domain/comment.js';
describe('slovní hodnocení', () => {
  it('jedna věta o plánu pro tým i celý závod', () => {
    const entries = entriesFromScenario(race);
    const all = raceComment(race, entries);
    const mine = raceComment(race, entries, race.teams[0].id);
    expect(all).toMatch(/^Závod dokončilo 7 týmů/);
    expect(mine).toMatch(/^Doběhli jste na \d+\. místě/);
    expect(mine).toMatch(/Nejlépe jste stáli na \d+\. místě po \d\. úseku/);
    expect(mine).toMatch(/dvojice/);
    for (const other of race.teams.slice(1)) expect(mine).not.toContain(other.name); // jiné týmy se nekomentují
    expect(raceComment(race, {})).toBe('');
  });
});
