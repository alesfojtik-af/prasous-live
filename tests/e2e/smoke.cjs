// Smoke test (lokální režim): import, sekce admina, fáze závodu. Vyžaduje běžící 'npm run preview --port 4173' a nainstalovaný playwright.
const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const p=await (await b.newContext({viewport:{width:390,height:780}})).newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));
const t=async(n)=>{await p.waitForTimeout(500);await p.screenshot({path:`/tmp/shots/${n}.png`});};
await p.goto('http://localhost:4173/?local=1#/login');await p.waitForTimeout(800);
await p.click('.chip:has-text("Admin")');await p.fill('input[type=password]','prasous-admin');await p.click('button.btn');await t('b1');
console.log((await p.innerText('body')).slice(0,600));
await p.click('text=Načíst testovací závod 2026').catch(e=>console.log('noimport'));await p.waitForTimeout(2500);
console.log((await p.innerText('body')).slice(0,900));
await p.click('text=Potvrdit import').catch(()=>{});await p.waitForTimeout(1500);await t('b2');
for(const sec of ['Ročníky','Časy','Týmy','Simulace','Ostatní']){await p.click(`.chip:has-text("${sec}")`).catch(e=>console.log('nosec',sec));await t('s-'+sec);}
await p.evaluate(()=>location.hash='/');await t('live');
console.log((await p.innerText('body')).slice(0,500));
console.log(errs.join('\n')||'no errors');await b.close()})();
