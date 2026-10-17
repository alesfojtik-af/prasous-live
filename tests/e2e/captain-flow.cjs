const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  const shot = (n) => p.screenshot({ path: `/tmp/shots/${n}.png` });
  const keys = async (txt) => { for (const ch of txt) await p.click(`.keypad button[aria-label="${ch}"]`); };
  await p.goto('http://localhost:4173/?local=1#/login'); await p.waitForTimeout(600);
  await p.click('.chip:has-text("Admin")'); await p.fill('input[type=password]', 'prasous-admin'); await p.click('button.btn'); await p.waitForTimeout(400);
  await p.click('text=Načíst testovací závod 2026'); await p.waitForTimeout(2500); await p.click('text=Potvrdit import'); await p.waitForTimeout(1200);
  // odhlásit, přihlásit jako kapitán 8aD
  await p.evaluate(() => (location.hash = '/login')); await p.click('text=Odhlásit'); await p.waitForTimeout(300);
  await p.evaluate(() => (location.hash = '/login')); await p.waitForTimeout(300);
  await p.selectOption('select', '8aD'); await p.fill('input[type=password]', 'bad'); await p.click('button.btn'); await shot('20-badpw');
  await p.fill('input[type=password]', '8ad'); await p.click('button.btn'); await p.waitForTimeout(500);
  await shot('21-captain-start');
  await keys('530'); await shot('22-typed'); await p.click('button.btn:has-text("Uložit start")'); await p.waitForTimeout(600);
  // špatný čas: před startem
  await keys('2250'); await p.waitForTimeout(200); await shot('23-bad-time');
  for (let i = 0; i < 5; i++) await p.click('.keypad button[aria-label="⌫"]');
  // offline
  await p.check('input[type=checkbox]');
  await keys('706'); await p.click('button.btn:has-text("Uložit předávku")'); await p.waitForTimeout(500);
  await shot('24-offline-queue');
  await p.uncheck('input[type=checkbox]'); await p.waitForTimeout(1500); await shot('25-online');
  // admin oprava + export
  await p.evaluate(() => { localStorage.setItem('prasous.auth', JSON.stringify({ role: 'admin' })); location.hash = '/admin'; location.reload(); }); await p.waitForTimeout(1000);
  await p.click('.chip:has-text("Časy")'); await p.click('table.tbl tr:has-text("8aD") td.cell >> nth=2'); await p.waitForTimeout(300); await shot('26-admin-times');
  await p.click('.chip:has-text("Ostatní")'); await p.waitForTimeout(300);
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('text=Export Excelu')]);
  await dl.saveAs('/tmp/shots/export.xlsx'); console.log('export', dl.suggestedFilename());
  await shot('27-other');
  console.log(errs.join('\n') || 'no page errors');
  await b.close();
})();
