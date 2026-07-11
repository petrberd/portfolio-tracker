# Portfolio Tracker — kontext pro Claude

Lokální webová appka na sledování akciového portfolia z XTB (po vzoru Alocano/Stonkee).
Uživatel naimportuje Excel export z XTB, appka zrekonstruuje pozice a spočítá výkonnost,
alokaci, dividendy, analytické odhady a detail titulu. Vše běží lokálně, data zůstávají u uživatele.

## Spuštění
```bash
npm install
cp .env.example .env.local   # volitelně doplnit FINNHUB_API_KEY
npm run dev                  # http://localhost:3210
```
Při prvním otevření (bez dat) appka ukáže obrazovku pro nahrání XTB exportu (.xlsx).
Auto-import: pokud leží `CZK_*.xlsx` v nadřazené složce, načte se sám (viz `app/api/import`).

## Stack
Next.js 14 (App Router) · TypeScript · Recharts · SheetJS (xlsx) · Tailwind. Port 3210.

## Architektura
- `lib/parseXtb.ts` — parsuje XTB export (listy *Cash Operations*, *Closed Positions*). Počet kusů
  a cenu tahá z komentářů (`OPEN BUY 0.0709 @ 994.00`).
- `lib/parseRevolut.ts` — parsuje Revolut Stocks CSV export do stejného `CashOp[]` tvaru jako XTB.
  Peněžní pole mají měnu jako textový prefix (`"EUR 150"`); do CZK přes Revolutem uváděný `FX Rate`
  u každé transakce (`CZK = částka / FX Rate`, ověřeno na reálných datech).
- `lib/positions.ts` — **FIFO** rekonstrukce pozic z cash operations, cost basis v CZK, realizovaný
  P/L, dividendy (vč. rozpadu po měsících a titulech).
- `lib/prices.ts` — ceny z Yahoo. `fetchChart` (range=max, cachováno), `fetchDailyCloses` (denní, pro
  detailní grafy), `fetchQuote`, `fetchFxCzk`. FX páry `USDCZK=X`.
- `lib/timeseries.ts` — denní hodnota portfolia (akcie + hotovost) vs. investovaný kapitál;
  **TWR** (time-weighted return) po měsících/rocích; rizikové metriky (volatilita, max drawdown,
  Sharpe); benchmark vs S&P 500 (`^GSPC`).
- `lib/fundamentals.ts` — fundamenty (EPS, tržby, FCF, EBITDA…) z Yahoo `fundamentals-timeseries`.
- `lib/analysts.ts` — cílová cena + rating z stockanalysis.com.
- `lib/finnhub.ts` — sektor (`profile2`) + insider obchody (`insider-transactions`). Vyžaduje klíč.
- `lib/news.ts` — novinky z Yahoo RSS.
- `lib/divcalendar.ts` — dividendový kalendář (frekvence, částka, ex/pay date) z Nasdaqu (fallback Yahoo)
  a projekce plateb na 12 měsíců.
- `lib/store.ts` — persistence per broker (`data/export.json` pro XTB, `data/export-revolut.json`
  pro Revolut); `loadExport()` obě sloučí do jednoho portfolia (concat + sort `cashOps`), takže
  všechny downstream routy fungují beze změny bez ohledu na to, kolik brokerů je nahraných.
- API routy: `app/api/{import,portfolio,valuation?,analysts,stockdetail,dividends}` — čtou libs, cachují do `data/*.json`.
- UI: `app/page.tsx` (dashboard) + `components/` (Charts, Analysts, StockDetail, DividendCalendar).

## Datové zdroje — co odsud funguje a co ne
Zjištěno empiricky (prostředí blokuje část zdrojů):
- ✅ **Yahoo `query1` chart** `query1.finance.yahoo.com/v8/finance/chart/<sym>` — ceny, měna, historie,
  `&events=div` pro dividendy. `range=max` vrací MĚSÍČNÍ data → na denní použij `range=2y`.
- ✅ **Yahoo `fundamentals-timeseries`** — roční fundamenty, bez crumbu.
- ✅ **stockanalysis.com** `/api/symbol/s/<US-TICKER>/overview` — analytici (rating, cíl, rozpad). Jen US.
- ✅ **Nasdaq** `api.nasdaq.com/api/quote/<sym>/dividends?assetclass=stocks` — reálné ex+pay date, ale jen
  **Nasdaq-listed** (NYSE jako VICI/MO vrací prázdno → fallback na Yahoo ex-daty + odhad pay date).
- ✅ **Yahoo RSS** `feeds.finance.yahoo.com/rss/2.0/headline?s=<sym>` — novinky.
- ✅ **Finnhub free** — `profile2` (sektor) + `insider-transactions`. Klíč v `.env.local`.
- ❌ **Blokované / placené:** Yahoo `query2` a `quoteSummary` (crumb → 401), Stooq (anti-bot), Finnhub
  `institutional-ownership` a `price-target` (placené). Proto se institucionální držba nedělá.

## Klíčová výpočetní rozhodnutí
- **Hodnota portfolia** v grafu = tržní hodnota akcií; ale výkonnost (TWR) počítá z **celkové hodnoty
  vč. hotovosti**, aby přesuny cash↔akcie nevypadaly jako zisk a dividendy/úroky se započítaly.
