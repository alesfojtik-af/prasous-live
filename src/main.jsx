import { createRoot } from 'react-dom/client';
import App from './ui/App.jsx';
import './ui/styles.css';

createRoot(document.getElementById('root')).render(<App />);
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
}
