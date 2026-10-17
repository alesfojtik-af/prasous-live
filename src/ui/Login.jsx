/* Přihlášení kapitána (tým + heslo) a admina. Hesla ověřuje server, aplikace si pamatuje jen to, co potřebuje k odeslání zápisu. */
import { useState } from 'react';
import { useApp, hashGo } from './ctx.jsx';

export default function Login() {
  const { s, store, auth, setAuth } = useApp();
  const [role, setRole] = useState('captain');
  const [team, setTeam] = useState(s.race?.teams?.[0]?.id ?? '');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (auth.role !== 'viewer') {
    return (
      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <h3>Přihlášen: {auth.role === 'admin' ? 'admin' : `kapitán ${s.race?.teams.find((t) => t.id === auth.team)?.name ?? ''}`}</h3>
        <button className="btn dark" onClick={() => { setAuth({ role: 'viewer' }); hashGo('/live'); }}>Odhlásit</button>
      </div>
    );
  }
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      if (role === 'admin') {
        if (await store.checkAdmin(pw)) { setAuth({ role: 'admin', pw }); hashGo('/admin'); } else setErr('Špatné heslo.');
      } else {
        const t = s.race?.teams.find((x) => x.id === team);
        if (!t) setErr('Nejdřív vyber tým (data závodu nejsou nahraná?).');
        else if (await store.checkTeam(t.id, pw)) { setAuth({ role: 'captain', team: t.id, pw }); hashGo('/captain'); }
        else setErr('Špatné heslo. Výchozí heslo je název týmu.');
      }
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
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
      <button className="btn" disabled={busy}>Přihlásit</button>
      {role === 'captain' && <div className="xs muted">Výchozí heslo je název týmu. Admin ho může změnit.</div>}
    </form>
  );
}
