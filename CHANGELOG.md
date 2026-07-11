# Changelog

Formát vychází z [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
verzování z [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`):
**MAJOR** = zásadní/breaking změna, **MINOR** = nová funkce, **PATCH** = oprava.

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
