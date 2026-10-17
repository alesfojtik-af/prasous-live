import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { parseGpx, locateHandovers, pointBetween, elevationProfile } from '../domain/gpx.js';
import { nowMinutes } from '../domain/time.js';

export const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function useStoreState(store) {
  return useSyncExternalStore(store.subscribe, store.getState);
}

/** Aktuální čas závodu: reálný čas, nebo simulovaný (admin spustil simulaci). */
export function useNow(s) {
  const [real, setReal] = useState(nowMinutes());
  useEffect(() => { const id = setInterval(() => setReal(nowMinutes()), 15000); return () => clearInterval(id); }, []);
  return s.settings?.sim?.on ? s.settings.sim.now : real;
}

/** Trasa z GPX, umístění předávek na ní a výškový profil. */
export function usePrepared(s) {
  // klíč podle obsahu: data se při každé synchronizaci načítají znovu, trasa se ale přepočítá jen při skutečné změně
  const key = s.race ? JSON.stringify(s.race.legs.map((l) => [l.gpsStart, l.gpsEnd])) : '';
  return useMemo(() => {
    if (!s.race || !s.gpx) return null;
    try {
      const track = parseGpx(s.gpx);
      const legs = s.race.legs;
      const pts = [legs[0].gpsStart, ...legs.map((l) => l.gpsEnd)];
      if (pts.some((p) => !p)) return { track, idx: null, profile: elevationProfile(track), total: track[track.length - 1].km };
      const { idx, distM } = locateHandovers(track, pts);
      return { track, idx, distM, profile: elevationProfile(track), total: track[track.length - 1].km };
    } catch (e) { return { error: e.message }; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.gpx, key]);
}

/** Poloha {lat,lon} týmu na trase: leg 0 = start, 10 = cíl. */
export function latLonAt(prep, leg, p) {
  if (!prep?.idx) return null;
  const { track, idx } = prep;
  if (leg <= 0) return track[idx[0]];
  if (leg >= 10) return track[idx[9]];
  return pointBetween(track, idx[leg - 1], idx[leg], p);
}

const PALETTE = [
  ['🐝', '#E6A100'], ['🎭', '#7B3FA0'], ['🎯', '#CC0000'], ['🚜', '#2E7D32'], ['🛠️', '#546E7A'],
  ['🚨', '#D32F2F'], ['🔦', '#0277BD'], ['🦊', '#EF6C00'], ['🐢', '#00796B'], ['🚀', '#5D4037'],
];
export function lookOf(settings, team, i) {
  const o = settings.looks?.[team.id];
  const [emoji, color] = PALETTE[i % PALETTE.length];
  return { emoji: o?.emoji || emoji, color: o?.color || color };
}
export const PALETTE_COLORS = PALETTE.map((p) => p[1]);

export const hashGo = (path) => { location.hash = path; };
