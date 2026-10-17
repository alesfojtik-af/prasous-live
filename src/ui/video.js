/* Video závodu (soubor): čtyři scény nakreslené na plátno podle vzhledu aplikace (Živě se starty, Mapa se zrychleným pohybem týmů, Úseky, závěrečná karta s gratulací). Celé 30–60 s, nahrává se v reálném čase přes MediaRecorder. */
import { buildRows } from './derive.js';
import { latLonAt } from './ctx.jsx';
import { legMinutes, legRanking, rankingAtPoint, netAt } from '../domain/calc.js';
import { fmtHHMM, fmtDur, fmtGap } from '../domain/time.js';
import { CONGRATS, raceComment } from '../domain/comment.js';
import { wrapLines } from './share.js';

const W = 720, H = 1280, HEAD = 175, TABS = 90;
const SCENES = [['live', 9], ['map', 26], ['legs', 10], ['end', 10]]; // název, délka v sekundách (součet 55 s)
const TAB_NAMES = ['Živě', 'Mapa', 'Úseky', 'Týmy'];

const loadImage = (src, cors) => new Promise((res) => {
  const i = new Image(); if (cors) i.crossOrigin = 'anonymous';
  const timer = setTimeout(() => res(null), 5000);
  i.onload = () => { clearTimeout(timer); res(i); }; i.onerror = () => { clearTimeout(timer); res(null); }; i.src = src;
});

function pickMime() {
  return ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
}

/** Čas od prvního startu do posledního cíle (minuty závodu). */
export function raceSpan(race, entries) {
  const all = race.teams.flatMap((t) => entries[t.id] || []).filter((m) => m != null);
  return all.length ? [Math.min(...all), Math.max(...all)] : null;
}

const font = (w, px, fam = 'Figtree') => `${w} ${px}px ${fam}, system-ui, sans-serif`;
const poppins = (px) => font(800, px, 'Poppins');
const mono = (px) => `700 ${px}px "JetBrains Mono", ui-monospace, monospace`;
const lerp = (a, b, p) => a + (b - a) * Math.min(1, Math.max(0, p));

function clip(g, text, maxW) {
  let t = String(text);
  while (g.measureText(t).width > maxW && t.length > 3) t = t.slice(0, -2);
  return t === String(text) ? t : `${t}…`;
}

function chrome(g, env, tab) {
  g.fillStyle = '#F5F4F1'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, HEAD - 6);
  g.fillStyle = '#CC0000'; g.fillRect(0, HEAD - 6, W, 6);
  if (env.logo) g.drawImage(env.logo, 30, 24, 300, 300 * (env.logo.height / env.logo.width));
  g.fillStyle = '#CC0000'; g.beginPath(); g.roundRect(W - 190, 40, 160, 70, 14); g.fill();
  g.fillStyle = '#fff'; g.font = poppins(44); g.textAlign = 'center'; g.fillText(String(env.settings.year), W - 110, 91); g.textAlign = 'left';
  if (tab == null) return;
  g.fillStyle = '#fff'; g.fillRect(0, H - TABS, W, TABS); g.fillStyle = '#E4E0DB'; g.fillRect(0, H - TABS, W, 2);
  TAB_NAMES.forEach((n, i) => {
    g.textAlign = 'center'; g.fillStyle = i === tab ? '#CC0000' : '#6A645E'; g.font = font(i === tab ? 800 : 600, 26);
    g.fillText(n, W / 8 + i * (W / 4) * 1, H - 34);
    if (i === tab) { g.fillRect(i * (W / 4) + 30, H - TABS, W / 4 - 60, 6); }
  });
  g.textAlign = 'left';
}

function teamRow(g, r, y, h, { focus, right, sub, progress }) {
  const mine = r.team.id === focus;
  g.fillStyle = mine ? '#FFF3D1' : '#fff'; g.beginPath(); g.roundRect(24, y, W - 48, h - 8, 14); g.fill();
  if (mine) { g.strokeStyle = '#FFC23D'; g.lineWidth = 4; g.stroke(); }
  g.fillStyle = '#CC0000'; g.font = poppins(32); g.fillText(`${r.rank ?? '–'}`, 40, y + h / 2 + 8);
  g.font = '32px system-ui, sans-serif'; g.fillStyle = '#000'; g.fillText(r.look.emoji, 92, y + h / 2 + 10);
  g.fillStyle = '#141414'; g.font = font(700, 28); g.fillText(clip(g, r.team.name, 360), 140, y + h / 2 - (sub ? 10 : -8));
  if (sub) { g.fillStyle = '#6A645E'; g.font = font(500, 21); g.fillText(sub, 140, y + h / 2 + 14); }
  if (progress != null) {
    g.fillStyle = '#E4E0DB'; g.beginPath(); g.roundRect(140, y + h - 20, W - 300, 7, 3); g.fill();
    g.fillStyle = r.look.color; g.beginPath(); g.roundRect(140, y + h - 20, Math.max(7, (W - 300) * Math.min(1, progress)), 7, 3); g.fill();
  }
  if (right) { g.textAlign = 'right'; g.fillStyle = '#141414'; g.font = mono(30); g.fillText(right, W - 40, y + h / 2 + 10); g.textAlign = 'left'; }
}

