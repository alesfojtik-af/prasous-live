const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  p.on('dialog', (d) => d.accept());
  const shot = (n) => p.screenshot({ path: `/tmp/shots/${n}.png` });
  await p.goto('http://localhost:4173/?local=1#/login'); await p.waitForTimeout(600);
  await p.click('.chip:has-text("Admin")'); await p.fill('input[type=password]', 'prasous-admin'); await p.click('button.btn'); await p.waitForTimeout(400);
  await p.click('text=Načíst testovací závod 2026'); await p.waitForTimeout(2500); await p.click('text=Potvrdit import'); await p.waitForTimeout(1200);
  await p.click('.chip:has-text("Simulace")'); await p.fill('.field input', '5:25'); await p.click('text=Spustit simulaci'); await p.waitForTimeout(600);
  await p.click('.chip:has-text("5× rychleji")');
  for (let i = 0; i < 16; i++) { await p.click('button:has-text("+1 h")'); await p.waitForTimeout(250); }
  await p.waitForTimeout(8000);
  await p.click('.chip:has-text("Ostatní")'); await p.waitForTimeout(500); await shot('30-other-done');
  await p.click('text=Vygenerovat video závodu'); await p.waitForTimeout(3000); await shot('31-finale');
  await p.evaluate(() => (location.hash = '/team/8aD')); await p.waitForTimeout(800);
  await p.click('text=Sdílet na Facebook'); await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelector('.sharecard')?.scrollIntoView()); await shot('32-share');
  await p.evaluate(() => (location.hash = '/live')); await p.waitForTimeout(800); await shot('33-live-final');
  await p.evaluate(() => (location.hash = '/admin')); await p.click('.chip:has-text("Časy")'); await p.waitForTimeout(500); await shot('34-times');
  console.log(errs.join('\n') || 'no page errors');
  await b.close();
})();
