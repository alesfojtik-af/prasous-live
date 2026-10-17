# PraSouš Live – datový model (Excel jako jediný zdroj)

**Princip:** Excel se nahraje jednou na začátku (plán, týmy, dvojice, trať). Skutečné časy se pak zapisují jen v aplikaci. Po závodě admin exportuje Excel ve stejném formátu, jaký byl nahrán.

## 1. Import (Excel → aplikace)

| Entita | Zdroj v Excelu | Pole |
|---|---|---|
| Ročník | první list | rok, datum (so 25. 4. 2026) |
| Úsek (9) | první list | číslo, start, cíl, km, stoupání, klesání, GPS začátku a konce (sl. L/M), odkaz navigace běžec, odkaz navigace auto, minuty přejezdu autem, popis selfie |
| Předávka (10) | odvozeno z úseků | číslo 0–9, GPS, poloha na GPX (podíl trati) |
| Tým | list týmu, buňka B2 | název, plánovaný start |
| Dvojice (1–3) | tabulka dvojic na listu týmu (formát listu 8aD) | jména běžců, tempo dvojice |
| Plán úseku | tabulka úseků na listu týmu | tým, úsek, dvojice, plánované minuty (jen minuty) |

Pravidla importu: ignoruje se tabulka členů, sloupec K prvního listu, čepice a koeficient únavy (je už započten v plánu). Jména dvojic se čtou z tabulky dvojic, ne ze vzorců v H16–H23. Délka úseku platí z Excelu (úsek 9 = 11,0 km). Převýšení z Excelu. List FAKEER má jiné rozložení, import ho musí rozpoznat nebo ohlásit chybu.

## 2. Provozní data (jen v aplikaci)

| Entita | Pole |
|---|---|
| Zápis předávky | tým, bod 0–9, čas (HH:MM, minuty), kdo zapsal (kapitán/admin), kdy, zdroj (online/offline fronta) |
| Historie změn | zápis, původní hodnota, nová hodnota, důvod, kdo, kdy, možnost vrátit |
| Uživatel | role (divák/kapitán/admin), tým, heslo (výchozí = název týmu) |

## 3. Odvozené hodnoty (počítá aplikace)
- Čas úseku = čas předávky − čas předchozí předávky; čistý čas týmu = poslední předávka − vlastní start.
- GAP = součet skutečných minut − součet plánovaných minut dokončených úseků.
- Predikce = plán zbývajících úseků + aktuální GAP.
- Pořadí celkové = podle čistého času od vlastního startu; pořadí na úseku = podle minut úseku.
- Poloha na mapě = podíl trati podle předávek a plánu/predikce (viz mock-up mapy).

## 4. Export (po závodě)
Tlačítko u admina: stejný formát jako nahraný Excel, skutečné časy doplněné do sloupců skutečnosti, výpočty (GAP, hodiny) zůstávají vzorci.

## 5. Simulace na datech 2026
Skutečné časy z Excelu 2026 se naimportují jako „zdrojový scénář“ a zapisují se do aplikace v čase (zrychleně). Admin může kdykoli přepsat.

## Otevřené (ověřím při implementaci)
- Přesné adresy buněk podle listu 8aD a prvního listu.
- Jak rozpoznat odlišné rozložení listu FAKEER.
