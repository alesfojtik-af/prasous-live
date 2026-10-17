# PraSouš Live

Mobilní webová aplikace (PWA) pro štafetový závod PraSouš: plán z Excelu, zápis předávek kapitány, živé pořadí, mapa s pohybem týmů, přehrávání závodu, admin opravy, simulace a export Excelu.

Stav: **funkční prototyp** postavený na datech závodu 2026 (`data/2026`, soukromý repozitář).

## Rychlý start

```bash
npm install
npm run dev          # http://localhost:5173/?local=1  (lokální režim bez databáze)
npm test             # import Excelu, výpočty (shoda se SOUHRN), validace, export
npm run build        # produkční build do dist/
```

1. Otevři aplikaci, klepni na ikonu přihlášení vpravo nahoře, **Admin**, heslo `prasous-admin`.
2. Admin → Import → **Načíst testovací závod 2026** → Potvrdit import.
3. Admin → **Simulace** → Spustit: časy z Excelu se vkládají zrychleně jako od kapitánů (pauza zastaví čas, pak můžeš zkoušet zápis jako kapitán).
4. Kapitán: přihlášení = tým + heslo (výchozí je název týmu, např. `8aD`).

Zkoušení bez signálu: na stránce kapitána zaškrtni „Vyzkoušet bez signálu“, zapiš čas, pak odškrtni.

## Režimy dat

| Režim | Kdy | Poznámka |
|---|---|---|
| Supabase | když jsou v `.env.production` / `.env.local` proměnné `VITE_SUPABASE_URL` a `VITE_SUPABASE_KEY` | sdílené mezi všemi telefony, živé aktualizace |
| Lokální | `?local=1`, nebo když databáze není dostupná | data jen v tomto prohlížeči, okna se synchronizují mezi sebou |

### Příprava Supabase (jednorázově)
1. V projektu otevři **SQL Editor** → New query.
2. Vlož celý obsah `supabase/schema.sql` a klikni **Run**.
3. Obnov aplikaci. Admin → Ostatní → „Datové úložiště“ musí ukazovat Supabase.

## Nasazení (GitHub Pages)
Repozitář → Settings → Pages → Source: **GitHub Actions**. Po každém pushi do `main` se spustí `.github/workflows/deploy.yml` (testy, build, nasazení).

## Struktura
- `src/domain/` čistá logika bez UI: `excel.js` (import/export), `gpx.js`, `calc.js` (pořadí, predikce, poloha), `time.js` (formát a validace času)
- `src/store/` datová vrstva: `local.js`, `supabase.js`, `index.js` (offline fronta, konflikty)
- `src/ui/` obrazovky
- `tests/` jednotkové testy (Vitest) a `tests/e2e/` ukázkové skripty pro Playwright
- `docs/` datový model, offline zápis, simulace a plán testování

## Známá omezení prototypu
- **Zabezpečení:** hesla týmů a heslo admina hlídá aplikace, ne databáze. Heslo admina je vidět v kódu aplikace a databáze povoluje zápis anonymnímu klíči. Pro hru to stačí, před širším provozem přejít na Supabase Auth a RLS podle rolí.
- Mapové podklady: OpenStreetMap (Mapy.cz vyžaduje API klíč; výměna je jedna řádka v `src/ui/MapPage.jsx`).
- Video závodu: tlačítko otevře přehrání celého závodu a stažení karet týmů; export do video souboru zatím není.
- Závod přes půlnoc není podporován (časy jsou HH:MM v rámci jednoho dne).