- **Výnos %** = TWR (nezávislý na načasování vkladů), ne prosté (hodnota/vklady).
- **Dividendová projekce** bere počet akcií **k ex-dividend dni** (historicky rekonstruováno), ne dnešní —
  akcie koupené po ex-date na tu dividendu nárok nemají. Okno = 12 měsíců od začátku aktuálního měsíce.
- **Známé zjednodušení:** historické hodnoty se přepočítávají DNEŠNÍM FX kurzem (ne historickým) — zkresluje
  to historické CZK hodnoty a míchá cenový vs měnový efekt. Kandidát na opravu (historický FX / přepínač CZK/USD).

## Cache & data / persistence
Perzistence jde přes `lib/storage.ts` (`readJson`/`writeJson`): **lokálně soubory v `data/`**,
**na Netlify Netlify Blobs** (read-only FS) — přepíná se podle `process.env.NETLIFY`. Klíče:
`export.json` (import), `prices.json`, `fundamentals.json`, `finnhub.json`, `analysts.json`,
`divcal.json`, `cash.json`. Lokálně smazáním souboru vynutíš re-fetch; „Obnovit ceny" obchází cache cen.
Když přidáváš nový cache modul, čti/zapisuj přes `storage.ts`, ne přes `fs` napřímo (jinak spadne na Netlify).

## Basic auth
`middleware.ts` schová celý web za HTTP Basic Auth, ale jen na produkci
(`NODE_ENV=production`, tj. na Netlify) — lokální `npm run dev` běží vždy bez hesla, aby
testování appky nevyžadovalo opakované zadávání přihlašovacích údajů. Na produkci se vynucuje
jen když jsou nastavené `BASIC_AUTH_USER` + `BASIC_AUTH_PASSWORD` (jinak je web otevřený).
Creds nejsou v repu — lokálně `.env.local`, na Netlify env.

## Verzování
Od v1.0.0 (2026-07-11) se appka verzuje: [Keep a Changelog](https://keepachangelog.com/) formát
v `CHANGELOG.md` + [SemVer](https://semver.org/) v `package.json`. **Při každém pushi na GitHub**,
který mění chování appky (feature, fix, odebrání) — ne u čistě dokumentačních změn:
1. Přidej záznam do `CHANGELOG.md` (Added/Fixed/Changed/Removed) pod novou verzí nahoře.
2. Zvyš `version` v `package.json` (patch = fix, minor = nová featura, major = breaking změna).
3. Po pushnutí přidej git tag `vX.Y.Z` na ten commit (`git tag vX.Y.Z && git push origin vX.Y.Z`).
Čistě dokumentační push (jen README/CLAUDE.md) verzi nezvyšuje a nemusí mít changelog záznam.

## Netlify deploy
`netlify.toml` + `@netlify/plugin-nextjs`. Env proměnné na Netlify: `BASIC_AUTH_*`, `FINNHUB_API_KEY`,
volitelně `CASH_CONFIG_JSON` (spořicí účty jako JSON, protože `data/cash.json` se nedeployuje).
XTB export se na živém webu nahraje ručně (uloží se do Blobs). Build ověříš `npm run build`.

## Nápady na pokračování (z PM review, neimplementováno)
1. **Panel koncentrace/rizika** — TOP1/3/5 váhy, HHI, sektorová koncentrace + flagy (portfolio je hodně
   koncentrované: TOP5 ~80 %, Real Estate ~43 %, 100 % USD neháhdgeováno).
2. **Headline strip** nahoře — total return %, alfa vs S&P, Sharpe, hlavní rizikový flag.
3. **Férový benchmark** — S&P total-return index (vč. dividend) místo cenového `^GSPC` + přepínač CZK/USD.
4. **Atribuce výnosu** — top přispěvatelé / detraktoři.
5. Oprava FX na historický kurz (viz zjednodušení výše).

Vždy nejdřív ověř dostupnost dat (prostředí blokuje zdroje), teprve pak stav feature.

## Aktuální stav (2026-07-11)
- **Nasazeno:** https://xtb-portfolio-tracker.netlify.app (za basic auth). Repo: github.com/petrberd/portfolio-tracker.
- **Nepushnuté commity:** lokálně jsou 4 commity před `origin/main` (analysts fix, VICI dar, mobil, XTB cash) — čekají na push (uživatel je pushne až nasbírá víc změn). `git push origin main` je spustí + Netlify auto-deploy.
- **Analytická data:** stockanalysis.com zrušil starý REST endpoint; teď se čte z `stocks/<ticker>/__data.json` (SvelteKit "devalue" formát — objekty drží indexy do plochého pole; viz `lib/analysts.ts`).
- **`lib/transfers.ts`:** některé odchody akcií (dar „Send A Gift Transfer Out") jsou jen v Closed Positions, ne v Cash Operations. Detekují se tam a odečítají v positions/timeseries/dividend route (FIFO, bez realizovaného P/L).
- **XTB volná hotovost (`xtbCash`):** čistý zůstatek všech cash ops; KPI „Tržní hodnota" = akcie + xtbCash. Oddělené od KPI „Volná hotovost" (externí spořicí účty z `cash.json`/`CASH_CONFIG_JSON`).
- **Mobil:** grid sekce mají `grid-cols-1` základ + `min-w-0` na položkách; `overflow-x:hidden` + `overscroll-behavior-x:none` na html/body (jinak iOS gumové posouvání). Testováno na šířce iPhone 16 Pro (402 px) přes same-origin iframe — prohlížeč v tomto prostředí nejde zúžit pod ~460 px napřímo.
