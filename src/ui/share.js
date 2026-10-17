/* Karta ke sdílení (PNG): logo, ročník, tým, pořadí, čistý čas, silueta trati a pruh postupu 0–100 %. */

function loadImg(src) {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}

export async function drawShareCard({ teamName, emoji, color, rank, netText, statusText, progress, profile, year }) {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#F5F4F1'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, 230);
  g.fillStyle = '#CC0000'; g.fillRect(0, 226, W, 8);
  const logo = await loadImg(`${import.meta.env.BASE_URL}logo-large.png`);
  if (logo) g.drawImage(logo, 50, 40, 470, 470 * (logo.height / logo.width));
  g.fillStyle = '#CC0000'; g.beginPath(); g.roundRect(W - 250, 70, 200, 90, 18); g.fill();
  g.fillStyle = '#fff'; g.font = '800 58px Poppins, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(String(year), W - 150, 135);

  g.textAlign = 'left';
  g.fillStyle = color + '33'; g.beginPath(); g.roundRect(60, 300, 150, 150, 30); g.fill();
  g.font = '86px system-ui, sans-serif'; g.fillStyle = '#000'; g.fillText(emoji, 88, 405);
  g.fillStyle = '#141414'; g.font = '800 76px Poppins, system-ui, sans-serif';
  let name = teamName; while (g.measureText(name).width > W - 290 && name.length > 3) name = name.slice(0, -2);
  g.fillText(name === teamName ? name : name + '…', 245, 380);
  g.fillStyle = '#6A645E'; g.font = '600 38px Figtree, system-ui, sans-serif'; g.fillText(statusText, 247, 435);

  g.fillStyle = '#141414'; g.font = '800 200px Poppins, system-ui, sans-serif'; g.fillText(`${rank}.`, 60, 700);
  g.font = '600 40px Figtree, system-ui, sans-serif'; g.fillStyle = '#6A645E'; g.fillText('místo (podle čistého času)', 330, 640);
  g.fillStyle = '#CC0000'; g.font = '700 110px "JetBrains Mono", ui-monospace, monospace'; g.fillText(netText, 330, 745);

  // silueta + pruh postupu
  const x0 = 60, x1 = W - 60, yb = 1000, yt = 800;
  if (profile?.length) {
    const min = Math.min(...profile.map((p) => p.ele)), max = Math.max(...profile.map((p) => p.ele));
    const total = profile[profile.length - 1].km;
    const px = (km) => x0 + (km / total) * (x1 - x0), py = (e) => yb - ((e - min) / Math.max(1, max - min)) * (yb - yt);
    const path = () => { g.beginPath(); profile.forEach((p, i) => (i ? g.lineTo(px(p.km), py(p.ele)) : g.moveTo(px(p.km), py(p.ele)))); };
    g.lineWidth = 8; g.lineJoin = 'round'; g.lineCap = 'round';
    path(); g.strokeStyle = '#141414'; g.stroke();
    g.save(); g.beginPath(); g.rect(0, 0, x0 + (x1 - x0) * progress, H); g.clip(); path(); g.strokeStyle = '#CC0000'; g.lineWidth = 11; g.stroke(); g.restore();
    const fy = py(profile[profile.length - 1].ele);
    g.strokeStyle = '#CC0000'; g.lineWidth = 6; g.beginPath(); g.moveTo(x1, fy); g.lineTo(x1, fy - 70); g.stroke();
    g.fillStyle = '#CC0000'; g.beginPath(); g.moveTo(x1, fy - 70); g.lineTo(x1 + 44, fy - 55); g.lineTo(x1, fy - 40); g.fill();
  }
  const by = 1090;
  g.fillStyle = '#E4E0DB'; g.beginPath(); g.roundRect(x0, by, x1 - x0, 34, 17); g.fill();
  g.fillStyle = color; g.beginPath(); g.roundRect(x0, by, Math.max(34, (x1 - x0) * progress), 34, 17); g.fill();
  g.fillStyle = '#141414'; g.font = '700 44px Figtree, system-ui, sans-serif';
  g.fillText(`${Math.round(progress * 100)} % trati`, x0, by + 100);
  g.textAlign = 'right'; g.fillStyle = '#6A645E'; g.font = '600 34px Figtree, system-ui, sans-serif'; g.fillText('PraSouš Live', x1, by + 100);
  return c;
}

export const canvasToBlob = (c) => new Promise((res) => c.toBlob(res, 'image/png'));

export async function shareCard(canvas, text) {
  const blob = await canvasToBlob(canvas);
  const file = new File([blob], 'prasous.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return 'shared'; } catch { return 'cancel'; }
  }
  downloadBlob(blob, 'prasous.png');
  window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(location.href.split('#')[0])}&quote=${encodeURIComponent(text)}`, '_blank', 'noopener');
  return 'fallback';
}

export function downloadBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
