/* Kdy je závod: před datem závodu, v den závodu (živě), nebo po něm. Řídí, co aplikace ukazuje divákům. */

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayNumber = (s) => Math.round(Date.parse(`${s}T00:00:00Z`) / 86400000);

/**
 * 'before' | 'live' | 'after' | 'unknown' (ročník bez data).
 * Živě je den závodu a časné ráno dne následujícího (do 6:00), kdyby poslední tým doběhl po půlnoci.
 * Simulace (jen v zařízení admina) se tváří vždy jako živý závod.
 */
export function racePhase(raceDate, now = new Date(), simOn = false) {
  if (simOn) return 'live';
  if (!raceDate) return 'unknown';
  const diff = dayNumber(ymd(now)) - dayNumber(raceDate);
  if (diff < 0) return 'before';
  if (diff === 0 || (diff === 1 && now.getHours() < 6)) return 'live';
  return 'after';
}

export function daysUntil(raceDate, now = new Date()) {
  return dayNumber(raceDate) - dayNumber(ymd(now));
}
