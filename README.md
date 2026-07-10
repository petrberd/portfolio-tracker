# Portfolio Tracker

Lokální webová aplikace na sledování investičního portfolia z XTB — po vzoru Alocano / Stonkee.
Naimportuje Excel export z XTB, zrekonstruuje aktuální pozice a spočítá výkonnost proti živým cenám.

## Spuštění

```bash
npm install                 # jednorázově
cp .env.example .env.local  # volitelně: doplň FINNHUB_API_KEY (free) pro insider + sektory
npm run dev                 # http://localhost:3210
```

Při prvním otevření (bez dat) appka ukáže obrazovku **Nahrát XTB export (.xlsx)** — nahraj svůj
export z XTB (xStation → Account statement → Export). Data zůstávají lokálně ve složce `data/`
(negitignorovaná, nesdílí se). Tlačítko **Obnovit ceny** stáhne aktuální kurzy.

> Pozn.: appka se dodává **bez dat** — každý si nahraje svůj vlastní XTB export.
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

## Nasazení na Netlify

1. Nahraj repo na GitHub a v Netlify dej **Add new site → Import from Git**.
2. Build je hotový přes `netlify.toml` (`@netlify/plugin-nextjs`) — nic ručně nenastavuješ.
3. V **Site settings → Environment variables** nastav:
   - `BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD` — přihlášení k webu
   - `FINNHUB_API_KEY` — (volitelně) insider + sektory
   - `CASH_CONFIG_JSON` — (volitelně) spořicí účty jako JSON, např.
     `{"interestTaxPct":15,"accounts":[{"name":"Raiffeisenbank","balance":1000000,"ratePct":4}]}`
4. Perzistence: lokálně soubory v `data/`, na Netlify **Netlify Blobs** (read-only FS) —
   řeší `lib/storage.ts` automaticky. XTB export nahraješ přímo na živém webu, uloží se do Blobs.

> Data se na Netlify **nedeployují** (`data/` je gitignored). Portfolio nahraješ na živém webu.

## Co appka umí (MVP)

- **Hodnota portfolia v čase** — denní celková hodnota (akcie + hotovost) vs. čistě
  investovaný kapitál. Rozdíl mezi křivkami = celkový výnos.
- **Výkonnost portfolia** — zisk/ztráta v Kč za období (přepínač měsíce/roky) plus
  výnos v % jako **TWR** (time-weighted return) — nezávislý na načasování a velikosti vkladů.
- **Zisk/ztráta** — nerealizovaný (živé ceny) i realizovaný P/L, výnos v %.
- **Alokace** — rozložení podle tržní hodnoty pozic.
- **Dividendy** — přijaté dividendy po měsících, skládané podle titulu, který se na výnosu podílel.
- **Vklady** — měsíční vklady od 10/2024.
- **Analytické odhady** — 12měsíční cílová cena a rozpad doporučení (silný nákup / nákup /
  držet / prodej / silný prodej) na vybraný titul, plus potenciál vs. aktuální cena.
  Data z stockanalysis.com. Ne investiční doporučení.
- **Detail titulu** — klik na pozici otevře modal: 2letý cenový graf s tvými nákupy/prodeji,
  klíčové fundamenty (tržní kap., P/E, tržby, marže), analytici, **insider obchody** (Finnhub)
  a **newsfeed** (Yahoo RSS).
- **Výkonnost vs. trh** — portfolio (TWR) vs. S&P 500 (rebased na 100) + rizikové metriky
  (roční výnos, volatilita, max. pokles, Sharpe).
- **Alokace** — přepínač Pozice / Sektory (Finnhub) / Měny.
- **Dividendový výhled** — příjem za 12 měsíců, yield-on-cost, dividendový výnos.
- **Dividendová projekce** — očekávaný příjem na 12 měsíců z aktuálních pozic, měsíční graf
  a kalendář ex-dividend / výplat. Data z Nasdaqu (reálné ex+pay date) s fallbackem na Yahoo
  (ex-daty + odhad pay date). Ex/pay date jsou i v detailu titulu.

Insider obchody a sektory vyžadují **Finnhub API klíč** v `.env.local` (`FINNHUB_API_KEY`);
free tier stačí. Institucionální držba a cílové ceny jsou jen v placeném tieru — vynechány.

Tlačítko **Obnovit ceny** obchází cache a stáhne aktuální ceny; denní změna se počítá
z živé ceny (`regularMarketPrice`) proti poslednímu uzavřenému dennímu close.

## Jak to počítá

- **Import** (`lib/parseXtb.ts`) — čte listy *Cash Operations* a *Closed Positions*.
  Počet kusů a cenu tahá z komentářů (`OPEN BUY 0.0709 @ 994.00`).
- **Pozice** (`lib/positions.ts`) — FIFO rekonstrukce z nákupů a prodejů (výchozí účetní
  metoda XTB). Zbývající loty = aktuálně držené portfolio; cost basis je v CZK.
- **Ceny** (`lib/prices.ts`) — přímé volání veřejného Yahoo Finance chart endpointu
  (`query1`, bez API klíče). Jeden dotaz na titul dá měnu, aktuální cenu i historii.
  Kurzy CZK přes páry typu `USDCZK=X`. Ceny se cachují 6 h do `data/prices.json`.
- **Časová řada** (`lib/timeseries.ts`) — denní počty kusů × historické close × FX → hodnota v CZK.

## Data

- `data/export.json` — poslední naimportovaný export.
- `data/prices.json` — cache cen (smaž pro vynucené stažení).

Vše zůstává lokálně, nic se nikam neposílá. Jen pro osobní přehled — není to investiční poradenství.

## Technologie

Next.js 14 (App Router) · TypeScript · Recharts · SheetJS (xlsx) · Tailwind CSS.
