import { fmtGap } from '../domain/time.js';

export function TeamBadge({ look, size }) {
  return <span className="badge" style={{ background: look.color + '26', width: size, height: size }}>{look.emoji}</span>;
}

export function Delta({ v, invert }) {
  if (v == null || Number.isNaN(v)) return <span className="delta n">–</span>;
  const r = Math.round(v);
  const cls = r === 0 ? 'n' : (r < 0) !== !!invert ? 'g' : 'r';
  return <span className={`delta ${cls}`}>{fmtGap(r)}</span>;
}

const I = (d) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
export const Icons = {
  live: I(<><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /></>),
  map: I(<><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" /></>),
  legs: I(<><path d="M4 6h16M4 12h16M4 18h10" /></>),
  teams: I(<><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.5c3 0 6 1.5 6 5.5" /></>),
  captain: I(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  admin: I(<><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="m9 12 2 2 4-4" /></>),
  login: I(<><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" /></>),
};

export function Silhouette({ profile, progress, color = '#141414', height = 56, flag = true }) {
  if (!profile?.length) return null;
  const W = 300, H = height;
  const min = Math.min(...profile.map((p) => p.ele)), max = Math.max(...profile.map((p) => p.ele));
  const total = profile[profile.length - 1].km;
  const x = (km) => (km / total) * W, y = (e) => H - 6 - ((e - min) / Math.max(1, max - min)) * (H - 16);
  const d = profile.map((p, i) => `${i ? 'L' : 'M'}${x(p.km).toFixed(1)} ${y(p.ele).toFixed(1)}`).join('');
  const px = progress != null ? W * progress : null;
  return (
    <svg className="sil" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height }}>
      <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {px != null && <><clipPath id="sc"><rect x="0" y="0" width={px} height={H} /></clipPath>
        <path d={d} fill="none" stroke="#CC0000" strokeWidth="3" clipPath="url(#sc)" vectorEffect="non-scaling-stroke" /></>}
      {flag && <g transform={`translate(${W - 4} ${y(profile[profile.length - 1].ele)})`}><path d="M0 0V-14" stroke="#CC0000" strokeWidth="2" /><path d="M0 -14h9l-3 3 3 3H0z" fill="#CC0000" /></g>}
    </svg>
  );
}
