# Changelog

Formát vychází z [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
verzování z [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`):
**MAJOR** = zásadní/breaking změna, **MINOR** = nová funkce, **PATCH** = oprava.

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