// ---------- scéna 1: Živě, starty týmů ----------
function sceneLive(g, env, p) {
  const { race, entries, settings, focus } = env;
  const starts = race.teams.map((t) => entries[t.id]?.[0]).filter((m) => m != null);
  const T = lerp(Math.min(...starts) - 8, Math.max(...starts) + 12, p);
  chrome(g, env, 0);
  g.fillStyle = '#141414'; g.font = mono(84); g.fillText(fmtHHMM(T), 30, HEAD + 100);
  g.fillStyle = '#CC0000'; g.font = font(800, 28); g.fillText('ŽIVĚ · starty týmů', 30, HEAD + 150);
  const rows = buildRows(race, entries, T, settings);
  const h = Math.min(92, (H - TABS - HEAD - 190) / Math.max(1, rows.length));
  rows.forEach((r, i) => {
    const st = entries[r.team.id]?.[0];
    teamRow(g, r, HEAD + 175 + i * h, h, { focus, right: st != null && T >= st ? fmtHHMM(st) : '', sub: st != null && T >= st ? 'vyběhli' : 'čeká na start', progress: r.progress });
  });
}

// ---------- scéna 2: mapa ----------
const mercX = (lon) => ((lon + 180) / 360) * 256;
const mercY = (lat) => { const s = Math.sin((lat * Math.PI) / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256; };

/** Připraví podkladovou mapu (OpenStreetMap, když se dlaždice podaří stáhnout) a převod souřadnic na pixely. */
async function buildMap(prep, area) {
  const lats = prep.track.map((q) => q.lat), lons = prep.track.map((q) => q.lon);
  const x0 = mercX(Math.min(...lons)), x1 = mercX(Math.max(...lons)), y1 = mercY(Math.min(...lats)), y0 = mercY(Math.max(...lats));
  const zfit = Math.log2(Math.min((area.w - 70) / (x1 - x0), (area.h - 70) / (y1 - y0)));
  const k = 2 ** zfit, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const project = (lat, lon) => [area.x + area.w / 2 + (mercX(lon) - cx) * k, area.y + area.h / 2 + (mercY(lat) - cy) * k];
  const bg = document.createElement('canvas'); bg.width = W; bg.height = H;
  const g = bg.getContext('2d');
  g.fillStyle = '#E9E5DF'; g.fillRect(area.x, area.y, area.w, area.h);
  const z = Math.min(15, Math.ceil(zfit)), n = 2 ** z;
  const wx0 = cx - area.w / 2 / k, wx1 = cx + area.w / 2 / k, wy0 = cy - area.h / 2 / k, wy1 = cy + area.h / 2 / k;
  const tx0 = Math.floor((wx0 / 256) * n), tx1 = Math.floor((wx1 / 256) * n), ty0 = Math.floor((wy0 / 256) * n), ty1 = Math.floor((wy1 / 256) * n);
  const jobs = [];
  for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) jobs.push([tx, ty]);
  if (jobs.length <= 60) {
    const imgs = await Promise.all(jobs.map(([tx, ty]) => loadImage(`https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`, true)));
    g.save(); g.beginPath(); g.rect(area.x, area.y, area.w, area.h); g.clip();
    jobs.forEach(([tx, ty], i) => {
      if (!imgs[i]) return;
      const sx = area.x + area.w / 2 + ((tx * 256) / n - cx) * k, sy = area.y + area.h / 2 + ((ty * 256) / n - cy) * k;
      g.drawImage(imgs[i], sx, sy, (256 / n) * k + 0.5, (256 / n) * k + 0.5);
    });
    g.restore();
  }
  return { bg, project, area };
}

