import { createRoot } from 'react-dom/client';
import App from './ui/App.jsx';
import './ui/styles.css';

createRoot(document.getElementById('root')).render(<App />);
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
}

// Nová verze na serveru: po návratu do aplikace a každých 5 minut se zkontroluje version.json (mimo mezipaměť) a nabídne se obnovení.
if (import.meta.env.PROD) {
  const check = async () => {
    try {
      const v = await (await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })).json();
      if (v.build !== __BUILD_ID__ && !document.getElementById('newver')) {
        const b = document.createElement('button');
        b.id = 'newver'; b.textContent = 'Je nová verze aplikace. Klepni pro obnovení.';
        b.style.cssText = 'position:fixed;left:12px;right:12px;bottom:84px;z-index:99999;padding:12px;border:0;border-radius:12px;background:#CC0000;color:#fff;font:600 15px system-ui';
        b.onclick = () => location.reload();
        document.body.appendChild(b);
      }
    } catch { /* bez signálu se nic neděje */ }
  };
  setInterval(check, 300000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  check();
}
