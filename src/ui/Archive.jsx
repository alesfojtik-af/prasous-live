/* Starší ročníky: výsledky a trasu dřívějších závodů jen k prohlížení. */
import { useApp, hashGo } from './ctx.jsx';

export default function Archive() {
  const { s, store } = useApp();
  const fmt = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' }) : '');
  return (
    <>
      <h2>Ročníky závodu</h2>
      <div className="card" style={{ padding: '4px 12px' }}>
        <div className="list">
          {[...s.editions].reverse().map((e) => (
            <div key={e.id} className="li" style={{ cursor: 'default' }}>
              <div className="sp"><div className="nm">PraSouš {e.label}</div><div className="xs muted">{fmt(e.race_date)}{e.id === s.activeId ? ' · aktuální' : ''}</div></div>
              {e.id === s.viewId ? <span className="pill sent">zobrazeno</span>
                : <button className="btn sm ghost" onClick={async () => { await store.viewEdition(e.id === s.activeId ? null : e.id); hashGo('/live'); }}>Zobrazit</button>}
            </div>
          ))}
          {!s.editions.length && <div className="xs muted" style={{ padding: 8 }}>Zatím žádný ročník.</div>}
        </div>
      </div>
    </>
  );
}
