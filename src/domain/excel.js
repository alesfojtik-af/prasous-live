/* Import a export Excelu ve formátu 8aD (první list = trasa, list na tým). Sloupce se hledají podle textu hlavičky; export zachová vzorce. */
import ExcelJS from 'exceljs';
import { parseGps } from './gpx.js';

/* Import a export Excelu PraSouš (formát podle listu 8aD, viz docs/datovy-model.md). */

const LEG_COUNT = 9;

function raw(cell) {
  let v = cell?.value;
  if (v && typeof v === 'object' && 'result' in v) v = v.result;       // vzorec -> uložená hodnota
  if (v && typeof v === 'object' && 'text' in v) v = v.text;           // odkaz / rich text
  if (v && typeof v === 'object' && Array.isArray(v.richText)) v = v.richText.map((r) => r.text).join('');
  return v ?? null;
}
const str = (cell) => { const v = raw(cell); return v == null ? null : String(v).trim(); };
const link = (cell) => {
  const v = cell?.value;
  if (v && typeof v === 'object' && v.hyperlink) return v.hyperlink;
  const s = str(cell);
  return s && /^https?:/.test(s) ? s : null;
};
const num = (cell) => { const v = raw(cell); return typeof v === 'number' && Number.isFinite(v) ? v : null; };
/** Čas z buňky -> minuty od půlnoci (zaokrouhleno na minutu jako HH:MM v Excelu). */
function clock(cell) {
  const v = raw(cell);
  if (v instanceof Date) return v.getUTCHours() * 60 + v.getUTCMinutes();
  if (typeof v === 'number' && v >= 0 && v < 1) return Math.round(v * 1440);
  return null;
}

function findRow(ws, col, text, from = 1, to = 60) {
  for (let r = from; r <= to; r++) if (str(ws.getCell(r, col)) === text) return r;
  return null;
}
function findCol(ws, row, ...labels) {
  for (let c = 1; c <= 40; c++) {
    const s = str(ws.getCell(row, c));
    if (s && labels.some((l) => s.toLowerCase().startsWith(l.toLowerCase()))) return c;
  }
  return null;
}

function parseRoute(ws, report) {
  const hr = findRow(ws, 1, 'Úsek', 1, 10);
  if (!hr) throw new Error('První list: nenalezena tabulka úseků (hlavička „Úsek“).');
  const legs = [];
  for (let r = hr + 1; r <= hr + LEG_COUNT; r++) {
    const n = num(ws.getCell(r, 1));
    if (n == null) break;
    legs.push({
      n,
      from: str(ws.getCell(r, 2)),
      to: str(ws.getCell(r, 3)),
      km: num(ws.getCell(r, 4)),
      up: num(ws.getCell(r, 5)),
      down: num(ws.getCell(r, 6)),
      selfie: str(ws.getCell(r, 7)),
      navRun: link(ws.getCell(r, 8)),
      navCar: link(ws.getCell(r, 9)),
      carMin: num(ws.getCell(r, 10)),
      gpsStart: parseGps(str(ws.getCell(r, 12))),
      gpsEnd: parseGps(str(ws.getCell(r, 13))),
    });
  }
  if (legs.length !== LEG_COUNT) report.errors.push(`První list: nalezeno ${legs.length} úseků místo ${LEG_COUNT}.`);
  legs.forEach((l) => {
    if (l.km == null) report.errors.push(`Úsek ${l.n}: chybí vzdálenost.`);
    if (!l.gpsStart || !l.gpsEnd) report.warnings.push(`Úsek ${l.n}: chybí GPS souřadnice začátku nebo konce.`);
  });
  return legs;
}

