// Čas závodu = minuty od půlnoci (celé minuty, jako HH:MM v Excelu).

export function parseHHMM(text) {
  const m = String(text ?? '').trim().match(/^(\d{1,2})\s*[:.]\s*(\d{2})$/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

export function fmtHHMM(min) {
  if (min == null || Number.isNaN(min)) return '–';
  const t = Math.round(min);
  const h = Math.floor(t / 60) % 24, m = ((t % 60) + 60) % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

// Doba trvání: 7:13 (h:mm)
export function fmtDur(min) {
  if (min == null || Number.isNaN(min)) return '–';
  const t = Math.round(Math.abs(min));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export function fmtGap(min) {
  if (min == null || Number.isNaN(min)) return '–';
  const r = Math.round(min);
  return r === 0 ? '0′' : `${r > 0 ? '+' : '−'}${Math.abs(r)}′`;
}

export function nowMinutes(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

// Pokus o opravu překlepu v hodinách: vrátí čas nejblíž predikci, jen když je blízko (<= 30 min).
export function suggestFix(entered, predicted) {
  if (predicted == null) return null;
  let best = null;
  for (let k = -12; k <= 12; k++) {
    const c = entered + 60 * k;
    if (c < 0 || c >= 1440) continue;
    if (best == null || Math.abs(c - predicted) < Math.abs(best - predicted)) best = c;
  }
  return best != null && best !== entered && Math.abs(best - predicted) <= 30 ? best : null;
}

/**
 * Validace ručně zadaného času předávky.
 * ctx: { prev, next, predicted, now, isAdmin }  (minuty nebo null)
 * Vrací { ok, minutes, errors[], warnings[], suggestion }.
 */
export function validateEntry(text, ctx = {}) {
  const minutes = parseHHMM(text);
  const out = { ok: false, minutes, errors: [], warnings: [], suggestion: null };
  if (minutes == null) {
    out.errors.push('Zadej čas ve tvaru HH:MM, např. 14:50.');
    return out;
  }
  const { prev = null, next = null, predicted = null, now = null, isAdmin = false } = ctx;
  if (prev != null && minutes <= prev) out.errors.push(`Čas musí být po předchozí předávce (${fmtHHMM(prev)}).`);
  if (next != null && minutes >= next) out.errors.push(`Čas musí být před další zapsanou předávkou (${fmtHHMM(next)}).`);
  if (!isAdmin && now != null && minutes > now + 2) out.errors.push(`Čas je v budoucnosti (teď je ${fmtHHMM(now)}).`);
  if (predicted != null) {
    const d = minutes - predicted;
    if (Math.abs(d) > 45) {
      const hrs = Math.round(Math.abs(d) / 60);
      const msg = `Čas je o ${Math.abs(d) >= 90 ? hrs + ' h' : Math.round(Math.abs(d)) + ' min'} ${d > 0 ? 'později' : 'dříve'} než predikce (${fmtHHMM(predicted)}).`;
      (Math.abs(d) > 180 ? out.errors : out.warnings).push(msg);
      out.suggestion = suggestFix(minutes, predicted);
    }
  }
  out.ok = out.errors.length === 0;
  return out;
}

export function competitionRank(values) {
  // values: [{id, v}] -> { id: rank }, shodné hodnoty mají shodné pořadí (jako RANK v Excelu)
  const sorted = [...values].filter((x) => x.v != null).sort((a, b) => a.v - b.v);
  const ranks = {};
  sorted.forEach((x, i) => {
    ranks[x.id] = i > 0 && Math.abs(sorted[i - 1].v - x.v) < 1e-9 ? ranks[sorted[i - 1].id] : i + 1;
  });
  return ranks;
}

// Názvy bodů závodu na jednom místě: 0 = start, 1–8 = předávky, 9 = cíl
export const pointLabel = (i) => (i === 0 ? 'Start' : i === 9 ? 'Cíl' : `Předávka ${i}`);
export const pointShort = (i) => (i === 0 ? 'Start' : i === 9 ? 'Cíl' : `P${i}`);
export const pointTitle = (i) => (i === 0 ? 'Start týmu' : i === 9 ? 'Cíl · konec úseku 9' : `Předávka ${i} · konec úseku ${i}`);

/** Tempo v min:vt na kilometr (z minut na km). */
export const paceTxt = (minPerKm) => { const sec = Math.round(minPerKm * 60); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
