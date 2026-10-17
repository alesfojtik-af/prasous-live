/* Záložka Mapa: OpenStreetMap, trasa z GPX, polohy týmů a předávek; zoom zůstává, tlačítka Celá trať a Týmy. */
import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useApp, usePrepared, latLonAt, hashGo } from './ctx.jsx';
import { buildRows, totalKm } from './derive.js';
import { fmtHHMM } from '../domain/time.js';
import { downloadAllCards } from './Teams.jsx';

const RATE = 6; // minuty závodu za sekundu = 1 hodina za 10 s

export default function MapPage({ finale }) {
  const { s, now, pinned } = useApp();
  const race = s.race;
  const prep = usePrepared(s);
  const boxRef = useRef(null), mapRef = useRef(null), layers = useRef({ teams: {}, hand: [] });
  const [T, setT] = useState(null);       // null = živě
  const [playing, setPlaying] = useState(false);
  const t = T ?? now;

  const allTimes = useMemo(() => (race ? Object.values(s.entries).flat().filter((x) => x != null) : []), [race, s.entries]);
  const tMin = useMemo(() => {
    if (!race) return 0;
    const starts = race.teams.map((x) => s.entries[x.id]?.[0] ?? x.planStart);
    return Math.min(...starts) - 5;
  }, [race, s.entries]);
  const tMax = Math.max(now, ...allTimes, tMin + 60);

  const rows = useMemo(() => (race ? buildRows(race, s.entries, t, s.settings) : []), [race, s.entries, t, s.settings]);

  // mapa
  useEffect(() => {
    if (!prep?.track || !boxRef.current || mapRef.current) return;
    const map = L.map(boxRef.current, { zoomControl: true, attributionControl: true, preferCanvas: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
    const ll = prep.track.map((p) => [p.lat, p.lon]);
    L.polyline(ll, { color: '#fff', weight: 8, opacity: 0.9 }).addTo(map);
    const line = L.polyline(ll, { color: '#CC0000', weight: 5 }).addTo(map);
    map.fitBounds(line.getBounds(), { padding: [20, 20] });
    layers.current.bounds = line.getBounds();
    if (prep.idx) {
      layers.current.hand = prep.idx.map((ix, i) => L.marker([prep.track[ix].lat, prep.track[ix].lon], {
        icon: L.divIcon({ className: '', html: `<div class="hp ${i === 0 || i === 9 ? 'f' : ''}">${i === 0 ? 'S' : i === 9 ? 'C' : i}</div>`, iconSize: [20, 20], iconAnchor: [10, 10] }),
        zIndexOffset: -100,
      }).bindTooltip(i === 0 ? `Start · ${race.legs[0].from}` : race.legs[i - 1].to).addTo(map));
    }
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; layers.current = { teams: {}, hand: [] }; };
  }, [prep?.track]);

  // týmy na mapě
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !prep?.idx) return;
    const L_ = layers.current.teams;
    rows.forEach((r) => {
      const pos = latLonAt(prep, r.lp.leg, r.lp.p);
      if (!pos) return;
      const html = `<div class="tm ${r.team.id === pinned ? 'me' : ''}" style="--c:${r.look.color}">${r.look.emoji}<span class="rk">${r.rank}</span></div>`;
      const icon = L.divIcon({ className: '', html, iconSize: [30, 30], iconAnchor: [15, 15] });
      if (!L_[r.team.id]) {
        L_[r.team.id] = L.marker([pos.lat, pos.lon], { icon, zIndexOffset: 500 }).addTo(map).on('click', () => hashGo(`/team/${encodeURIComponent(r.team.id)}`));
      } else { L_[r.team.id].setLatLng([pos.lat, pos.lon]); L_[r.team.id].setIcon(icon); }
      L_[r.team.id].bindTooltip(`${r.rank}. ${r.team.name} · ${r.km.toFixed(1)} km`);
    });
  }, [rows, prep, pinned]);

  // přehrávání
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setT((cur) => {
      const nx = (cur ?? tMin) + RATE / 10;
      if (nx >= tMax) { setPlaying(false); return tMax; }
      return nx;
    }), 100);
    return () => clearInterval(id);
  }, [playing, tMin, tMax]);

  useEffect(() => { if (finale && race) { setT(tMin); setPlaying(true); } }, [finale, !!race]); // eslint-disable-line

  if (!race) return <div className="card">Nejsou nahraná data závodu.</div>;
  if (!s.gpx) return <div className="card">Chybí GPX trasa. Admin ji nahraje v nastavení.</div>;
  if (prep?.error) return <div className="card errmsg">GPX se nepodařilo přečíst: {prep.error}</div>;
  const me = pinned && rows.find((r) => r.team.id === pinned);
  const live = T == null;

  return (
    <>
      <div className="mapwrap"><div ref={boxRef} style={{ position: 'absolute', inset: 0 }} />
        <div style={{ position: 'absolute', right: 8, top: 8, zIndex: 1000, display: 'grid', gap: 6 }}>
          <button className="pbtn" onClick={() => mapRef.current?.fitBounds(layers.current.bounds, { padding: [20, 20] })}>⤢ Celá trať</button>
          <button className="pbtn" onClick={() => { const pts = Object.values(layers.current.teams).map((m) => m.getLatLng()); if (pts.length) mapRef.current?.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 15 }); }}>🎯 Týmy</button>
        </div></div>
      {me && <div className="card sm" style={{ padding: '8px 12px' }}>📌 {me.team.name} · {me.rank}. místo · {me.lp.leg >= 10 ? 'v cíli' : me.lp.leg ? `úsek ${me.lp.leg}` : 'před startem'} · {me.km.toFixed(1).replace('.', ',')} z {totalKm(race).toFixed(1).replace('.', ',')} km</div>}
      <div className="player">
        <div className="row"><span className="xs muted">{live ? 'Živý stav' : 'Přehrávání'}</span><span className="sp" /><span className="clock">{fmtHHMM(t)}</span><span className="xs muted">1 h = 10 s</span></div>
        <input type="range" min={tMin} max={tMax} step="1" value={Math.min(Math.max(t, tMin), tMax)}
          onChange={(e) => { setPlaying(false); const v = +e.target.value; setT(v >= tMax - 0.5 && now >= tMax - 0.5 ? null : v); }} aria-label="Čas závodu" />
        <div className="ctl">
          <button className="pbtn red" onClick={() => { if (playing) setPlaying(false); else { if (T == null || T >= tMax) setT(tMin); setPlaying(true); } }}>{playing ? '❚❚ Pauza' : '▶ Přehrát od startu'}</button>
          <button className="pbtn ghost" onClick={() => { setPlaying(false); setT(Math.max(tMin, t - 60)); }}>−1 h</button>
          <button className="pbtn ghost" onClick={() => { setPlaying(false); setT(Math.min(tMax, t + 60)); }}>+1 h</button>
          <button className="pbtn" onClick={() => { setPlaying(false); setT(null); }}>Živě</button>
        </div>
        {finale && <button className="pbtn" onClick={() => downloadAllCards(rows, prep, s.settings, race, s.entries)}>⬇ Stáhnout výsledkové karty týmů</button>}
      </div>
    </>
  );
}
