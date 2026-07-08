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
- `lib/store.ts` — persistence naimportovaného exportu do `data/export.json`.
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

## Cache & data
`data/*.json` (gitignored): `export.json` (import), `prices.json`, `fundamentals.json`, `finnhub.json`,
`analysts.json`, `divcal.json`. Smazáním souboru se vynutí re-fetch. Tlačítko „Obnovit ceny" obchází cache cen.

## Nápady na pokračování (z PM review, neimplementováno)
1. **Panel koncentrace/rizika** — TOP1/3/5 váhy, HHI, sektorová koncentrace + flagy (portfolio je hodně
   koncentrované: TOP5 ~80 %, Real Estate ~43 %, 100 % USD neháhdgeováno).
2. **Headline strip** nahoře — total return %, alfa vs S&P, Sharpe, hlavní rizikový flag.
3. **Férový benchmark** — S&P total-return index (vč. dividend) místo cenového `^GSPC` + přepínač CZK/USD.
4. **Atribuce výnosu** — top přispěvatelé / detraktoři.
5. Oprava FX na historický kurz (viz zjednodušení výše).

Vždy nejdřív ověř dostupnost dat (prostředí blokuje zdroje), teprve pak stav feature.
