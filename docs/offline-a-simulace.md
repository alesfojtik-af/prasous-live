# PraSouš Live – offline zápis a simulace na datech 2026

## A. Offline zápis kapitána

**Kontext:** na trati vypadává signál, kapitán musí zapsat předávku vždy. Zápis nesmí nikdy „propadnout“.

### Chování
1. **Zápis jde vždy nejdřív do telefonu** (lokální úložiště) se stavem „čeká na odeslání“, a to i s signálem. Teprve pak se odesílá na server.
2. **Stavy zápisu:** ⏳ čeká na odeslání → ✓ odesláno → ⚠ k ověření (konflikt). Kapitán vidí stav u každého zápisu.
3. **Odeslání na pozadí:** při obnovení signálu automaticky, bez zásahu kapitána. Tlačítko „Odeslat teď“ pro ruční pokus.
4. **Čas zápisu = čas, který kapitán zadal** (ne čas odeslání). Server ukládá i čas odeslání a zdroj (offline/online).
5. **Konflikty:** dva zápisy téže předávky (např. dva kapitáni, oprava adminem) → platí poslední zápis admina, jinak poslední odeslaný; vše v historii s možností vrátit. Admin vidí frontu „k ověření“.
6. **Validace offline:** formát HH:MM, po předchozí předávce, ne v budoucnu, rozumné okno kolem predikce (predikci i plán má telefon uložené).
7. **Offline data v telefonu:** plán týmu, trať, předávky, naposledy stažené pořadí. Divák offline vidí poslední stav s časem „aktualizováno před X min“.
8. **Přihlášení** se pamatuje (token v telefonu), aby se kapitán nemusel přihlašovat bez signálu.

### Rizika a opatření
| Riziko | Opatření |
|---|---|
| Kapitán zavře aplikaci / restartuje telefon | fronta v trvalém úložišti, ne v paměti |
| Špatný čas telefonu | čas zadává kapitán ručně; tlačítko „Teď“ upozorní při velkém rozdílu oproti serveru |
| Zápis se ztratí bez povšimnutí | počítadlo „čeká: N“ v hlavičce, červeně po 15 min bez odeslání |
| Zálohou nouzově | admin může zapsat čas za tým (telefon/SMS od kapitána) |

### Otevřené otázky
- Má mít kapitán možnost zapsat i předávku **jiného** týmu (pomoc), nebo jen svého? (mock-up předpokládá jen svého)
- Má se čas „Teď“ doplňovat automaticky, nebo vždy ručně? (předpokládám tlačítko, ne automatiku)

## B. Simulace na datech 2026

**Cíl:** otestovat celou aplikaci bez živého závodu, na skutečných časech 7 týmů.

### Jak
1. **Zdrojový scénář:** skutečné časy předávek z Excelu 2026 (7 týmů × 9 úseků) se uloží stranou jako „scénář“, ne jako zápisy.
2. **Simulační režim (jen admin, jen testovací prostředí):** hodiny závodu se spouští zrychleně (např. 1 h = 10 s, stejně jako přehrávání) a scénář „zapisuje“ předávky ve správný okamžik, jako by je zadali kapitáni.
3. **Ovládání:** start/pauza, rychlost (1×, 60×, 360×), skok na čas (např. 13:00), reset.
4. **Admin může kdykoli přepsat** jakýkoli zápis a sledovat, jak se změní pořadí a predikce.
5. **Oddělené prostředí:** simulace běží v testovací kopii (jiná databáze), aby se nepomíchala s ostrým závodem v roce 2027.

### Plán testování
| Úroveň | Co se ověřuje | Jak |
|---|---|---|
| Import | všech 7 listů, FAKEER, jména dvojic, úsek 9 = 11,0 km | automatický test na Excelu 2026 + chybné soubory |
| Výpočty | čistý čas, GAP, predikce, pořadí celkové a na úseku | porovnání s listem SOUHRN z Excelu 2026 (cíl: shoda na minutu) |
| Mapa | poloha týmů, pořadí na značce, přehrávání | vizuální kontrola ve scénáři 13:00 a v cíli |
| Offline | zápis bez signálu, fronta, konflikt | telefon v režimu letadlo, 3 scénáře |
| Role | divák nevidí zápis, kapitán jen svůj tým, admin vše | test oprávnění |
| Zátěž | 10 týmů + stovky diváků | jednoduchý test souběžného čtení |
| Generálka | celý den zrychleně + 1–2 skuteční kapitáni v terénu | týden před závodem |

### Kritéria hotovo
- Výpočty se shodují se SOUHRN z Excelu 2026 (po zaokrouhlení na minuty).
- Zápis offline se po obnovení signálu odešle bez ztráty.
- Admin opraví libovolný čas a vrátí změnu do 30 s.

### Otevřené otázky
- Má SOUHRN z Excelu 2026 platit jako „správná odpověď“ i tam, kde se může lišit zaokrouhlení? (navrhuji tolerance ±1 min)
- Kdo bude testovat v terénu (kapitáni z týmů, nebo jen Aleš)?
