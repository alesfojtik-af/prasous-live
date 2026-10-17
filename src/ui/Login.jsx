import { useState } from 'react';
import { useApp, hashGo } from './ctx.jsx';

export const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'prasous-admin';
const norm = (x) => String(x ?? '').trim().toLowerCase();

export default function Login() {
  const { s, auth, setAuth } = useApp();
  const [role, setRole] = useState('captain');
  const [team, setTeam] = useState(s.race?.teams?.[0]?.id ?? '');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');

  if (auth.role !== 'viewer') {
    return (
      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <h3>Přihlášen: {auth.role === 'admin' ? 'admin' : `kapitán ${s.race?.teams.find((t) => t.id === auth.team)?.name ?? ''}`}</h3>
        <button className="btn dark" onClick={() => { setAuth({ role: 'viewer' }); hashGo('/live'); }}>Odhlásit</button>
      </div>
    );
  }
  const submit = (e) => {
    e.preventDefault();
    if (role === 'admin') {
      if (pw === ADMIN_PASSWORD) { setAuth({ role: 'admin' }); hashGo('/admin'); } else setErr('Špatné heslo.');
    } else {
      const t = s.race?.teams.find((x) => x.id === team);
      if (!t) return setErr('Nejdřív vyber tým (data závodu nejsou nahraná?).');
      const expected = s.passwords?.[t.id] ?? t.name;
      if (norm(pw) === norm(expected)) { setAuth({ role: 'captain', team: t.id }); hashGo('/captain'); } else setErr('Špatné heslo. Výchozí heslo je název týmu.');
    }
  };
  return (
    <form className="card" style={{ display: 'grid', gap: 10 }} onSubmit={submit}>
      <h3>Přihlášení</h3>
      <div className="chips"><button type="button" className={`chip ${role === 'captain' ? 'on' : ''}`} onClick={() => setRole('captain')}>Kapitán</button>
        <button type="button" className={`chip ${role === 'admin' ? 'on' : ''}`} onClick={() => setRole('admin')}>Admin</button></div>
      {role === 'captain' && <div className="field"><label>Tým</label>
        <select value={team} onChange={(e) => setTeam(e.target.value)}>{(s.race?.teams || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>}
      <div className="field"><label>Heslo</label><input type="password" value={pw} onChange={(e) => { setPw(e.target.value); setErr(''); }} autoComplete="current-password" /></div>
      {err && <div className="errmsg">{err}</div>}
      <button className="btn">Přihlásit</button>
      {role === 'captain' && <div className="xs muted">Výchozí heslo je název týmu. Admin ho může změnit.</div>}
    </form>
  );
}