function sceneMap(g, env, p) {
  const { race, entries, settings, focus, prep, map } = env;
  const t1 = race.teams.map((t) => entries[t.id]?.[1]).filter((m) => m != null), t7 = race.teams.map((t) => entries[t.id]?.[7]).filter((m) => m != null);
  const T = lerp(Math.min(...t1), Math.max(...t7), p); // od začátku 2. do konce 7. úseku
  chrome(g, env, 1);
  g.drawImage(map.bg, 0, 0);
  const { project, area } = map;
  const path = () => { g.beginPath(); prep.track.forEach((q, i) => { const [x, y] = project(q.lat, q.lon); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); };
  g.save(); g.beginPath(); g.rect(area.x, area.y, area.w, area.h); g.clip();
  g.lineJoin = 'round'; g.lineCap = 'round';
  path(); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 11; g.stroke();
  path(); g.strokeStyle = '#CC0000'; g.lineWidth = 6; g.stroke();
  prep.idx?.forEach((ix, i) => {
    const [x, y] = project(prep.track[ix].lat, prep.track[ix].lon);
    g.fillStyle = '#141414'; g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = font(800, 15); g.textAlign = 'center'; g.fillText(i === 0 ? 'S' : i === 9 ? 'C' : String(i), x, y + 5); g.textAlign = 'left';
  });
  const rows = buildRows(race, entries, T, settings);
  [...rows].reverse().forEach((r) => {
    const pos = latLonAt(prep, r.lp.leg, r.lp.p); if (!pos) return;
    const [x, y] = project(pos.lat, pos.lon), mine = r.team.id === focus, rad = mine ? 24 : 19;
    g.fillStyle = r.look.color; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    g.strokeStyle = mine ? '#FFC23D' : '#fff'; g.lineWidth = mine ? 6 : 4; g.stroke();
    g.font = `${mine ? 26 : 21}px system-ui, sans-serif`; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(r.look.emoji, x, y + (mine ? 9 : 7)); g.textAlign = 'left';
  });
  g.restore();
  g.fillStyle = 'rgba(255,255,255,.92)'; g.beginPath(); g.roundRect(area.x + 12, area.y + 12, 210, 70, 14); g.fill();
  g.fillStyle = '#141414'; g.font = mono(48); g.fillText(fmtHHMM(T), area.x + 24, area.y + 62);
  // pořadí pod mapou
  const top = area.y + area.h + 10, h = Math.min(40, (H - TABS - top - 8) / Math.max(1, rows.length));
  rows.forEach((r, i) => {
    const y = top + i * h, mine = r.team.id === focus;
    g.fillStyle = mine ? '#FFF3D1' : '#fff'; g.beginPath(); g.roundRect(24, y, W - 48, h - 4, 8); g.fill();
    g.fillStyle = '#CC0000'; g.font = poppins(20); g.fillText(`${r.rank}.`, 36, y + h / 2 + 6);
    g.font = '20px system-ui, sans-serif'; g.fillStyle = '#000'; g.fillText(r.look.emoji, 76, y + h / 2 + 7);
    g.fillStyle = '#141414'; g.font = font(700, 20); g.fillText(clip(g, r.team.name, 360), 110, y + h / 2 + 7);
    g.textAlign = 'right'; g.font = mono(20); g.fillText(`${r.km.toFixed(1).replace('.', ',')} km`, W - 38, y + h / 2 + 7); g.textAlign = 'left';
  });
}

// ---------- scéna 3: záložka Úseky ----------
function sceneLegs(g, env, p) {
  const { race, entries, settings, focus } = env;
  const leg = p < 0.5 ? 5 : 9, L = race.legs[leg - 1];
  chrome(g, env, 2);
  g.fillStyle = '#141414'; g.font = poppins(34); g.fillText(`Úsek ${leg}`, 30, HEAD + 60);
  g.fillStyle = '#6A645E'; g.font = font(600, 24); g.fillText(clip(g, `${L.from} → ${L.to} · ${L.km.toFixed(1).replace('.', ',')} km`, W - 60), 30, HEAD + 98);
  const legRank = legRanking(race, entries, leg), after = rankingAtPoint(race, entries, leg);
  const mins = race.teams.map((t) => legMinutes(entries[t.id], leg)).filter((m) => m != null), nets = race.teams.map((t) => netAt(entries[t.id], leg)).filter((m) => m != null);
  const bestLeg = Math.min(...mins), bestNet = Math.min(...nets);
  const rows = buildRows(race, entries, 1e9, settings).map((r) => ({ ...r, m: legMinutes(entries[r.team.id], leg), net: netAt(entries[r.team.id], leg) })).sort((a, b) => (a.net ?? 1e9) - (b.net ?? 1e9));
  const top = HEAD + 125;
  g.fillStyle = '#6A645E'; g.font = font(700, 15);
  [['Tým', 24], ['Úsek', 340], ['Čas', 412], ['Ztráta', 500], ['Celk.', 596], ['Odstup', 650]].forEach(([t, x]) => g.fillText(t.toUpperCase(), x, top));
  const h = Math.min(86, (H - TABS - top - 20) / Math.max(1, rows.length));
  rows.forEach((r, i) => {
    const y = top + 14 + i * h, mine = r.team.id === focus;
    g.fillStyle = mine ? '#FFF3D1' : '#fff'; g.beginPath(); g.roundRect(16, y, W - 32, h - 6, 12); g.fill();
    g.font = '28px system-ui, sans-serif'; g.fillStyle = '#000'; g.fillText(r.look.emoji, 26, y + h / 2 + 8);
    g.fillStyle = '#141414'; g.font = font(700, 22); g.fillText(clip(g, r.team.name, 220), 68, y + h / 2 + 8);
    g.font = poppins(24); g.fillText(`${legRank[r.team.id] ?? '–'}`, 350, y + h / 2 + 8);
    if (r.m === bestLeg) { g.fillStyle = '#FFE9A8'; g.beginPath(); g.roundRect(404, y + 8, 84, h - 22, 8); g.fill(); }
    g.fillStyle = '#141414'; g.font = mono(24); g.fillText(r.m != null ? fmtDur(r.m) : '–', 412, y + h / 2 + 8);
    g.font = mono(22); g.fillText(r.m != null ? fmtGap(r.m - bestLeg) : '–', 504, y + h / 2 + 8);
    g.font = poppins(24); g.fillText(`${r.net != null ? after[r.team.id] : '–'}`, 600, y + h / 2 + 8);
    g.font = mono(22); g.fillText(r.net != null ? fmtGap(r.net - bestNet) : '–', 652, y + h / 2 + 8);
  });
}

// ---------- scéna 4: závěr ----------
function sceneEnd(g, env) {
  const { race, entries, settings, focus, endCanvas } = env;
  chrome(g, env, endCanvas ? 3 : null);
  if (endCanvas) { // karta týmu (včetně gratulace a hodnocení)
    const hgt = Math.min(H - TABS - HEAD - 10, W * (endCanvas.height / endCanvas.width));
    g.drawImage(endCanvas, (W - hgt * (endCanvas.width / endCanvas.height)) / 2, HEAD + 4, hgt * (endCanvas.width / endCanvas.height), hgt);
    return;
  }
  g.fillStyle = '#FFC23D'; g.beginPath(); g.roundRect(24, HEAD + 16, W - 48, 230, 20); g.fill();
  g.fillStyle = '#141414'; g.font = poppins(42); g.fillText(CONGRATS, 44, HEAD + 72);
  g.font = font(500, 26); wrapLines(g, raceComment(race, entries), W - 90).slice(0, 4).forEach((l, i) => g.fillText(l, 44, HEAD + 118 + i * 36));
  const rows = buildRows(race, entries, 1e9, settings);
  const h = Math.min(84, (H - HEAD - 280) / Math.max(1, rows.length));
  rows.forEach((r, i) => teamRow(g, r, HEAD + 262 + i * h, h, { focus, right: fmtDur(r.st.projectedNet) }));
}

/**
 * Nahraje video závodu a vrátí { blob, ext }. onProgress(0..1).
 * focusTeam zvýrazní tým, endCanvas (karta týmu) nahradí závěrečné výsledky. Nic se neposílá do databáze.
 */
export async function recordRaceVideo({ race, entries, prep, settings, focusTeam = null, endCanvas = null }, onProgress = () => {}) {
  if (!raceSpan(race, entries)) throw new Error('Nejsou žádné zapsané časy.');
  if (!window.MediaRecorder) throw new Error('Tento prohlížeč neumí nahrávat video. Použij Chrome nebo Edge na počítači.');
  const logo = await loadImage(`${import.meta.env.BASE_URL}logo-large.png`);
  const hasMap = !!(prep?.track && prep?.idx);
  const map = hasMap ? await buildMap(prep, { x: 0, y: HEAD, w: W, h: 640 }) : null;
  const env = { race, entries, prep, settings, logo, map, focus: focusTeam, endCanvas };
  const scenes = SCENES.filter(([n]) => n !== 'map' || hasMap);
  const total = scenes.reduce((a, [, d]) => a + d, 0);
  const draw = { live: sceneLive, map: sceneMap, legs: sceneLegs, end: sceneEnd };

  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const mime = pickMime();
  const rec = new MediaRecorder(c.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: 3_000_000 } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((res) => (rec.onstop = res));
  rec.start(500);
  const started = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      const el = (performance.now() - started) / 1000;
      if (el >= total) return resolve();
      let acc = 0;
      for (const [name, dur] of scenes) {
        if (el < acc + dur) { draw[name](g, env, (el - acc) / dur); break; }
        acc += dur;
      }
      onProgress(el / total);
      requestAnimationFrame(tick);
    };
    tick();
  });
  rec.stop(); await stopped;
  return { blob: new Blob(chunks, { type: rec.mimeType || 'video/webm' }), ext: (rec.mimeType || '').includes('mp4') ? 'mp4' : 'webm' };
}
