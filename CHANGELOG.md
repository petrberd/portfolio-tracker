# Changelog

Formát vychází z [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
verzování z [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`):
**MAJOR** = zásadní/breaking změna, **MINOR** = nová funkce, **PATCH** = oprava.

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