function parseTeam(ws, report) {
  const name = str(ws.getCell('B2'));
  const hr = findRow(ws, 1, 'Úsek', 5, 60);
  if (!name) { report.errors.push(`List „${ws.name}“: chybí název týmu v B2.`); return null; }
  if (!hr) { report.errors.push(`List „${ws.name}“: nenalezena tabulka úseků.`); return null; }

  const cPlan = findCol(ws, hr, 'Čas běhu');                 // K
  const cAct = findCol(ws, hr, 'minut na trase');            // R
  const cSel = findCol(ws, hr, 'výběr dvojice', 'pomocne') ?? (cPlan ? cPlan - 4 : null);  // G (u většiny listů bez nadpisu)
  if (!cPlan || !cAct || !cSel) { report.errors.push(`List „${ws.name}“: v hlavičce chybí sloupec (Čas běhu / minut na trase / výběr dvojice).`); return null; }
  const cPlanStart = cPlan - 2, cActStart = cAct - 2, cActEnd = cAct - 1;
  const cPairName = cSel + 1;
  const helperLayout = (str(ws.getCell(hr, cSel)) || '').toLowerCase().startsWith('pomocne'); // list typu FAKEER

  // jména dvojic: z tabulky členů (číslo dvojice -> jména); u listu s výběrem dvojic z VLOOKUP uložená hodnota
  const pairs = {};
  const mh = findRow(ws, 2, 'číslo dvojice', 3, hr);
  if (mh) {
    const cPair = findCol(ws, mh, 'číslo dvojice'), cFirst = findCol(ws, mh, 'Jméno');
    for (let r = mh + 1; r < hr; r++) {
      const p = num(ws.getCell(r, cPair)), nm = str(ws.getCell(r, cFirst));
      if (p != null && nm) (pairs[p] ||= []).push(nm.split(/\s+/)[0]);
    }
  }

  const legs = [];
  let planStart = null;
  for (let i = 0; i < LEG_COUNT; i++) {
    const r = hr + 1 + i;
    const pairNo = num(ws.getCell(r, cSel));
    const planMin = num(ws.getCell(r, cPlan));
    if (planMin == null) report.errors.push(`List „${name}“, úsek ${i + 1}: chybí plánovaný čas (K).`);
    let pair = helperLayout ? str(ws.getCell(r, cPairName)) : (pairs[pairNo] || []).join('-');
    if (!pair) { pair = `Dvojice ${pairNo ?? '?'}`; report.warnings.push(`List „${name}“, úsek ${i + 1}: nenalezena jména dvojice.`); }
    if (i === 0) planStart = clock(ws.getCell(r, cPlanStart));
    legs.push({ n: i + 1, pair, pairNo, planMin, row: r });
  }
  if (planStart == null) report.errors.push(`List „${name}“: chybí plánovaný start.`);

  // skutečné hodnoty z Excelu = scénář pro simulaci (jen když jsou vyplněné všechny úseky)
  const start = clock(ws.getCell(hr + 1, cActStart));
  const ends = legs.map((l) => (num(ws.getCell(l.row, cAct)) != null ? clock(ws.getCell(l.row, cActEnd)) : null));
  const raw = start != null && ends.every((e) => e != null) ? [start, ...ends] : null;
  // hodiny v Excelu nemají den: čas menší než předchozí = po půlnoci
  let day = 0;
  const scenario = raw && raw.map((v, i) => { if (i && v + 1440 * day < raw[i - 1] + 1440 * day) day++; return v + 1440 * day; });
  return {
    id: ws.name, name, sheet: ws.name, planStart, legs: legs.map(({ row, ...l }) => l),
    layout: helperLayout ? 'helper' : 'standard', scenario,
    _rows: { hr, cAct, cActStart }, // pro export
  };
}

export async function parseWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const report = { errors: [], warnings: [], info: [] };
  const route = wb.worksheets[0];
  if (!route) throw new Error('Excel neobsahuje žádný list.');
  const legs = parseRoute(route, report);
  const teams = [];
  for (const ws of wb.worksheets.slice(1)) {
    if (/^souhrn$/i.test(ws.name)) continue;
    const t = parseTeam(ws, report);
    if (t) teams.push(t);
  }
  if (!teams.length) report.errors.push('Nenalezen žádný list týmu.');
  const names = teams.map((t) => t.name);
  names.forEach((n, i) => { if (names.indexOf(n) !== i) report.errors.push(`Název týmu „${n}“ se opakuje.`); });
  report.info.push(`${teams.length} týmů, ${legs.length} úseků, ${legs.reduce((a, l) => a + (l.km || 0), 0).toFixed(1)} km`);
  return { legs, teams, report };
}

/**
 * Export: původní Excel + skutečné časy z aplikace (start -> P, minuty na trase -> R).
 * entries: { teamId: [start, p1..p9] } v minutách od půlnoci.
 */
export async function exportWorkbook(buffer, race, entries) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  for (const t of race.teams) {
    const ws = wb.getWorksheet(t.sheet);
    const e = entries[t.id];
    if (!ws || !e) continue;
    const { hr, cAct, cActStart } = t._rows;
    if (e[0] != null) ws.getCell(hr + 1, cActStart).value = new Date(Date.UTC(1899, 11, 30, 0, e[0]));
    for (let i = 1; i <= LEG_COUNT; i++) {
      if (e[i] != null && e[i - 1] != null) ws.getCell(hr + i, cAct).value = e[i] - e[i - 1];
    }
  }
  wb.calcProperties.fullCalcOnLoad = true; // Excel po otevření přepočítá hodiny a GAP
  return wb.xlsx.writeBuffer();
}
