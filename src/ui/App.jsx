/* Kořen aplikace: router (hash), přihlášení, kontext (stav, store, čas), hlavička s příznaky fáze/simulace/archivu a banery. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
/* Kostra aplikace: směrování, přihlášení, hlavička, spodní lišta a hodiny simulace. */
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
import { SimSection } from './Admin.jsx';
import Archive from './Archive.jsx';
import { daysUntil } from '../domain/phase.js';
import { fmtHHMM } from '../domain/time.js';

const store = createStore();
const readJson = (k, d, st = localStorage) => { try { return JSON.parse(st.getItem(k)) ?? d; } catch { return d; } };
// heslo admina se pamatuje jen do zavření záložky, heslo kapitána na tomto telefonu
const readAuth = () => readJson('prasous.auth', null, sessionStorage) ?? readJson('prasous.auth', { role: 'viewer' });

function useRoute() {
  const get = () => (location.hash.replace(/^#/, '') || '/live').split('/').filter(Boolean);
  const [r, setR] = useState(get);
  useEffect(() => { const h = () => setR(get()); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  return r;
}

export default function App() {
  const s = useStoreState(store);
  const [auth, setAuthState] = useState(readAuth);
  const [pinned, setPinnedState] = useState(() => readJson('prasous.pinned', null));
  const [msg, setMsg] = useState(null);
  const route = useRoute();
  useEffect(() => { store.init(); }, []);
  const now = useNow(s.ready ? s : { settings: {} });

  const setAuth = useCallback((a) => { sessionStorage.removeItem('prasous.auth'); localStorage.removeItem('prasous.auth'); (a.role === 'admin' ? sessionStorage : localStorage).setItem('prasous.auth', JSON.stringify(a)); store.setCreds(a.role === 'admin' ? { role: 'admin', adminPw: a.pw } : a); setAuthState(a); if (a.role === 'captain' && !readJson('prasous.pinned', null)) { setPinnedState(a.team); localStorage.setItem('prasous.pinned', JSON.stringify(a.team)); } }, []);
  const setPinned = useCallback((id) => { localStorage.setItem('prasous.pinned', JSON.stringify(id)); setPinnedState(id); }, []);
  const toast = useCallback((m) => { setMsg(m); setTimeout(() => setMsg(null), 3500); }, []);
  useEffect(() => { store.setCreds(auth.role === 'admin' ? { role: 'admin', adminPw: auth.pw } : auth); }, [s.ready]); // eslint-disable-line
  useEffect(() => { const id = setInterval(() => store.simTick(), 1000); return () => clearInterval(id); }, []);
  const routeKey = route.join('/');
  useEffect(() => { document.querySelector('main')?.scrollTo(0, 0); }, [routeKey]);

  const ctx = useMemo(() => ({ s, store, now, auth, setAuth, pinned, setPinned, toast }), [s, now, auth, pinned, setAuth, setPinned, toast]);
  if (!s.ready) return <div className="app"><div style={{ margin: 'auto', color: '#6A645E' }}>Načítám…</div></div>;

  const [page, arg] = route;
  const sim = s.settings.sim?.on;
  const tabs = [['live', 'Živě', Icons.live], ['map', 'Mapa', Icons.map], ['legs', 'Úseky', Icons.legs], ['teams', 'Týmy', Icons.teams]];
  if (auth.role === 'captain') tabs.push(['captain', 'Můj tým', Icons.captain]);
  if (auth.role === 'admin') tabs.push(['admin', 'Admin', Icons.admin]);
  // Simulace dokončeného závodu na datech z Excelu: může ji spustit kdokoli, běží jen v jeho zařízení
  const canSim = !!s.race && s.race.teams.length > 0 && s.race.teams.every((t) => t.scenario) && page !== 'login';
  const startDemo = () => { store.startSim(Math.min(...s.race.teams.map((t) => t.planStart)) - 5); hashGo('/live'); };
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
    case 'sim': body = <SimSection />; break;
    case 'archive': body = <Archive />; break;
    default: body = <Live />;
  }
  const fill = page === 'map' || page === 'finale';
  const active = page === 'finale' ? 'map' : page === 'team' ? 'teams' : page === 'login' ? '' : page || 'live';

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <header className="top">
          <a href="https://www.prasous.cz" target="_blank" rel="noopener noreferrer" style={{ display: 'flex' }}><img src={`${import.meta.env.BASE_URL}logo.png`} alt="PraSouš (www.prasous.cz)" /></a>
          <span className="year">{s.settings.year}</span>
          <span className="sp" />
          {!sim && canSim && <button className="simbtn" onClick={startDemo} title={`Spustit simulaci PraSouš ${s.settings.year}`}>▶ Simulace {s.settings.year}</button>}
          {!s.online ? <span className="live off">BEZ SIGNÁLU{pendingN ? ` · ${pendingN}` : ''}</span>
            : sim ? <span className="live sim" onClick={() => hashGo('/sim')} style={{ cursor: 'pointer' }}>SIMULACE {fmtHHMM(s.settings.sim.now)}</span>
            : s.isArchive ? <span className="live off">ARCHIV</span>
            : s.phase === 'before' ? <span className="live off">ZA {daysUntil(s.settings.date)} DNÍ</span>
            : s.phase === 'after' ? <span className="live off">VÝSLEDKY</span>
            : <span className="live">ŽIVĚ</span>}
          <a onClick={() => hashGo('/login')} style={{ cursor: 'pointer', color: auth.role === 'viewer' ? '#6A645E' : '#CC0000', width: 24, height: 24 }} title={auth.role === 'viewer' ? 'Přihlásit' : 'Účet'}>{Icons.login}</a>
        </header>
        {s.banner && <div className="banner">{s.banner}</div>}
        {sim && <div className="banner">Simulace běží jen na tomto zařízení, do databáze se nic neukládá. Zastavíš ji klepnutím na odznak SIMULACE nahoře.</div>}
        {s.isArchive && <div className="banner">Prohlížíš starší ročník {s.settings.year}. <a style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => { store.viewEdition(null); hashGo('/live'); }}>Zpět na aktuální</a></div>}
        {s.settings.fb && ['live', 'map', 'legs', 'teams', 'team', 'finale', undefined, ''].includes(page) && (
          <a className="fbbar" href={s.settings.fb} target="_blank" rel="noopener noreferrer">💬 Komentujte závod na Facebooku</a>)}
        <main className={fill ? 'fill' : ''}>{body}</main>
        <nav className="tabs">{tabs.map(([k, label, icon]) => <a key={k} className={active === k ? 'on' : ''} onClick={() => hashGo(`/${k}`)} style={{ cursor: 'pointer' }}>{icon}{label}</a>)}</nav>
        {msg && <div className="toast">{msg}</div>}
      </div>
    </Ctx.Provider>
  );
}
