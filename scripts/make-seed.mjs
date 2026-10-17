// Vyrobí data/seed/2026.json = základ aplikace pro ročník 2026: úseky, týmy, plán, zjednodušená trasa a skutečné časy z Excelu.
// Neobsahuje e-maily ani roky narození (do balíčku jde jen to, co je veřejné). Spuštění: node scripts/make-seed.mjs
import fs from 'node:fs';
import { parseWorkbook } from '../src/domain/excel.js';
import { simplifyGpx } from '../src/domain/gpx.js';

const parsed = await parseWorkbook(fs.readFileSync('data/2026/prasous-2026.xlsx').buffer.slice(0));
const gpx = simplifyGpx(fs.readFileSync('data/2026/trasa-2026.gpx', 'utf8'));
const entries = Object.fromEntries(parsed.teams.filter((t) => t.scenario).map((t) => [t.id, t.scenario]));
const race = { legs: parsed.legs, teams: parsed.teams.map(({ _rows, ...t }) => t) };
const seed = { id: '2026', label: '2026', race_date: '2026-04-25', race, gpx, entries };
fs.writeFileSync('data/seed/2026.json', JSON.stringify(seed));
console.log('seed', (JSON.stringify(seed).length / 1024).toFixed(0), 'kB, týmů', race.teams.length, 'e-mailů', (JSON.stringify(seed).match(/@/g) || []).length);
