const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 780 } })).newPage();
  const zs = []; p.on('request', (r) => { const m = r.url().match(/tile\.openstreetmap\.org\/(\d+)\//); if (m) zs.push([Date.now(), +m[1]]); });
  p.on('dialog', (d) => d.accept());
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:4173/?local=1#/login'); await p.waitForTimeout(600);
  await p.click('.chip:has-text("Admin")'); await p.fill('input[type=password]', 'prasous-admin'); await p.click('button.btn'); await p.waitForTimeout(400);
  await p.click('text=Načíst testovací závod 2026'); await p.waitForTimeout(2500); await p.click('text=Potvrdit import'); await p.waitForTimeout(1200);
  await p.click('.chip:has-text("Simulace")'); await p.fill('.field input', '5:25'); await p.click('text=Spustit simulaci'); await p.waitForTimeout(400);
  await p.evaluate(() => (location.hash = '/map')); await p.waitForTimeout(1500);
  await p.click('.leaflet-control-zoom-in'); await p.waitForTimeout(500); await p.click('.leaflet-control-zoom-in'); await p.waitForTimeout(500); await p.click('.leaflet-control-zoom-in');
  await p.waitForTimeout(800);
  const t0 = Date.now(); await p.waitForTimeout(7000); // simulace posouvá čas a mění data
  const after = zs.filter(([t]) => t > t0).map(([, z]) => z);
  console.log('max zoom before', Math.max(...zs.filter(([t]) => t <= t0).map(([, z]) => z)), 'zoom requests after 7 s of sim:', [...new Set(after)]);
  await p.click('text=Celá trať'); await p.waitForTimeout(800);
  console.log('after reset zoom', [...new Set(zs.filter(([t]) => t > t0 + 7000).map(([, z]) => z))]);
  console.log(errs.join('\n') || 'no page errors');
  await b.close();
})();
