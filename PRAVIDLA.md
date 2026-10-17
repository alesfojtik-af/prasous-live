# Pravidla aplikace PraSouš Live

Jedna věta na pravidlo, vždy s odkazem na místo v kódu. Při každé změně pravidla se upravuje i tento soubor.

## Časy a zápisy
- Čas závodu jsou minuty od půlnoci dne startu; po půlnoci pokračují (1465 = 0:25 dalšího dne). `src/domain/time.js`
- Napsaný čas menší než předchozí předávka se bere jako další den. `resolveClock` v `src/domain/time.js`
- Úsek musí trvat 0,3× až 3× plánu, jinak se zápis odmítne (admin smí zapsat cokoli). `validateEntry` v `src/domain/time.js`, na serveru `pl_submit_entry` v `supabase/schema.sql`
- Čas nesmí být v budoucnosti (tolerance 2–3 min). Totéž dvakrát: klient i server.
- Kapitán zapisuje jen svůj tým a jen další bod v pořadí; zapsaný čas kapitán nepřepíše, opravuje admin. `pl_submit_entry`
- Zápis je možný jen v aktivním ročníku, v den závodu a do 6:00 dalšího dne. `racePhase` v `src/domain/phase.js`, `pl_submit_entry`
- Zápisy se nikdy nemažou bez stopy: každá změna jde do historie, „Smazat zápisy“ nejdřív zálohuje. `pl_history`, `pl_admin_clear_entries`

## Výpočty
- Pořadí je podle čistého času od vlastního startu týmu (vlnový start), shodné časy mají shodné pořadí. `src/domain/calc.js`, `competitionRank`
- Predikce cíle = poslední zapsaná předávka + zbývající plán (plán + dosavadní odchylka). `teamState` v `src/domain/calc.js`
- Tempo se zobrazuje v min:vt na kilometr, nikde km/h. `paceTxt` v `src/domain/time.js`
- Délka úseku a převýšení jsou z Excelu, ne z GPX (trasa nevede nejkratší cestou). `src/domain/excel.js`

## Přístup a data
- Hesla ověřuje databáze (bcrypt), 10 neúspěšných pokusů za 10 minut zablokuje další. `supabase/schema.sql`
- Výchozí heslo kapitána je název týmu, admin ho může změnit. `pl_team_ok`
- Původní Excel (e-maily, roky narození) není veřejně čitelný, čte ho jen admin. `pl_edition_files`, `pl_admin_get_xlsx`
- Simulace běží jen v zařízení admina a nic nezapisuje do databáze. `src/store/index.js`
- Selfie a videa týmů zůstávají v zařízení uživatele. `src/ui/Captain.jsx`, `src/ui/Teams.jsx`
- Ročníky se nepřepisují bez stopy: nahrazení uloží starou verzi k obnovení. `pl_edition_versions`

## Zobrazení
- Před závodem odpočet a plán, v den závodu živě, po závodě konečné výsledky. `src/ui/Live.jsx`
- Název bodu (Start, Předávka n, Cíl) je na jednom místě. `pointLabel` v `src/domain/time.js`
- Odkaz na Facebookovou událost je nastavení ročníku, ukazuje se divákům. `fb:<ročník>` v `pl_settings`
