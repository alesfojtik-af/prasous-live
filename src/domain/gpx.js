/* Načtení GPX trasy, kumulativní vzdálenosti, převýšení a umístění bodů předávek na trase podle GPS z Excelu. */
const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;

export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Přečte trasu z textu GPX. Vrací body {lat, lon, ele, km} (km = kumulativní vzdálenost). */
export function parseGpx(text) {
  const pts = [];
  const re = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"\s*(?:\/>|>([\s\S]*?)<\/trkpt>)/g;
  let m;
  while ((m = re.exec(text))) {
    const ele = m[3] ? (m[3].match(/<ele>([^<]+)<\/ele>/) || [])[1] : null;
    pts.push({ lat: +m[1], lon: +m[2], ele: ele != null ? +ele : null });
  }
  if (pts.length < 2) throw new Error('GPX neobsahuje trasu (trkpt).');
  let km = 0;
  pts[0].km = 0;
  for (let i = 1; i < pts.length; i++) {
    km += haversine(pts[i - 1], pts[i]) / 1000;
    pts[i].km = km;
  }
  return pts;
}

/** Souřadnice z Excelu: "50.1373378N, 14.3948711E" */
export function parseGps(text) {
  const m = String(text ?? '').match(/(-?\d+(?:[.,]\d+)?)\s*°?\s*N?\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)\s*°?\s*E?/i);
  if (!m) return null;
  return { lat: +m[1].replace(',', '.'), lon: +m[2].replace(',', '.') };
}

/** Najde pro každý bod nejbližší index na trase (postupně dopředu). Vrací {idx[], distM[]}. */
export function locateHandovers(track, gps) {
  const idx = [], distM = [];
  let from = 0;
  gps.forEach((g, n) => {
    let best = -1, bd = Infinity;
    // poslední bod hledáme na konci trasy, aby smyčka nezpůsobila skok zpět
    const lo = n === gps.length - 1 ? Math.max(from, Math.floor(track.length * 0.9)) : from;
    for (let i = lo; i < track.length; i++) {
      const d = haversine(track[i], g);
      if (d < bd) { bd = d; best = i; }
    }
    idx.push(best);
    distM.push(bd);
    from = best;
  });
  return { idx, distM };
}

/** Poloha na trase mezi indexy i0..i1 v podílu p (0–1) podle ujeté vzdálenosti. */
export function pointBetween(track, i0, i1, p) {
  const target = track[i0].km + Math.min(1, Math.max(0, p)) * (track[i1].km - track[i0].km);
  let lo = i0, hi = i1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid].km <= target) lo = mid; else hi = mid;
  }
  const a = track[lo], b = track[Math.min(hi, track.length - 1)];
  const span = b.km - a.km || 1;
  const t = Math.min(1, Math.max(0, (target - a.km) / span));
  return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t, km: target };
}

/** Výškový profil (vyhlazený): [{km, ele}] se zhruba n vzorky. */
export function elevationProfile(track, n = 160) {
  const total = track[track.length - 1].km;
  const raw = [];
  let j = 0;
  for (let s = 0; s <= n; s++) {
    const km = (total * s) / n;
    while (j < track.length - 1 && track[j + 1].km < km) j++;
    raw.push({ km, ele: track[j].ele ?? 0 });
  }
  return raw.map((p, i) => {
    const w = raw.slice(Math.max(0, i - 2), i + 3);
    return { km: p.km, ele: w.reduce((a, b) => a + b.ele, 0) / w.length };
  });
}

/**
 * Zjednoduší trasu (Douglas–Peucker) na body vzdálené od původní čáry nejvýš tolM metrů a vrátí nový GPX text.
 * Proč: každý divák si trasu stahuje; 3 m je na mapě nepostřehnutelné a data klesnou na zlomek.
 */
export function simplifyGpx(text, tolM = 3) {
  const pts = parseGpx(text);
  const lat0 = rad(pts[0].lat);
  const xy = pts.map((p) => [rad(p.lon) * Math.cos(lat0) * R, rad(p.lat) * R]);
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = xy[a], [bx, by] = xy[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let worst = -1, wd = tolM;
    for (let i = a + 1; i < b; i++) {
      const t = len2 ? Math.max(0, Math.min(1, ((xy[i][0] - ax) * dx + (xy[i][1] - ay) * dy) / len2)) : 0;
      const d = Math.hypot(xy[i][0] - (ax + t * dx), xy[i][1] - (ay + t * dy));
      if (d > wd) { wd = d; worst = i; }
    }
    if (worst > 0) { keep[worst] = 1; stack.push([a, worst], [worst, b]); }
  }
  const body = pts.filter((_, i) => keep[i]).map((p) => `<trkpt lat="${p.lat.toFixed(5)}" lon="${p.lon.toFixed(5)}">${p.ele != null ? `<ele>${p.ele.toFixed(1)}</ele>` : ''}</trkpt>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="PraSous Live"><trk><trkseg>${body}</trkseg></trk></gpx>`;
}
