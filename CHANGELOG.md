# Changelog

Formát vychází z [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
verzování z [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`):
**MAJOR** = zásadní/breaking změna, **MINOR** = nová funkce, **PATCH** = oprava.

## [1.9.5] — 2026-07-14

### Changed
- **Demo portfolio (`/demo`) rozšířeno o letošní obchody** — přidáno 8 nových nákupů z roku
  2026 u existujících titulů (AAPL, MSFT, NVDA, AMZN, KO, O), měsíční vklady prodlouženy do
  2026-07, aby zůstaly kryté hotovostí. Dividendový kalendář (`buildDemoExport`) dřív
  generoval platby jen za 2024–2025, takže graf „Dividendy v čase" končil na 12/25 i po
  přidání letošních obchodů — opraveno, teď jde do aktuálního měsíce (07/26).

## [1.9.4] — 2026-07-14

### Fixed
- **Celý web pořád padal s 500/502 na produkci i po v1.9.3** — potvrzeno živě, že
  `fetch(url, { signal: AbortSignal.timeout(ms) })` v tomhle Next.js/Netlify runtime timeout
  spolehlivě nedodržuje: i `/api/market` (jediné volání na Yahoo) padalo přesně na ~30s (limit
  Netlify funkce), bez ohledu na mnohem kratší nastavený `signal` timeout. `lib/httpFetch.ts`
  přepsán na `Promise.race` proti obyčejnému `setTimeout` rejection — nezávisí na tom, jestli
  `fetch()` signál doopravdy respektuje, jen zaručí, že se volající kód dočká odpovědi/chyby
  včas.

## [1.9.3] — 2026-07-14

### Fixed
- **`/api/stockdetail` a `/api/demo/stockdetail` pořád padaly s 502 i po v1.9.2** — dvě
  místa dělají SEKVENČNÍ řetězec fallbacků, kde se timeouty sčítají: `lib/divcalendar.ts`'s
  `fetchDividendMeta` zkouší Nasdaq → stockanalysis.com → Yahoo (až 3× 8s = 24s), a
  `lib/prices.ts`'s `resolveSymbol` zkouší přímý symbol → search → až 5 kandidátů (až 7× 8s =
  56s worst case) pro dosud nerozpoznaný ticker. Timeouty zkráceny na 5s (dividend fallback)
  a 4s (symbol resolution), aby zbyla rezerva na zbytek requestu.

## [1.9.2] — 2026-07-14

### Fixed
- **Appka padala na Netlify s 500/502** (`/api/portfolio`, `/api/demo/portfolio`,
  `/api/demo/earnings` po ~30 s) — žádné externí volání (Yahoo, stockanalysis.com, Nasdaq)
  nemělo timeout, takže jedno zaseknuté/pomalé spojení zablokovalo celý request, dokud ho
  nezabil timeout Netlify funkce. Nový `lib/httpFetch.ts` (`fetchWithTimeout`, 8s) nasazen na
  všechna externí volání v `lib/{prices,analysts,sector,earnings,divcalendar,nasdaqInsider,
  fundamentals,news}.ts`. Lokálně (rychlá, spolehlivá síť) se to neprojevovalo — objevilo se
  až při skutečném nasazení a provozu na Netlify.

## [1.9.1] — 2026-07-13

### Fixed
- **Bezpečnostní tvrzení** — cílený audit (Basic Auth, upload/parsing, API vstupy, cache klíče,
  XSS povrchy, secrety, CORS, nové veřejné demo routy). Žádný kritický nález; drobné opravy:
  - Veřejné, nepřihlášené demo routy (`/api/demo/{wishlist,holding-alerts,section-visibility,
    section-order}`) neměly žádný limit na délku vstupu ani počet položek — mohly donekonečna
    růst přes `data/demo*.json`. Přidány limity (max. délka symbolu/jména/ID, max. počet
    položek) do `lib/wishlist.ts`, `lib/holdingAlerts.ts`, `lib/sectionVisibility.ts`,
    `lib/sectionOrder.ts` — platí pro produkci i demo.
  - 4 volání na stockanalysis.com (`lib/analysts.ts`, `lib/sector.ts`, `lib/earnings.ts`,
    `lib/divcalendar.ts`) neměla `encodeURIComponent` na `symbol` — sjednoceno se zbytkem kódu.
  - Basic Auth (`middleware.ts`) — `&&` mezi dvěma constant-time porovnáními (uživatel/heslo)
    prozrazovalo drobný timing signál o tom, jestli sedělo aspoň uživatelské jméno; teď se
    vyhodnocují nezávisle. `PUBLIC_PATHS` prefix matching zpřísněn (hranice na `/`), aby
    případná budoucí routa jako `/demoXYZ` omylem nespadla pod veřejnou `/demo`.
  - `/api/import` nemělo limit velikosti nahrávaného souboru — přidán limit 20 MB.
- **Zastaralé závislosti** — `postcss` 8.4.39 → 8.5.19 (moderate XSS ve stringify výstupu) a
  `glob` vynucen na patchnutou 10.5.0 přes nový `overrides` blok v `package.json` (command
  injection, jen v dev/eslint řetězci). Next.js 14→16 (více high CVE, ale major/breaking) a
  `xlsx`/SheetJS (2 high CVE, oprava jen přes vlastní CDN SheetJS, ne npm) vědomě ponechány —
  omezená expozice u obou (viz komentáře v kódu), řešení odloženo na samostatný úkol.

## [1.9.0] — 2026-07-13

### Added
- **Přepínač rozsahu grafu u detailu titulu** — 1 měsíc / 3 měsíce / 1 rok / 5 let místo
  pevných 2 let (`components/StockDetail.tsx`, `app/api/{stockdetail,demo/stockdetail}`).
  U 1měsíčního a 3měsíčního pohledu appka stahuje nitrodenní data (15min/60min svíčky
  místo denních) — na tomhle přiblížení totiž bylo vidět, že nákup/prodej tečky neseděly
  přesně na křivku (protivník: čára ukazovala denní close, ale obchod se prováděl
  nitrodenně za jinou cenu). Tečky navíc naskočí s ~1s zpožděním po vykreslení grafu
  (`lib/notifyAlerts.ts`-style fade-in), místo aby se objevily se vším najednou.
- **Plná parita `/demo` s produkcí** — wishlist, cenové alerty na pozicích a
  skrývání/přesouvání sekcí jsou teď i na veřejném demu, každé ve vlastním úložišti
  (`data/demo{Wishlist,HoldingAlerts,SectionVisibility,SectionOrder}.json`) přes nové
  `app/api/demo/{wishlist,holding-alerts,section-visibility,section-order}` routy — demo
  běží nad reálnými tickery, takže tahle data nikdy nesdílí soubor se skutečným
  portfoliem. `lib/wishlist.ts`, `lib/holdingAlerts.ts`, `lib/sectionVisibility.ts`,
  `lib/sectionOrder.ts` teď exportují tovární funkci (`createXStore(cacheKey)`) místo
  singletonu, aby šlo mít produkční i demo instanci zároveň.
- Tlačítko „Povolit notifikace v prohlížeči" přesunuto ze `Wishlist.tsx` do sdíleného
  `HoldingsTable` — dřív šlo notifikace povolit jen ze sekce Sledované tituly, i když
  alert šel nastavit i na vlastních pozicích.

### Fixed
- **VIX, earnings a dividendový kalendář se needouzovaly** — nikdy neposílaly `?refresh=1`
  na server (na rozdíl od wishlistu), takže jely na až hodinu starém cache bez ohledu na
  kliknutí „Obnovit ceny". Tlačítko navíc vůbec nezvedalo `refreshTick`, takže se tyhle
  panely needouzovaly ani jednou za 5 minut. Opraveno v `MarketMood.tsx`,
  `EarningsCalendar.tsx`, `DividendCalendar.tsx` + `app/page.tsx`.
- **„ceny z" v hlavičce ukazovalo datum importu, ne datum cen** — rozděleno na „ceny k"
  (nové pole `pricesAsOf` z `lib/prices.ts:priceFetchedAt`, reálná čerstvost cen) a
  „import portfolia" (`importedAt`, kdy byl nahrán XTB/Revolut export).
- **„oproti včerejšímu uzavření" bylo po víkendu/svátku zavádějící** — v pondělí to ve
  skutečnosti srovnávalo proti pátečnímu uzavření, ne nedělnímu. `fetchQuote()` teď vrací
  i skutečné datum použité uzávěrky a appka podle mezery v kalendářních dnech (ne podle
  dne v týdnu — funguje to i přes svátky) zobrazí „oproti uzavření z {datum}" místo
  matoucího „včerejšímu".
- **Wishlist titul tvrdil „tvé obchody", i když žádné neměl** — popisek a legenda
  nákup/prodej u grafu detailu titulu se teď zobrazí jen když titul v daném rozsahu
  opravdu má nějaké obchody (relevantní hlavně pro sledované tituly mimo portfolio).

## [1.8.0] — 2026-07-12

### Added
- **Notifikace prohlížeče (Chrome) pro cenové alerty** — u sledovaných titulů i vlastních
  pozic jde teď povolit systémovou notifikaci Chromu, která se odešle při prvním dosažení
  cíle (`lib/notifyAlerts.ts`, dedup přes localStorage, takže se nespamuje při každém
  5minutovém obnovení). Alert zůstává i vizuální (badge „🔔 Cíl dosažen"), notifikace je
  navíc — funguje jen dokud je appka otevřená v prohlížeči, žádný backend na pozadí.
  Na iPhonu (iOS) nefunguje kvůli omezení Web Notification API v mobilních prohlížečích.
- **Cenové alerty na vlastních pozicích** — sekce „Pozice" teď má stejný alert mechanismus
  jako wishlist (`lib/holdingAlerts.ts`, `app/api/holding-alerts`, `data/holdingAlerts.json`,
  klíčováno Yahoo symbolem, ne watch-listem). `/api/portfolio` obohacen o `alert` +
  `alertTriggered` na každé pozici.

### Changed
- `lib/priceAlert.ts` — sdílený `PriceAlert` typ + `alertTriggered()` mezi wishlistem a
  pozicemi (dřív jen ve `lib/wishlist.ts`).

## [1.7.0] — 2026-07-12

### Added
- **Sledované tituly (wishlist)** — nová sekce pro tituly mimo portfolio. Přidání podle
  tickeru nebo názvu firmy (autocomplete přes Yahoo search), živá cena a denní změna, cíl
  analytiků (12měsíční průměr) a potenciál v % přímo v přehledu, klik na titul otevře stejný
  detail jako u vlastní pozice (jen bez tvých obchodů). Volitelný cenový alert (nad/pod cílovou
  cenou) — čistě vizuální zvýraznění při dosažení, appka nemá backend na pozadí pro push
  notifikace. `lib/wishlist.ts`, `app/api/wishlist/*`.
- **Skrývání sekcí** — každá sekce dashboardu jde dočasně skrýt (malé „−" tlačítko v hlavičce
  s tooltipem) a zase vrátit přes chip „Skryté sekce" v horní liště. Perzistováno na serveru,
  takže se nastavení drží napříč zařízeními. `lib/sectionVisibility.ts`, `app/api/section-visibility`.
- **Přesouvání sekcí (drag & drop)** — sekce jdou přetáhnout za úchyt „⠿" a přeuspořádat podle
  potřeby; pořadí se ukládá stejně jako viditelnost (napříč zařízeními). Použito `dnd-kit`
  (myš, dotyk i klávesnice). Alokace+Pozice+Earnings a Dividendy+Vklady se přesouvají jako
  jeden blok, aby zůstalo zachované side-by-side rozložení na desktopu. `lib/sectionOrder.ts`,
  `app/api/section-order`.
- **Srozumitelnější „bez pokrytí" stavy** — když titul nemá analytické odhady (např. DJT),
  appka to teď jasně řekne na všech třech místech (hlavní panel, detail titulu, wishlist)
  místo tichého prázdna nebo obecné hlášky.

## [1.6.0] — 2026-07-12

### Changed
- **Appka už nepotřebuje žádný API klíč.** Sektor přesunut z Finnhubu na stockanalysis.com
  (`lib/sector.ts`, `infoTable` pole ze stejného `__data.json`, který už appka používala pro
  analytiky/earnings). Insider obchody přesunuty z Finnhubu na Nasdaq
  (`lib/nasdaqInsider.ts`, `api.nasdaq.com/api/company/<sym>/insider-trades`) — na rozdíl od
  Nasdaq dividendového endpointu funguje i pro NYSE tickery (ověřeno na VICI, JNJ, Realty
  Income). Nasdaq vrací typ transakce jako text, ne signed kód — nákup/prodej se odvozuje
  z `BUY_TYPES`/`SELL_TYPES` množin, nejednoznačné typy (např. „Option Execute") se zahazují.

### Removed
- `lib/finnhub.ts` a `FINNHUB_API_KEY` (z `.env.example` i dokumentace) — appka žádný Finnhub
  volání už nedělá.

## [1.5.0] — 2026-07-12

### Added
- **Veřejné demo bez přihlášení** na `/demo` (https://pb-portfolio-tracker.netlify.app/demo) —
  stejný dashboard jako ostrá appka, ale nad syntetickým portfoliem (`lib/demoData.ts`): reálné,
  rozpoznatelné tickery (Apple, Microsoft, Nvidia, Amazon, Coca-Cola, Johnson & Johnson,
  Realty Income, Disney), vymyšlené počty kusů, nákupní ceny a historie transakcí. Ceny,
  dividendy, earnings i novinky jsou živé — jedou přes stejné zdroje jako produkce
  (`app/api/demo/{portfolio,dividends,earnings,stockdetail}`). Zbytek webu (reálná data na `/`)
  zůstává za Basic Authem beze změny — v `middleware.ts` je jen `/demo` a jeho podpůrné API
  routy (`/api/demo/*`, `/api/market`, `/api/analysts`) výslovně veřejné.

### Fixed
- **Graf historie VIX měl na ose Y nesmyslná čísla** (např. „97119" místo „13") — chyběl
  `tickFormatter`, takže se zobrazovaly syrové desetinné hodnoty s plovoucí čárkou
  (`13.029999732971191`), oříznuté úzkou šířkou osy na nečitelný zbytek. Opraveno zaokrouhlením.
- **Osa Y u „Hodnota portfolia" a „Výkonnost portfolia"** rezervovala víc místa, než popisky
  potřebovaly (72px a 64px) — zúženo na 52px/48px s nulovým levým marginem, graf má víc
  prostoru a čísla sedí blíž k levému okraji karty.
- **Detail titulu (StockDetail) nebyl na mobilu horizontálně "zafixovaný"** — pozadí za modálem
  se mohlo posouvat nezávisle, což na iOS Safari při momentum scrollu působilo jako drift celého
  okna. Modál teď při otevření uzamkne scroll stránky pod sebou (`document.body.style.overflow`)
  a má `overflow-x-hidden` jako pojistku.

### Changed
- Sdílené UI komponenty dashboardu (`Kpi`, `Section`, `HoldingsTable`, `TaxTestTable`, …)
  přesunuty z `app/page.tsx` do `components/PortfolioUI.tsx`, aby je mohla používat i `/demo`
  stránka — Next.js nedovolí extra named exporty přímo z `page.tsx` souboru.

## [1.4.0] — 2026-07-11

### Added
- **Headline strip** nahoře stránky — roční výnos portfolia (TWR, p.a.) jako hero číslo +
  „Max. pokles" jako rizikový flag, hned pod hlavičkou, před KPI dlaždicemi. Odstraněna
  duplicita: tyto dvě hodnoty už se nezobrazují znovu v „Výkonnost vs. trh" (tam zůstává
  jen Volatilita a Sharpe ratio).
- **Seskupení malých pozic do „Ostatní"** v alokačním grafu — nad 8 položek se cokoliv pod
  3 % podílu sloučí do jedné položky legendy, aby zůstala čitelná i s 13+ pozicemi.
- **Slovní popisky na obou koncích gauge** (Nadhodnoceno/Podhodnoceno u Férové ceny,
  Panika/Klid u VIX) — směr škály už nezávisí jen na zapamatování si barvy.
- **Success stav u „Obnovit ceny"** — po dokončení refreshe se tlačítko na 2 s změní na
  „✓ Aktualizováno" (zelený rámeček), místo tichého návratu na původní label.
- Jemná ilustrace na pozadí prázdného stavu (appka bez nahraných dat).

### Changed
- **Sjednocená paleta** pro alokační graf — soudržná modro-tyrkysovo-jantarová škála místo
  patnácti nesourodých barev vedle sebe.
- **Vizuální hierarchie sekcí** — Nálada trhu, Earnings kalendář a Daňový přehled mají teď
  tišší styl (menší nadpis, bez stínu, průhlednější pozadí), aby primární sekce (Hodnota,
  Výkonnost, Alokace, Pozice) měly první nárok na pozornost.
- Karty mají teď jemný statický stín (ne hover — většina karet není klikatelná, hover by
  zavádějící naznačoval interaktivitu).
- Všechny KPI a mini-stat hodnoty mají `tabular-nums`, aby při refreshi cen čísla neposkakovala.
- Nulová referenční čára v grafu Výkonnosti portfolia je teď výraznější než gridlines.

## [1.3.0] — 2026-07-11

### Added
- **Skeleton loading placeholders** (shimmer bloky místo textu „Načítám…") pro detail titulu,
  earnings/dividendový kalendář, náladu trhu (VIX) a analytické odhady, s jemným fade-in po
  načtení dat.

### Fixed
- **Mobilní revize (iPhone 16 Pro, 402 px) — osa X u „Výkonnost portfolia"** byla nečitelná
  (všechny měsíce natlačené vodorovně přes sebe). Na mobilu se teď popisky natočí o -45° a při
  více než 6 sloupcích se zobrazuje jen každý druhý.
- **Sekce Pozice na mobilu** skrývala kusy/průměrnou cenu/aktuální cenu/podíl (`hidden sm:table-cell`).
  Tyto údaje se teď zobrazují jako sbalený druhý řádek pod názvem titulu, takže je vidět totéž
  co na desktopu, jen kompaktněji. Stejný vzor aplikován i na Dividendový kalendář a Daňový přehled.
- **Vysvětlivky (ⓘ) fungovaly jen na hover** — na dotykových zařízeních byly fakticky nedostupné.
  Teď se otevírají klepnutím a zavírají klepnutím mimo; dotyková plocha ikonky zvětšena z ~14 px
  na 24 px.
- Přepínací tlačítka (Měsíce/Roky, alokace) zvětšena na min. 44 px výšky (dotykový standard).
- Řádky insider obchodů v detailu titulu teď zalamují přes více řádků místo natlačení do jednoho.
- Zavírací tlačítko (✕) v detailu titulu má teď kruhové orámování a hover pozadí, konzistentní
  s ostatními tlačítky v appce.
- Popisky „(odhad)" zvětšeny a zesvětleny (byly 10-11 px při nízké opacitě, hraničily s WCAG AA).
- Hlavička analytického panelu (výběr titulu + rating) teď zalamuje na užších obrazovkách.

## [1.2.1] — 2026-07-11

### Fixed
- **Univerzální dohledání tickeru na Yahoo**, místo natvrdo zadaného `.DE` (Xetra) fallbacku.
  Zkusí ticker rovnou, a pokud nemá data, zeptá se Yahoo vyhledávacího API a vezme první
  reálně fungující výsledek — ověřeno na skutečných datech napříč různými burzami. Výsledek
  se trvale cachuje, takže se hledání spustí jen jednou za ticker.
- Ověřeno end-to-end s reálnými EUR pozicemi (4COP, CEBS) — formátování měny, denní změna,
  FIFO cost basis, daňový časový test i „nedostupné" hláška u ETF v analytických odhadech
  fungují správně.

## [1.2.0] — 2026-07-11

### Added
- **Import z Revolutu** (.csv export ze Stocks účtu), sloučený do jednoho společného
  portfolia s XTB — FIFO, dividendy i grafy fungují napříč oběma brokery beze změny.
  Přepočet do CZK jde přes Revolutem uváděný kurz u každé transakce (ověřeno na reálných
  datech). Nahrávací tlačítka pro XTB a Revolut jsou teď oddělená.
- Jednorázový fallback `.DE` (Xetra) na dohledání ceny, když Revolut ticker bez burzovní
  přípony neresolvuje na Yahoo napřímo (ověřeno na dvou reálně držených evropských ETF).

### Known limitations
- Revolut export neobsahuje burzovní příponu u tickeru — `.DE` fallback není obecné řešení
  pro všechny burzy, jen běžný odhad pro evropské tituly.

## [1.1.0] — 2026-07-11

### Fixed
- **Denní změna % byla ve skutečnosti meziměsíční.** `fetchQuote` počítala "denní" změnu
  z `chart.closes`, což je data z `range=max` dotazu — Yahoo u něj vrací jen měsíční
  granularitu, takže "předchozí" bod byl konec předchozího měsíce, ne včerejšek. Postihovalo
  to denní změnu u všech pozic v tabulce i u VIX (proto vypadala skoro pořád jako ~0 %).
  Opraveno — počítá se teď ze skutečných denních dat.

### Changed
- Basic Auth se teď vynucuje jen na produkci (Netlify) — lokální `npm run dev` běží bez hesla.
- Gauge u VIX zrcadlově obrácen jako u Férové ceny (nejklidnější hodnota vpravo).
- Graf historie VIX má osu Y ořezanou na rozsah dat, ne od nuly — výkyvy jsou vidět.

## [1.0.0] — 2026-07-11

První oficiálně verzovaná release — shrnuje vše postavené od začátku projektu do teď.

### Added
- Import XTB exportu (.xlsx), FIFO rekonstrukce pozic, cost basis v CZK.
- Hodnota portfolia v čase, výkonnost (TWR) po měsících/rocích, realizovaný i nerealizovaný P/L.
- Volná hotovost (externí spořicí účty) jako oddělená KPI od hotovosti na XTB účtu.
- Alokace portfolia (pozice / sektory / měny).
- Dividendy v čase + dividendová projekce na 12 měsíců (ex/pay date z Nasdaqu → stockanalysis.com
  → Yahoo fallback), průměrný měsíční vklad.
- Analytické odhady (rating + rozpad doporučení) s gaugem „Férová cena".
- Detail titulu: cenový graf s obchody, fundamenty, insider obchody (Finnhub), newsfeed.
- Earnings kalendář — nejbližší termín výsledků per titul, s odhadem když web ještě nemá
  aktuální datum.
- Daňový přehled — časový test (§4/1/w ZDP) po FIFO tranších + roční hodnotový limit 100 000 Kč.
- Výkonnost vs. trh — S&P 500 Total Return benchmark + rizikové metriky (volatilita, max.
  pokles, Sharpe).
- Nálada trhu — VIX gauge + graf historie.
- Basic Auth (celá appka), auto-refresh živých dat každých 5 minut, favicon.
- Bezpečnostní review (viz README) — constant-time Basic Auth porovnání, zpřísněný error handling.

### Fixed
- Historické hodnoty portfolia počítané dobovým FX kurzem, ne dnešním.
- Chart start dates (výkonnost, dividendy, vklady) odvozené z reálných dat účtu, ne natvrdo
  zadané datum.
- Benchmark graf dynamicky volí dostatečný rozsah historie (dřív natvrdo `2y`, tiše by se
  usekl u staršího účtu).
- Přesčítané VICI akcie kvůli nezachycenému daru mimo Cash Operations.
- Rozbité analytické odhady po redesignu stockanalysis.com.
- Mobilní horizontální přetékání a posun stránky při tažení grafů.

### Removed
- Sekce „Smart Money" (sledování 13F filings super investorů + insider Form 4 obchodů přes
  SEC EDGAR) — přidána a následně odebrána v rámci stejného vývojového cyklu, layout se ukázal
  jako moc rozsáhlý na přínos.

---

Nápady na další verze jsou v [CLAUDE.md](CLAUDE.md#nápady-na-pokračování-z-pm-review-neimplementováno).
