# Portfolio Tracker

[![Version](https://img.shields.io/badge/version-1.5.0-blue)](CHANGELOG.md)

Lokální webová aplikace na sledování investičního portfolia z **XTB a/nebo Revolutu** —
po vzoru Alocano / Stonkee. Naimportuje export z brokera(ů), zrekonstruuje aktuální pozice
a spočítá výkonnost proti živým cenám. Oba brokery lze mít nahrané současně — appka je
sloučí do jednoho společného portfolia.

Co je nového: [CHANGELOG.md](CHANGELOG.md).

## Demo

Veřejná ukázka bez přihlášení: **https://pb-portfolio-tracker.netlify.app/demo**

Ukázkové portfolio s reálnými, rozpoznatelnými tickery (Apple, Microsoft, Nvidia, Amazon,
Coca-Cola, Johnson & Johnson, Realty Income, Disney) — ceny, dividendy, earnings a novinky
jsou živé (stejné API jako ostrá appka), ale počty kusů, nákupní ceny a historie transakcí
jsou vymyšlené (`lib/demoData.ts`). Zbytek webu (`/`, kořenová appka s reálnými daty) zůstává
za Basic Authem beze změny — jen `/demo` a jeho podpůrné API routy (`/api/demo/*`,
`/api/market`, `/api/analysts`) jsou v `middleware.ts` výslovně veřejné.

## Spuštění

```bash
npm install                 # jednorázově
cp .env.example .env.local  # volitelně: doplň FINNHUB_API_KEY (free) pro insider + sektory
npm run dev                 # http://localhost:3210
```

Při prvním otevření (bez dat) appka ukáže obrazovku pro nahrání exportu — **XTB** (xStation →
Account statement → Export, `.xlsx`) a/nebo **Revolut** (Stocks → account statement, `.csv`).
Data zůstávají lokálně ve složce `data/` (negitignorovaná, nesdílí se). Tlačítko
**Obnovit ceny** stáhne aktuální kurzy.

> Pozn.: appka se dodává **bez dat** — každý si nahraje svůj vlastní export. Basic Auth se
> vynucuje jen na produkci (Netlify) — lokální `npm run dev` běží bez hesla.
> Bez `FINNHUB_API_KEY` appka funguje, jen skryje insider obchody a sektorovou alokaci
> (klíč zdarma na finnhub.io). Kontext pro další vývoj s Claude je v [CLAUDE.md](CLAUDE.md).

## Basic auth (skrytí celé stránky)

Nastav v `.env.local` (lokálně) nebo v env proměnných na Netlify:

```
BASIC_AUTH_USER=...
BASIC_AUTH_PASSWORD=...
```

Když jsou obě vyplněné, celý web (i API) se schová za přihlašovací dialog (HTTP Basic Auth,
řeší `middleware.ts`). Když jsou prázdné, web je bez hesla.

## Security review (2026-07-11)

Proběhla bezpečnostní kontrola zaměřená hlavně na to, jestli se dá ze stránky získat cokoliv
bez znalosti Basic Auth hesla. Výsledek: **ne** — `middleware.ts` gatuje úplně vše (stránku
i všechny API routy) kromě staticky kompilovaných Next.js assetů (`_next/static`, `_next/image`,
`favicon.ico`), které žádná data neobsahují. Aplikace navíc není staticky exportovaná, takže
žádná data nejsou "zapečená" v buildu.

Nalezené a opravené drobnosti:
- Porovnání Basic Auth hesla bylo přes `===`, což teoreticky umožňuje timing útok — nahrazeno
  vlastním constant-time porovnáním (Edge Runtime nemá Node `crypto.timingSafeEqual`).
- Chybové hlášky z importu (`/api/import`) se vracely klientovi včetně detailu výjimky —
  teď jde jen obecná zpráva, detail se loguje jen na serveru.
- Lokální auto-import endpoint (`GET /api/import`, čte soubor z nadřazené složky) je teď
  explicitně vypnutý mimo `NODE_ENV=development`, aby nezávisel jen na tom, že na Netlify
  je nadřazená složka prázdná.

Známé, vědomě přijaté riziko: knihovna `xlsx` (SheetJS) má na npm neopravené CVE
(prototype pollution, ReDoS) — oficiální fix existuje jen na vlastním CDN SheetJS, ne na npm,
takže by šlo o závislost mimo běžný registry. Zneužitelné jen nahráním škodlivého `.xlsx`
přes `/api/import`, což je endpoint jen pro jednoho důvěryhodného uživatele za Basic Authem —
reálné riziko je zanedbatelné.

## Nasazení na Netlify

1. Nahraj repo na GitHub a v Netlify dej **Add new site → Import from Git**.
2. Build je hotový přes `netlify.toml` (`@netlify/plugin-nextjs`) — nic ručně nenastavuješ.
3. V **Site settings → Environment variables** nastav:
   - `BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD` — přihlášení k webu
   - `FINNHUB_API_KEY` — (volitelně) insider + sektory
   - `CASH_CONFIG_JSON` — (volitelně) spořicí účty jako JSON, např.
     `{"interestTaxPct":15,"accounts":[{"name":"Raiffeisenbank","balance":1000000,"ratePct":4}]}`
4. Perzistence: lokálně soubory v `data/`, na Netlify **Netlify Blobs** (read-only FS) —
   řeší `lib/storage.ts` automaticky. XTB i Revolut export nahraješ přímo na živém webu, uloží se do Blobs.

> Data se na Netlify **nedeployují** (`data/` je gitignored). Portfolio nahraješ na živém webu.

## Co appka umí

### Portfolio a výkonnost
- **Hodnota portfolia v čase** — denní celková hodnota (akcie + hotovost) vs. čistě
  investovaný kapitál. Rozdíl mezi křivkami = celkový výnos. Ceny i FX kurzy se přepočítávají
  **dobovým kurzem** platným ten den, ne dnešním — historie tak nemíchá cenový a měnový efekt.
- **Výkonnost portfolia** — zisk/ztráta v Kč za měsíc/rok (přepínač) plus výnos v % jako
  **TWR** (time-weighted return) — nezávislý na načasování a velikosti vkladů. Start grafu
  (i dividend, vkladů) se odvozuje automaticky od prvního obchodu na účtu, ne z natvrdo
  zadaného data — funguje i pro účet s jinou historií.
- **Zisk/ztráta** — nerealizovaný (živé ceny) i realizovaný P/L, výnos v %.
- **Volná hotovost** — spořicí účty mimo brokerské účty (`data/cash.json` lokálně /
  `CASH_CONFIG_JSON` na Netlify), oddělená KPI od hotovosti přímo na XTB/Revolut účtu.
  Dlaždice se schová, když žádné externí účty nejsou nastavené.
- **Alokace** — přepínač Pozice / Sektory (Finnhub) / Měny.
- **Vklady** — měsíční vklady + průměrný vklad za měsíc.
- **Výkonnost vs. trh** — portfolio (TWR) vs. **S&P 500 Total Return** (`^SP500TR`, vč.
  reinvestovaných dividend — fér srovnání proti portfoliu, které dividendy taky počítá do
  výkonnosti) + rizikové metriky (roční výnos, volatilita, max. pokles, Sharpe ratio).
- **Nálada trhu** — VIX (index očekávané volatility S&P 500, „index strachu") — aktuální
  hodnota s gaugem a klasifikací klid/nervozita/strach/panika, plus graf historie
  (~6 měsíců, denní data) s referenčními čarami na úrovních 20/30.

### Analýza a výhled
- **Analytické odhady** — rozpad doporučení (silný nákup … silný prodej) + gauge „Férová
  cena" (odhad analytiků vs. aktuální cena, barevná škála podhodnoceno → nadhodnoceno).
  Data z stockanalysis.com. Ne investiční doporučení.
- **Detail titulu** — klik na pozici otevře modal: 2letý cenový graf s tvými nákupy/prodeji,
  klíčové fundamenty (tržní kap., P/E, tržby, marže), analytici, **insider obchody** (Finnhub)
  a **newsfeed** (Yahoo RSS).
- **Earnings kalendář** — kompaktní box (pod Alokací portfolia) s nejbližším termínem
  výsledků pro každý titul v portfoliu (stockanalysis.com); pokud je poslední známé datum
  už v minulosti, appka ho odhadne o ~91 dní dopředu (typická čtvrtletní kadence) a označí
  „(odhad)".
- **Dividendová projekce** — očekávaný příjem na 12 měsíců z aktuálních pozic (podle počtu
  kusů k ex-dni, ne dnešního), rozpad po titulech/účtech, a kalendář ex-dividend/výplat.
  Ex/pay date z Nasdaqu (reálné, jen Nasdaq-listed) → fallback stockanalysis.com (taky reálné
  datum, i pro NYSE) → fallback Yahoo (ex-datum reálné, pay datum odhad).
- **Daňový přehled** — časový test (§4/1/w ZDP): po jednotlivých FIFO tranších ukáže, kolik
  kusů je už přes 3 roky osvobozeno a kdy se osvobodí další tranše; plus roční hodnotový
  limit 100 000 Kč (hrubý příjem z prodeje CP za kalendářní rok). Orientační výpočet, ne
  daňové poradenství.

Insider obchody a sektory (v detailu titulu) vyžadují **Finnhub API klíč** v `.env.local`
(`FINNHUB_API_KEY`); free tier stačí. Institucionální držba a cílové ceny (Finnhub) jsou jen
v placeném tieru — vynechány.

> Analytické odhady, earnings kalendář a insider obchody čerpají z US-centrických zdrojů
> (stockanalysis.com, Finnhub) — u evropských titulů z Revolutu (např. ETF bez US listingu)
> proto tahle data většinou nebudou k dispozici; appka to poctivě ukáže jako „nedostupné",
> ne jako chybu. Ceny, FX, pozice, dividendy a daňový časový test fungují pro oba brokery stejně.

Tlačítko **Obnovit ceny** obchází cache a stáhne aktuální ceny; appka se navíc sama obnovuje
každých 5 minut. Denní změna se počítá z živé ceny (`regularMarketPrice`) proti poslednímu
uzavřenému dennímu close.

## Jak to počítá

- **Import** — `lib/parseXtb.ts` čte listy *Cash Operations* a *Closed Positions* z XTB
  Excelu (počet kusů a cenu tahá z komentářů typu `OPEN BUY 0.0709 @ 994.00`).
  `lib/parseRevolut.ts` čte Revolut CSV (`Date, Ticker, Type, Quantity, Price per share,
  Total Amount, Currency, FX Rate`) — peněžní pole mají měnu jako textový prefix
  (`"EUR 150"`), do CZK se přepočítávají přes Revolutem uváděný `FX Rate` u každé
  transakce (`CZK = částka / FX Rate`). Oba parsery produkují stejný `CashOp[]` tvar,
  takže zbytek appky (FIFO, dividendy, grafy) běží nezávisle na brokerovi.
- **Uložení + sloučení** (`lib/store.ts`) — každý broker má vlastní soubor
  (`export.json` pro XTB, `export-revolut.json` pro Revolut); při čtení se sloučí do
  jednoho portfolia (spojené `cashOps` seřazené chronologicky).
- **Pozice** (`lib/positions.ts`) — FIFO rekonstrukce z nákupů a prodejů (výchozí účetní
  metoda XTB, použitá stejně pro sloučená data). Zbývající loty = aktuálně držené
  portfolio (vč. data nákupu pro časový test); cost basis je v CZK. Počítá i roční hrubý
  příjem z prodejů (`taxYearSoldCzk`).
- **Ceny** (`lib/prices.ts`) — přímé volání veřejného Yahoo Finance chart endpointu
  (`query1`, bez API klíče). Jeden dotaz na titul dá měnu, aktuální cenu i historii.
  Ceny se cachují 1 h do `data/prices.json` (tlačítko „Obnovit ceny" cache obchází).
  Revolut export nemá u tickeru burzovní příponu (na rozdíl od XTB `MU.US`) — když holý
  ticker na Yahoo nic nevrátí, appka se zeptá Yahoo vyhledávacího API a vezme první reálně
  fungující výsledek (funguje napříč burzami, ne jen pro jednu konkrétní); výsledek se
  trvale cachuje, takže se hledání spustí jen jednou za ticker.
- **Časová řada** (`lib/timeseries.ts`) — denní počty kusů × historické close × **dobový**
  FX kurz (ne dnešní) → hodnota v CZK. Benchmark vs. S&P 500 Total Return volí nejmenší
  dostatečný rozsah historie (1y/2y/5y/10y), aby se u staršího účtu tiše neuseknul.
- **Daňový časový test** (`lib/taxtest.ts`) — čistě výpočetní, žádné externí volání: exemptDate
  = nákup + 3 roky + 1 den, po jednotlivých FIFO tranších.
- **Dividendový kalendář** (`lib/divcalendar.ts`) — ex/pay date + frekvence per titul,
  s fallback řetězcem Nasdaq → stockanalysis.com → Yahoo (viz výše).
- **Earnings** (`lib/earnings.ts`) a **analytici** (`lib/analysts.ts`) — stockanalysis.com,
  SvelteKit „devalue" formát (`__data.json`), stejný parsing pattern v obou modulech.

## Data

Lokálně v `data/` (gitignored), na Netlify přes Netlify Blobs (`lib/storage.ts`):

- `export.json` — poslední naimportovaný XTB export.
- `export-revolut.json` — poslední naimportovaný Revolut export (volitelné, odděleně od XTB).
- `prices.json`, `fundamentals.json`, `analysts.json`, `finnhub.json`, `divcal.json`,
  `earnings.json` — cache jednotlivých datových zdrojů (smaž pro vynucené stažení; TTL se
  liší modul od modulu, viz komentáře v `lib/`).
- `cash.json` — externí spořicí účty (volitelné, `.env.example`/README výše).

Vše zůstává lokálně, nic se nikam neposílá. Jen pro osobní přehled — není to investiční poradenství.

## Technologie

Next.js 14 (App Router) · TypeScript · Recharts · SheetJS (xlsx) · Tailwind CSS.
