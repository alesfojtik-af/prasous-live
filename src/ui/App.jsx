import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createStore } from '../store/index.js';
import { Ctx, useStoreState, useNow, hashGo } from './ctx.jsx';
import { Icons } from './common.jsx';
import Live from './Live.jsx';
import MapPage from './MapPage.jsx';
import Legs from './Legs.jsx';
import { TeamList, TeamDetail } from './Teams.jsx';
import Login from './Login.jsx';
import Captain from './Captain.jsx';
import Admin from './Admin.jsx';
import { fmtHHMM } from '../domain/time.js';

const store = createStore();
const readJson = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

function useRoute() {
  const get = () => (location.hash.replace(/^#/, '') || '/live').split('/').filter(Boolean);
  const [r, setR] = useState(get);
  useEffect(() => { const h = () => setR(get()); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  return r;
}

/** Simulace běží v okně admina: posouvá simulovaný čas a vkládá zápisy podle Excelu. */
function useSimRunner(s, auth) {
  const ref = useRef(s);
  ref.current = s;
  useEffect(() => {
    if (auth.role !== 'admin') return;
    let busy = false;
    const id = setInterval(async () => {
      const cur = ref.current, sim = cur.settings.sim;
      if (busy || !sim?.on || !sim.running || !cur.race) return;
      busy = true;
      try {
        const end = Math.max(...cur.race.teams.map((t) => t.scenario?.[9] ?? 0)) + 10;
        const nowSim = Math.min(end, sim.now + (sim.rate || 6));
        const due = [];
        for (const t of cur.race.teams) for (let i = 0; i < 10; i++) {
          const m = t.scenario?.[i];
          if (m != null && m <= nowSim && cur.entries[t.id][i] == null) due.push({ team: t.id, point: i, minutes: m });
        }
        if (due.length) await store.simWrite(due);
        await store.setSetting('sim', { ...sim, now: nowSim, running: nowSim < end });
      } finally { busy = false; }
    }, 1000);
    return () => clearInterval(id);
  }, [auth.role]);
}

export default function App() {
  const s = useStoreState(store);
  const [auth, setAuthState] = useState(() => readJson('prasous.auth', { role: 'viewer' }));
  const [pinned, setPinnedState] = useState(() => readJson('prasous.pinned', null));
  const [msg, setMsg] = useState(null);
  const route = useRoute();
  useEffect(() => { store.init(); }, []);
  const now = useNow(s.ready ? s : { settings: {} });

  const setAuth = useCallback((a) => { localStorage.setItem('prasous.auth', JSON.stringify(a)); setAuthState(a); if (a.role === 'captain' && !readJson('prasous.pinned', null)) { setPinnedState(a.team); localStorage.setItem('prasous.pinned', JSON.stringify(a.team)); } }, []);
  const setPinned = useCallback((id) => { localStorage.setItem('prasous.pinned', JSON.stringify(id)); setPinnedState(id); }, []);
  const toast = useCallback((m) => { setMsg(m); setTimeout(() => setMsg(null), 3500); }, []);
  useSimRunner(s, auth);
  const routeKey = route.join('/');
  useEffect(() => { document.querySelector('main')?.scrollTo(0, 0); }, [routeKey]);

  const ctx = useMemo(() => ({ s, store, now, auth, setAuth, pinned, setPinned, toast }), [s, now, auth, pinned, setAuth, setPinned, toast]);
  if (!s.ready) return <div className="app"><div style={{ margin: 'auto', color: '#6A645E' }}>Načítám…</div></div>;

  const [page, arg] = route;
  const sim = s.settings.sim?.on;
  const tabs = [['live', 'Živě', Icons.live], ['map', 'Mapa', Icons.map], ['legs', 'Úseky', Icons.legs], ['teams', 'Týmy', Icons.teams]];
  if (auth.role === 'captain') tabs.push(['captain', 'Můj tým', Icons.captain]);
  if (auth.role === 'admin') tabs.push(['admin', 'Admin', Icons.admin]);
  const pendingN = s.outbox.filter((o) => o.status === 'pending').length;

  let body;
  switch (page) {
    case 'map': body = <MapPage />; break;
    case 'finale': body = <MapPage finale />; break;
    case 'legs': body = <Legs n={arg} />; break;
    case 'teams': body = <TeamList />; break;
    case 'team': body = <TeamDetail id={decodeURIComponent(arg || '')} />; break;
    case 'login': body = <Login />; break;
    case 'captain': body = <Captain />; break;
    case 'admin': body = <Admin />; break;
    default: body = <Live />;
  }
  const fill = page === 'map' || page === 'finale';
  const active = page === 'finale' ? 'map' : page === 'team' ? 'teams' : page === 'login' ? '' : page || 'live';

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <header className="top">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="PraSouš" onClick={() => hashGo('/live')} style={{ cursor: 'pointer' }} />
          <span className="year">{s.settings.year}</span>
          <span className="sp" />
          {!s.online ? <span className="live off">BEZ SIGNÁLU{pendingN ? ` · ${pendingN}` : ''}</span>
            : sim ? <span className="live sim">SIMULACE {fmtHHMM(s.settings.sim.now)}</span> : <span className="live">ŽIVĚ</span>}
          <a onClick={() => hashGo('/login')} style={{ cursor: 'pointer', color: auth.role === 'viewer' ? '#6A645E' : '#CC0000', width: 24, height: 24 }} title={auth.role === 'viewer' ? 'Přihlásit' : 'Účet'}>{Icons.login}</a>
        </header>
        {s.banner && <div className="banner">{s.banner}</div>}
        <main className={fill ? 'fill' : ''}>{body}</main>
        <nav className="tabs">{tabs.map(([k, label, icon]) => <a key={k} className={active === k ? 'on' : ''} onClick={() => hashGo(`/${k}`)} style={{ cursor: 'pointer' }}>{icon}{label}</a>)}</nav>
        {msg && <div className="toast">{msg}</div>}
      </div>
    </Ctx.Provider>
  );
}
