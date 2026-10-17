/* Video závodu (soubor): vlastní animace na plátně (výškový profil s týmy + pořadí), celé 30–60 s (rychlost se přizpůsobí délce závodu), na konci výsledky. Nahrává se v reálném čase přes MediaRecorder. */
import { buildRows, totalKm } from './derive.js';
import { fmtHHMM, fmtDur } from '../domain/time.js';

const W = 720, H = 1280, END_SCREEN_SEC = 6, MIN_TOTAL_SEC = 30, MAX_TOTAL_SEC = 60; // celé video 30–60 s

function loadLogo() {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = `${import.meta.env.BASE_URL}logo-large.png`; });
}

function pickMime() {
  const list = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return list.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
}

/** Čas od prvního startu do posledního cíle (minuty závodu). */
export function raceSpan(race, entries) {
  const all = race.teams.flatMap((t) => entries[t.id] || []).filter((m) => m != null);
  return all.length ? [Math.min(...all), Math.max(...all)] : null;
}

function drawFrame(g, logo, { race, entries, prep, settings, T, final }) {
  const total = totalKm(race);
  g.fillStyle = '#F5F4F1'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, 170);
  g.fillStyle = '#CC0000'; g.fillRect(0, 168, W, 6);
  if (logo) g.drawImage(logo, 30, 24, 300, 300 * (logo.height / logo.width));
  g.fillStyle = '#CC0000'; g.beginPath(); g.roundRect(W - 190, 40, 160, 70, 14); g.fill();
  g.fillStyle = '#fff'; g.font = '800 44px Poppins, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(String(settings.year), W - 110, 91);
  g.textAlign = 'left';
  const rows = buildRows(race, entries, T, settings);

  if (!final) {
    g.fillStyle = '#141414'; g.font = '800 96px "JetBrains Mono", ui-monospace, monospace'; g.fillText(fmtHHMM(T), 30, 300);
    // profil trati s týmy
    const prof = prep?.profile, x0 = 30, x1 = W - 30, yb = 560, yt = 360;
    if (prof?.length) {
      const min = Math.min(...prof.map((p) => p.ele)), max = Math.max(...prof.map((p) => p.ele)), pt = prof[prof.length - 1].km;
      const px = (km) => x0 + (km / pt) * (x1 - x0), py = (e) => yb - ((e - min) / Math.max(1, max - min)) * (yb - yt);
      g.lineWidth = 5; g.lineJoin = 'round'; g.strokeStyle = '#141414'; g.beginPath();
      prof.forEach((p, i) => (i ? g.lineTo(px(p.km), py(p.ele)) : g.moveTo(px(p.km), py(p.ele)))); g.stroke();
      const eleAt = (km) => { const q = prof.find((p) => p.km >= km) || prof[prof.length - 1]; return q.ele; };
      [...rows].reverse().forEach((r) => {
        const km = (r.km / total) * pt;
        g.fillStyle = r.look.color; g.beginPath(); g.arc(px(km), py(eleAt(km)) - 10, 14, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke();
      });
    }
    const rowH = Math.min(86, 640 / Math.max(1, rows.length));
    rows.forEach((r, i) => {
      const y = 630 + i * rowH;
      g.fillStyle = '#fff'; g.beginPath(); g.roundRect(30, y, W - 60, rowH - 10, 14); g.fill();
      g.fillStyle = '#CC0000'; g.font = '800 34px Poppins, system-ui, sans-serif'; g.fillText(`${r.rank}.`, 46, y + rowH / 2 + 8);
      g.font = '34px system-ui, sans-serif'; g.fillStyle = '#000'; g.fillText(r.look.emoji, 110, y + rowH / 2 + 10);
      g.fillStyle = '#141414'; g.font = '700 28px Figtree, system-ui, sans-serif'; g.fillText(r.team.name.slice(0, 22), 160, y + rowH / 2 - 2);
      g.fillStyle = '#E4E0DB'; g.beginPath(); g.roundRect(160, y + rowH / 2 + 6, W - 260, 12, 6); g.fill();
      g.fillStyle = r.look.color; g.beginPath(); g.roundRect(160, y + rowH / 2 + 6, Math.max(12, (W - 260) * Math.min(1, r.progress)), 12, 6); g.fill();
    });
  } else {
    g.fillStyle = '#141414'; g.font = '800 54px Poppins, system-ui, sans-serif'; g.fillText('Konečné výsledky', 30, 270);
    const rowH = Math.min(100, 840 / Math.max(1, rows.length));
    rows.forEach((r, i) => {
      const y = 320 + i * rowH;
      g.fillStyle = i === 0 ? '#FFC23D' : '#fff'; g.beginPath(); g.roundRect(30, y, W - 60, rowH - 10, 14); g.fill();
      g.fillStyle = '#CC0000'; g.font = '800 40px Poppins, system-ui, sans-serif'; g.fillText(`${r.rank}.`, 46, y + rowH / 2 + 12);
      g.font = '40px system-ui, sans-serif'; g.fillStyle = '#000'; g.fillText(r.look.emoji, 120, y + rowH / 2 + 14);
      g.fillStyle = '#141414'; g.font = '700 32px Figtree, system-ui, sans-serif'; g.fillText(r.team.name.slice(0, 20), 185, y + rowH / 2 + 10);
      g.textAlign = 'right'; g.font = '700 32px "JetBrains Mono", ui-monospace, monospace'; g.fillText(fmtDur(r.st.projectedNet), W - 46, y + rowH / 2 + 10); g.textAlign = 'left';
    });
  }
}

/**
 * Nahraje video celého závodu a vrátí Blob (+ příponu). onProgress(0..1). Obsah je jen kreslený z dat, žádné mapové dlaždice.
 */
export async function recordRaceVideo({ race, entries, prep, settings }, onProgress = () => {}) {
  const span = raceSpan(race, entries);
  if (!span) throw new Error('Nejsou žádné zapsané časy.');
  if (!window.MediaRecorder) throw new Error('Tento prohlížeč neumí nahrávat video. Použij Chrome nebo Edge na počítači.');
  const [t0, t1] = span, logo = await loadLogo();
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const mime = pickMime();
  const rec = new MediaRecorder(c.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: 3_000_000 } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((res) => (rec.onstop = res));
  const hours = Math.max(0.01, (t1 - t0) / 60);
  const playSec = Math.min(MAX_TOTAL_SEC, Math.max(MIN_TOTAL_SEC, hours * 10 + END_SCREEN_SEC)) - END_SCREEN_SEC, totalSec = playSec + END_SCREEN_SEC;
  const secPerHour = playSec / hours;
  rec.start(500);
  const started = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      const el = (performance.now() - started) / 1000;
      if (el >= totalSec) return resolve();
      const final = el >= playSec;
      drawFrame(g, logo, { race, entries, prep, settings, T: final ? t1 : t0 + (el / secPerHour) * 60, final });
      onProgress(el / totalSec);
      requestAnimationFrame(tick);
    };
    tick();
  });
  rec.stop(); await stopped;
  return { blob: new Blob(chunks, { type: rec.mimeType || 'video/webm' }), ext: (rec.mimeType || '').includes('mp4') ? 'mp4' : 'webm' };
}
