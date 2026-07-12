# Portfolio Tracker — kontext pro Claude

Lokální webová appka na sledování investičního portfolia z **XTB a/nebo Revolutu**
(po vzoru Alocano/Stonkee). Uživatel naimportuje export z brokera(ů), appka zrekonstruuje
pozice a spočítá výkonnost, alokaci, dividendy, analytické odhady, daňový časový test,
earnings kalendář a náladu trhu (VIX). Oba brokery lze mít nahrané současně — appka je
sloučí do jednoho portfolia. Vše běží lokálně, data zůstávají u uživatele.

## Spuštění
```bash
npm install
cp .env.example .env.local   # volitelně BASIC_AUTH_* — appka nepotřebuje žádný API klíč
npm run dev                  # http://localhost:3210
```
Při prvním otevření (bez dat) appka ukáže obrazovku pro nahrání exportu — **XTB** (.xlsx)
a/nebo **Revolut** (.csv), oddělená tlačítka. Auto-import: pokud leží `CZK_*.xlsx` v nadřazené
složce, XTB export se načte sám (jen v `NODE_ENV!==production`, viz `app/api/import`).

**Basic Auth se lokálně nevynucuje** (jen na produkci/Netlify) — `npm run dev` běží vždy bez
hesla, není potřeba nic zadávat při testování.

## Stack
Next.js 14 (App Router) · TypeScript · Recharts · SheetJS (xlsx) · Tailwind. Port 3210.

## Architektura
- `lib/parseXtb.ts` — parsuje XTB export (listy *Cash Operations*, *Closed Positions*). Počet kusů
  a cenu tahá z komentářů (`OPEN BUY 0.0709 @ 994.00`).
- `lib/parseRevolut.ts` — parsuje Revolut Stocks CSV export do stejného `CashOp[]` tvaru jako XTB.
  Peněžní pole mají měnu jako textový prefix (`"EUR 150"`); do CZK přes Revolutem uváděný `FX Rate`
  u každé transakce (`CZK = částka / FX Rate`, ověřeno na reálných datech).
- `lib/store.ts` — persistence per broker (`data/export.json` pro XTB, `data/export-revolut.json`
  pro Revolut); `loadExport()` obě sloučí do jednoho portfolia (concat + sort `cashOps`), takže
  všechny downstream routy fungují beze změny bez ohledu na to, kolik brokerů je nahraných.
- `lib/positions.ts` — **FIFO** rekonstrukce pozic z cash operations, cost basis v CZK, realizovaný
  P/L, dividendy (vč. rozpadu po měsících a titulech). Uchovává i jednotlivé FIFO loty s datem nákupu
  (pro daňový časový test) a roční hrubý příjem z prodejů (`taxYearSoldCzk`).
- `lib/taxtest.ts` — časový test (§4/1/w ZDP): exemptDate = nákup + 3 roky + 1 den, po FIFO tranších.
  Čistě výpočetní, žádné externí volání.
