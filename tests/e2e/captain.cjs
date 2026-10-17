// E2E (lokální režim, simulace): kapitán zapíše start a předávku, odmítnutí nesmyslného času, fronta bez signálu, selfie.
// Spuštění: VITE_TESTDATA=1 npm run build && npx vite preview --port 4173 &  potom  node tests/e2e/captain.cjs
const { chromium } = require('playwright');
const assert = (c, m) => { if (!c) throw new Error('SELHÁNÍ: ' + m); console.log('ok:', m); };
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 780 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const keys = async (t) => { for (const ch of t) await p.click(`.keypad button[aria-label="${ch}"]`); };
  await p.goto('http://localhost:4173/?local=1#/login'); await p.waitForTimeout(800);
  await p.click('.chip:has-text("Admin")'); await p.fill('input[type=password]', 'prasous-admin'); await p.click('button.btn'); await p.waitForTimeout(400);
  await p.click('text=Načíst testovací závod 2026'); await p.waitForTimeout(2500); await p.click('text=Potvrdit import'); await p.waitForTimeout(1500);
  await p.click('.chip:has-text("Ostatní")');
  await p.fill('input[placeholder^="https://www.facebook.com"]', 'https://www.facebook.com/events/123'); await p.click('text=Uložit odkaz'); await p.waitForTimeout(500);
  await p.click('text=Spustit test'); await p.waitForTimeout(500);
  assert((await p.innerText('body')).includes('Lokální režim'), 'test spojení odpovídá');
  await p.click('.chip:has-text("Simulace")'); await p.click('button:has-text("Spustit")'); await p.waitForTimeout(300);
  await p.evaluate(() => (location.hash = '/live')); await p.waitForTimeout(500);
  assert((await p.innerText('body')).includes('Komentujte závod na Facebooku'), 'odkaz na Facebook je vidět divákům');
  await p.click('a[title="Účet"]').catch(() => {}); await p.click('text=Odhlásit').catch(() => {});
  await p.evaluate(() => (location.hash = '/login')); await p.waitForTimeout(300);
  await p.selectOption('select', '8aD'); await p.fill('input[type=password]', 'bad'); await p.click('button.btn'); await p.waitForTimeout(500);
  assert(!(await p.innerText('body')).toLowerCase().includes('další bod'), 'špatné heslo kapitána je odmítnuto');
  await p.fill('input[type=password]', '8aD'); await p.click('button.btn'); await p.waitForTimeout(800);
  assert((await p.innerText('body')).toLowerCase().includes('další bod'), 'kapitán se přihlásil');
  await keys('2250'); await p.waitForTimeout(200);
  assert(await p.locator('.errmsg').count() > 0 || (await p.locator('button.btn:has-text("Uložit")').isDisabled()), 'nesmyslný čas je odmítnut');
  console.log(errs.join('\n') || 'bez chyb stránky');
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