- `lib/prices.ts` — ceny z Yahoo. `fetchChart` (range=max, cachováno 1h), `fetchDailyCloses` (denní,
  pro detailní grafy i pro skutečnou denní % změnu), `fetchQuote`, `fetchFxCzk`. FX páry `USDCZK=X`.
  **Symbol resolution:** když holý ticker (Revolut bez burzovní přípony, nebo XTB burza mimo
  `yahooSymbol()`'s allowlist) nemá na Yahoo data, appka se zeptá Yahoo search API
  (`/v1/finance/search`) a vezme první fungující výsledek — cachováno natrvalo v `symbolMap.json`.
- `lib/timeseries.ts` — denní hodnota portfolia (akcie + hotovost) vs. investovaný kapitál;
  **TWR** (time-weighted return) po měsících/rocích; rizikové metriky (volatilita, max drawdown,
  Sharpe); benchmark vs **S&P 500 Total Return** (`^SP500TR`, ne cenový `^GSPC` — portfolio taky
  počítá dividendy do výkonnosti, takže cenový index by srovnání zkresloval). FX se přepočítává
  **dobovým kurzem** (viz níže), ne dnešním. Benchmark si sám vybírá nejmenší dostatečný rozsah
  historie (1y/2y/5y/10y), aby se u staršího účtu neuseknul (Yahoo `range=max` je jen měsíční).
- `lib/fundamentals.ts` — fundamenty (EPS, tržby, FCF, EBITDA…) z Yahoo `fundamentals-timeseries`.
- `lib/analysts.ts` — cílová cena + rating z stockanalysis.com (`__data.json`, SvelteKit "devalue"
  formát — objekty drží indexy do plochého pole).
- `lib/earnings.ts` — nejbližší termín výsledků ze stockanalysis.com (stejný `__data.json` pattern
  jako analysts.ts). Když je poslední známé datum v minulosti, promítne se o ~91 dní dopředu
  a označí „(odhad)".
- `lib/sector.ts` — sektor/industry ze stockanalysis.com (`__data.json`, stejný "devalue" parser
  jako analysts.ts/earnings.ts, `infoTable` pole). Bez API klíče.
- `lib/nasdaqInsider.ts` — insider obchody z Nasdaq `api.nasdaq.com/api/company/<sym>/insider-trades`
  (stejná doména jako `fromNasdaq()` v `divcalendar.ts`, ale na rozdíl od dividend endpointu
  funguje i pro NYSE tickery — ověřeno na VICI/JNJ). Bez API klíče. `transactionType` je textový
  popisek, ne signed kód — buy/sell se odvozuje z `BUY_TYPES`/`SELL_TYPES` množin, nejednoznačné
  typy (např. „Option Execute") se zahodí. Nahradil dřívější `lib/finnhub.ts` (smazán) — appka
  teď nepotřebuje žádný API klíč pro insider obchody ani sektor.
- `lib/news.ts` — novinky z Yahoo RSS.
- `lib/divcalendar.ts` — dividendový kalendář (frekvence, částka, ex/pay date) + projekce plateb na
  12 měsíců (okno od PŘÍŠTÍHO měsíce, ne aktuálního — current month bývá částečně pryč). Fallback
  řetězec: Nasdaq (reálné, jen Nasdaq-listed) → stockanalysis.com (reálné, i NYSE) → Yahoo
  (ex reálné, pay odhad).
- API routy: `app/api/{import,portfolio,analysts,stockdetail,dividends,earnings,market}` — čtou
  libs, cachují do `data/*.json`.
- UI: `app/page.tsx` (dashboard) + `components/` (Charts, Analysts, StockDetail, DividendCalendar,
  EarningsCalendar, MarketMood, Gauge — sdílený semicircle gauge pro Férovou cenu i VIX).

## Datové zdroje — co odsud funguje a co ne
Zjištěno empiricky (prostředí blokuje část zdrojů):
- ✅ **Yahoo `query1` chart** `query1.finance.yahoo.com/v8/finance/chart/<sym>` — ceny, měna, historie,
  `&events=div` pro dividendy. `range=max` vrací MĚSÍČNÍ data → na denní použij explicitní rozsah
  (`1y`/`2y`/`5d` apod. — cokoliv jiného než `max` dá denní granularitu).
- ✅ **Yahoo `/v1/finance/search`** — vyhledávání/autocomplete tickerů, funguje bez crumbu. Používá se
  jako univerzální fallback při dohledání Yahoo symbolu (viz `lib/prices.ts`).
- ✅ **Yahoo `fundamentals-timeseries`** — roční fundamenty, bez crumbu.
- ✅ **stockanalysis.com** `/stocks/<ticker>/__data.json` — analytici, earnings date, dividend historie
  (ex+pay date, i NYSE), a sektor/industry (`infoTable` pole, viz `lib/sector.ts`) — bez klíče.
  US-centrické, u evropských tickerů většinou nedostupné.
- ✅ **Nasdaq** `api.nasdaq.com/api/quote/<sym>/dividends?assetclass=stocks` — reálné ex+pay date, ale jen
  **Nasdaq-listed** (NYSE jako VICI/MO vrací prázdno → fallback stockanalysis.com/Yahoo).
- ✅ **Nasdaq** `api.nasdaq.com/api/company/<sym>/insider-trades` — insider obchody, bez klíče, a na
  rozdíl od dividend endpointu funguje i pro NYSE (ověřeno VICI/JNJ). Viz `lib/nasdaqInsider.ts`.
- ✅ **Yahoo RSS** `feeds.finance.yahoo.com/rss/2.0/headline?s=<sym>` — novinky.
- ❌ **Blokované / placené:** Yahoo `query2` a `quoteSummary` (crumb → 401), Stooq (anti-bot).
  Institucionální držba a cílové ceny nad rámec analytického konsenzu (`lib/analysts.ts`) se proto
  nedělají — appka nemá placený zdroj na ně.
- ❌ **Finnhub** (dřív používaný pro sektor + insider obchody, vyžadoval klíč) — nahrazen kompletně
  bezplatnými zdroji bez klíče (`lib/sector.ts`, `lib/nasdaqInsider.ts`); appka teď nepotřebuje
  žádný API klíč. `lib/finnhub.ts` smazán.
- ❌ **SEC EDGAR** (13F filings, Form 4 insider) — fungovalo (zkusili jsme "Smart Money" sekci: Buffett/
  Ackman/Burry 13F + Huang/Musk/Zuckerberg Form 4), ale nakonec **odebráno** — layout byl moc rozsáhlý
  na přínos pro tenhle use case. Kód smazán (`lib/secEdgar.ts`, `lib/thirteenF.ts`, `lib/secInsiders.ts`),
  vyžaduje popisný `User-Agent` header (SEC blokuje anonymní boty).
- ❌ **CNN Fear & Greed** — jejich endpoint vrací `418 I'm a teapot` (blokuje boty). Použit VIX (`^VIX`
  přes Yahoo chart) jako "index strachu" místo toho.
- ❌ **Senate/House Stock Watcher** (politici, STOCK Act) — bezplatné S3 JSON feedy jsou teď nedostupné
  (403/timeout), oficiální porty nemají REST API. Nezkoušet znovu bez nového zdroje dat.

## Klíčová výpočetní rozhodnutí
- **Hodnota portfolia** v grafu = tržní hodnota akcií; ale výkonnost (TWR) počítá z **celkové hodnoty
  vč. hotovosti**, aby přesuny cash↔akcie nevypadaly jako zisk a dividendy/úroky se započítaly.
- **Výnos %** = TWR (nezávislý na načasování vkladů), ne prosté (hodnota/vklady).
- **Dividendová projekce** bere počet akcií **k ex-dividend dni** (historicky rekonstruováno), ne
  dnešní — akcie koupené po ex-date na tu dividendu nárok nemají. Okno = 12 měsíců od PŘÍŠTÍHO měsíce.
- **Historický FX kurz** (OPRAVENO) — hodnota portfolia v čase se přepočítává dobovým FX kurzem
  platným ten den, ne dnešním (dřív to mísilo cenový a měnový efekt).
- **Denní % změna** (OPRAVENO) — dřív se počítala z `chart.closes` (měsíční granularita `range=max`),
  takže to bylo ve skutečnosti meziměsíční srovnání, ne denní. Teď se počítá ze skutečných denních dat
  (`fetchDailyCloses`), postihovalo to všechny pozice i VIX.
- **Daňový časový test** — orientační, ne daňové poradenství. Neřeší rozšířený test pro velké majetky
  (~40 mil. Kč) zavedený 2025 (portfolio této velikosti se do toho nedostane).
- **Fair Price / VIX gauge** — sdílená `SemiGauge` komponenta (`components/Gauge.tsx`). Fair Price je
  zrcadlově obrácený (podhodnoceno vpravo — tak to vyšlo přirozeně z rostoucí hodnoty `upsidePct`);
  VIX gauge je zrcadlený EXPLICITNĚ (mirroredValue = min+max-vix + obrácené pořadí barev), protože
  u VIX je nízká hodnota "dobrá", takže bez zrcadlení by klid vycházel vlevo.

## Cache & data / persistence
Perzistence jde přes `lib/storage.ts` (`readJson`/`writeJson`): **lokálně soubory v `data/`**,
**na Netlify Netlify Blobs** (read-only FS) — přepíná se podle `process.env.NETLIFY`. Klíče:
`export.json` + `export-revolut.json` (import per broker), `prices.json`, `symbolMap.json`
(Yahoo symbol resolution, cache navždy), `fundamentals.json`, `sector.json`, `insider.json`,
`analysts.json`, `divcal.json`, `earnings.json`, `cash.json`. Lokálně smazáním souboru vynutíš re-fetch;
„Obnovit ceny" obchází cache cen (a appka se navíc sama obnovuje každých 5 minut).
Když přidáváš nový cache modul, čti/zapisuj přes `storage.ts`, ne přes `fs` napřímo (jinak spadne na Netlify).

## Basic auth
`middleware.ts` schová celý web za HTTP Basic Auth, ale jen na produkci
(`NODE_ENV=production`, tj. na Netlify) — lokální `npm run dev` běží vždy bez hesla, aby
testování appky nevyžadovalo opakované zadávání přihlašovacích údajů. Na produkci se vynucuje
jen když jsou nastavené `BASIC_AUTH_USER` + `BASIC_AUTH_PASSWORD` (jinak je web otevřený).
Creds nejsou v repu — lokálně `.env.local`, na Netlify env. Porovnání hesla je constant-time
(vlastní implementace — Edge Runtime nemá Node `crypto.timingSafeEqual`).

## Verzování
Od v1.0.0 (2026-07-11) se appka verzuje: [Keep a Changelog](https://keepachangelog.com/) formát
v `CHANGELOG.md` + [SemVer](https://semver.org/) v `package.json`. **Při každém pushi na GitHub**,
který mění chování appky (feature, fix, odebrání) — ne u čistě dokumentačních změn:
1. Přidej záznam do `CHANGELOG.md` (Added/Fixed/Changed/Removed) pod novou verzí nahoře.
2. Zvyš `version` v `package.json` (patch = fix, minor = nová featura, major = breaking změna).
3. Po pushnutí přidej git tag `vX.Y.Z` na ten commit (`git tag vX.Y.Z && git push origin vX.Y.Z`).
Čistě dokumentační push (jen README/CLAUDE.md) verzi nezvyšuje a nemusí mít changelog záznam.
Aktuální verze: viz `package.json` / [CHANGELOG.md](CHANGELOG.md) — historie tagů/pushů je popsaná
v sekci „Aktuální stav" níže, ne natvrdo tady (rychle stárne).

## Netlify deploy
`netlify.toml` + `@netlify/plugin-nextjs`. Env proměnné na Netlify: `BASIC_AUTH_*`,
volitelně `CASH_CONFIG_JSON` (spořicí účty jako JSON, protože `data/cash.json` se nedeployuje).
XTB i Revolut export se na živém webu nahraje ručně (uloží se do Blobs). Build ověříš `npm run build`.
Commit message `[skip netlify]` zabrání buildu (použij pro čistě dokumentační/metadata pushe).

## Nápady na pokračování (z PM review, neimplementováno)
1. **Panel koncentrace/rizika** — TOP1/3/5 váhy, HHI, sektorová koncentrace + flagy.
2. **Headline strip** nahoře — total return %, alfa vs S&P, Sharpe, hlavní rizikový flag.
3. **Atribuce výnosu** — top přispěvatelé / detraktoři.
4. **Přepínač CZK/USD** zobrazení (historický FX už je opravený, tohle by byl další krok).
5. **Portabilita pro jiného uživatele** (audit proveden, neopraveno — nízká priorita, dokud appku
   nesdílíš dál): `yahooSymbol()`'s exchange-suffix allowlist je uzavřená (ale teď má Yahoo-search
   fallback jako záchrannou síť); FX fallback tabulka jen pro pár měn (USD/EUR/GBP/CHF/PLN, jinde
   default 21 — špatně pro JPY/CAD/AUD apod.).

Vždy nejdřív ověř dostupnost dat (prostředí blokuje zdroje), teprve pak stav feature.

## Preference uživatele (Petr)
- **Lightweight verification** — u tohohle projektu drž ověřování lehké (curl/API check, tsc, build),
  ne opakované browser-verify smyčky se screenshoty pro malé/nízkorizikové změny. Petr to explicitně
  žádal (šetří tokeny). Screenshot tool v tomhle sandboxu navíc často vrací 0×0 rozměry (známý
  environment bug, ne chyba appky) — nespoléhej se na screenshot jako jediný důkaz, ověřuj přes
  accessibility tree / curl / DOM inspekci přes `javascript_tool`.
- **Basic Auth lokálně otravovalo** — proto teď middleware v dev módu vůbec neběží (viz výše).
- Petr je Head of IT Ops (fintech), appku staví jako osobní nástroj, ne pro širší distribuci (zatím).

## Aktuální stav (2026-07-12)
- **Nasazeno:** https://pb-portfolio-tracker.netlify.app (za basic auth) + veřejné demo bez
  hesla na `/demo` (viz README a sekci Demo níže). Repo: github.com/petrberd/portfolio-tracker.
- **Git stav:** `main` je s `origin/main` sesynchronizované (poslední push obsahoval mobilní
  UX revizi + skeleton loading v1.3.0, senior UX/UI pass v1.4.0, veřejné demo + drobné opravy
  v1.5.0, a odstranění Finnhubu/API klíče v1.6.0). Tagy `v1.0.0`–`v1.6.0` jsou všechny pushnuté.
- **Revolut import je live-otestovaný** na reálném vzorku uživatele (6 transakcí: CASH TOP-UP, BUY,
  DIVIDEND) — funguje včetně sloučení s XTB, EUR měny, a nedostupných tickerů (4COP, CEBS = evropské
  ETF, vyřešeno Yahoo search fallbackem).
- **Veřejné demo** (`/demo`, `app/demo/page.tsx`) — stejný dashboard jako ostrá appka, ale nad
  syntetickým portfoliem (`lib/demoData.ts`): reálné tickery (Apple, Microsoft, Nvidia, Amazon,
  Coca-Cola, J&J, Realty Income, Disney), vymyšlené kusy/ceny/historie transakcí. Ceny, dividendy,
  earnings i novinky jdou přes stejné živé zdroje jako produkce. Vlastní API routy pod
  `app/api/demo/{portfolio,dividends,earnings,stockdetail}` — zrcadlí produkční routy, jen čtou
  `buildDemoExport()` místo `loadExport()`. `/api/market` a `/api/analysts` se používají beze
  změny (jsou obecné, bez vazby na konkrétní portfolio). `middleware.ts` má `PUBLIC_PATHS`
  (`/demo`, `/api/demo/`, `/api/market`, `/api/analysts`), které obchází Basic Auth i na produkci —
  zbytek webu (reálná data na `/`) zůstává chráněný beze změny. Sdílené UI komponenty
  (`Kpi`, `Section`, `HoldingsTable`, …) jsou v `components/PortfolioUI.tsx`, protože Next.js
  nedovolí extra named exporty přímo z `page.tsx` souboru.
- **Finnhub odstraněn, appka teď nepotřebuje žádný API klíč** — sektor jede přes `lib/sector.ts`
  (stockanalysis.com), insider obchody přes
  `lib/nasdaqInsider.ts` (`api.nasdaq.com/api/company/<sym>/insider-trades`, funguje i pro
  NYSE, ověřeno VICI/JNJ). `lib/finnhub.ts` a `FINNHUB_API_KEY` z `.env.example`/dokumentace
  smazány.
- **`lib/transfers.ts`:** některé odchody akcií (dar „Send A Gift Transfer Out") jsou jen v Closed
  Positions, ne v Cash Operations. Detekují se tam a odečítají v positions/timeseries/dividend route
  (FIFO, bez realizovaného P/L).
- **Mobil:** grid sekce mají `grid-cols-1` základ + `min-w-0` na položkách; `overflow-x:hidden` +
  `overscroll-behavior-x:none` na html/body (jinak iOS gumové posouvání). Testováno na šířce iPhone
  16 Pro (402 px) přes same-origin iframe.
