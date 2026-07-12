"use client";

import { useCallback, useEffect, useState } from "react";
import { czk, pct, shortDate } from "@/lib/format";
import {
  AllocationPie,
  BenchmarkChart,
  DepositsChart,
  DividendStackedChart,
  PerformanceChart,
  ValueChart,
} from "@/components/Charts";
import { AnalystPanel } from "@/components/Analysts";
import { EarningsCalendar } from "@/components/EarningsCalendar";
import { MarketMood } from "@/components/MarketMood";
import { StockDetail } from "@/components/StockDetail";
import { DividendCalendar } from "@/components/DividendCalendar";
import { InfoTip } from "@/components/InfoTip";
import { ANNUAL_VALUE_LIMIT_CZK } from "@/lib/taxtest";
import {
  addMonths,
  monthYear,
  Kpi,
  MiniStat,
  Section,
  Toggle,
  HoldingsTable,
  TaxTestTable,
  Splash,
  Empty,
} from "@/components/PortfolioUI";

type Data = any;

/**
 * Public, no-login demo of the dashboard: same UI and calculations as the real
 * app, but fed from a synthetic portfolio (lib/demoData.ts + /api/demo/*) —
 * real, recognizable tickers so prices/dividends/news are genuinely live, but
 * every share count and purchase price is made up, not anyone's real account.
 */
export default function DemoPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [perfMode, setPerfMode] = useState<"monthly" | "yearly">("monthly");
  const [allocMode, setAllocMode] = useState<"pozice" | "sektory" | "meny">("pozice");
  const [detail, setDetail] = useState<{ ticker: string; instrument: string } | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [justRefreshed, setJustRefreshed] = useState(false);

  const load = useCallback(async (force = false) => {
    force ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const qs = force ? "?refresh=1" : "";
      const res = await fetch(`/api/demo/portfolio${qs}`, { cache: "no-store" });
      const json = await res.json();
      setData(json);
      if (force) {
        setJustRefreshed(true);
        setTimeout(() => setJustRefreshed(false), 2000);
      }
    } catch (e: any) {
      setError(e?.message ?? "Načtení selhalo.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      load(true);
      setRefreshTick((t) => t + 1);
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  if (loading && !data) return <Splash msg="Načítám ukázkové portfolio a stahuji živé ceny…" />;

  if (!data?.imported) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold mb-2">Portfolio Tracker — demo</h1>
        <p className="text-muted">{error ?? "Demo se nepodařilo načíst, zkus obnovit stránku."}</p>
      </div>
    );
  }

  const s = data.summary;
  const holdings = data.holdings as any[];

  const firstOpMonth = (s.firstOpDate as string)?.slice(0, 7) || "";
  const secondFullMonth = firstOpMonth ? addMonths(firstOpMonth, 1) : "";
  const VALUE_FROM = secondFullMonth ? `${secondFullMonth}-01` : "";
  const DEPOSITS_FROM = secondFullMonth;
  const PERFORMANCE_FROM = secondFullMonth;
  const DIVIDENDS_FROM = (s.dividendByMonth as any[])?.[0]?.month ?? firstOpMonth;

  const series = (data.series as any[]).filter((p) => p.date >= VALUE_FROM);
  const perf = ((data.performance?.[perfMode] ?? []) as any[]).filter(
    (p) => perfMode !== "monthly" || p.period >= PERFORMANCE_FROM
  );
  const benchmark = (data.benchmark ?? []) as any[];
  const risk = data.risk as any;

  const groupSum = (keyFn: (h: any) => string) => {
    const m = new Map<string, number>();
    for (const h of holdings) {
      if (h.marketValueCzk <= 0) continue;
      const k = keyFn(h) || "Ostatní";
      m.set(k, (m.get(k) ?? 0) + h.marketValueCzk);
    }
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };
  const allocRaw =
    allocMode === "sektory"
      ? groupSum((h) => h.sector)
      : allocMode === "meny"
      ? groupSum((h) => h.currency)
      : holdings.filter((h) => h.marketValueCzk > 0).map((h) => ({ name: h.instrument, value: h.marketValueCzk }));
  const alloc = (() => {
    if (allocRaw.length <= 8) return allocRaw;
    const total = allocRaw.reduce((sum, a) => sum + a.value, 0);
    const big = allocRaw.filter((a) => a.value / total >= 0.03);
    const small = allocRaw.filter((a) => a.value / total < 0.03);
    if (!small.length) return allocRaw;
    const otherValue = small.reduce((sum, a) => sum + a.value, 0);
    return [...big, { name: `Ostatní (${small.length})`, value: otherValue }];
  })();

  const deposits = (s.cashflowByMonth as any[])
    .filter((m) => m.month >= DEPOSITS_FROM)
    .map((m) => ({ month: m.month, deposits: m.deposits }));
  const avgMonthlyDeposit = deposits.length ? deposits.reduce((sum, d) => sum + d.deposits, 0) / deposits.length : 0;

  const dividendRows = (s.dividendByMonth as any[]).filter((r) => r.month >= DIVIDENDS_FROM);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Demo banner */}
      <div className="card p-4 mb-6 flex flex-wrap items-center justify-between gap-3 border-brand/40 bg-brand/5">
        <p className="text-sm">
          <span className="font-semibold text-brand">Demo</span>{" "}
          <span className="text-muted">
            — ukázkové portfolio. Ceny, dividendy a novinky jsou živé (skutečné tickery), ale kusy, nákupní ceny a
            historie transakcí jsou vymyšlené.
          </span>
        </p>
        <a
          href="https://github.com/petrberd/portfolio-tracker"
          target="_blank"
          rel="noreferrer"
          className="text-sm px-3 py-2 rounded-xl border border-line hover:bg-panel2 transition shrink-0"
        >
          ↗ Zdrojový kód na GitHubu
        </a>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Portfolio Tracker</h1>
          <p className="text-muted text-sm mt-1">
            Ukázkové portfolio · {holdings.length} otevřených pozic · ceny z {shortDate(data.importedAt)}
          </p>
        </div>
        <div className="flex items-center">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className={`text-sm px-3 py-2 rounded-xl border transition disabled:opacity-50 ${
              justRefreshed ? "border-pos/40 text-pos" : "border-line hover:bg-panel2"
            }`}
          >
            {refreshing ? "Stahuji…" : justRefreshed ? "✓ Aktualizováno" : "↻ Obnovit ceny"}
          </button>
          <InfoTip text="Ihned stáhne aktuální ceny akcií, kurz a rating analytiků (jinak se stránka sama obnovuje každých 5 minut)." />
        </div>
      </div>

      {error && <p className="text-neg mb-4 text-sm">{error}</p>}

      {/* Headline */}
      {risk && (
        <div className="card p-5 mb-6 flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <div className="stat-label">
              Roční výnos portfolia (TWR, p.a.)
              <InfoTip text="Anualizovaný time-weighted výnos portfolia (nezávislý na načasování a velikosti vkladů)." />
            </div>
            <div className={`text-3xl font-semibold mt-1 tabular-nums ${(risk.annualizedReturn ?? 0) >= 0 ? "text-pos" : "text-neg"}`}>
              {pct((risk.annualizedReturn ?? 0) * 100)}
            </div>
          </div>
          <span
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg text-neg bg-neg/10"
            title="Největší propad z vrcholu na následné dno (max drawdown) za sledované období."
          >
            Max. pokles {((risk.maxDrawdown ?? 0) * 100).toFixed(1)} %
          </span>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Kpi
          label="Tržní hodnota"
          value={czk(s.totalMarketValue + (s.xtbCash ?? 0))}
          sub={`vč. volných ${czk(s.xtbCash ?? 0)}`}
          hint="Celková hodnota účtu: tržní hodnota držených akcií (kusy × živá cena × kurz) + volné nezainvestované prostředky."
        />
        <Kpi
          label="Nerealizovaný zisk"
          value={czk(s.totalUnrealized)}
          sub={pct(s.totalUnrealizedPct)}
          tone={s.totalUnrealized >= 0 ? "pos" : "neg"}
          hint="Tržní hodnota mínus pořizovací cena držených akcií — zisk na papíře, dokud neprodáš. % je vůči pořizovací ceně."
        />
        <Kpi
          label="Realizovaný zisk"
          value={czk(s.totalRealizedPnl)}
          tone={s.totalRealizedPnl >= 0 ? "pos" : "neg"}
          hint="Zisk/ztráta z už prodaných akcií, počítáno metodou FIFO (v CZK)."
        />
        <Kpi
          label="Dividendy (netto)"
          value={czk(s.totalDividendsGross + s.totalWithholdingTax)}
          sub={`brutto ${czk(s.totalDividendsGross)}`}
          tone="pos"
          hint="Všechny přijaté dividendy za celou historii po odečtení srážkové daně. V závorce hrubá výše."
        />
      </div>

      {/* Value over time */}
      <Section
        title="Hodnota portfolia v čase"
        subtitle="Tržní hodnota vs. pořizovací cena držených pozic (CZK)"
        hint="Modrá = tržní hodnota akcií, oranžová = jejich pořizovací cena (FIFO). Svislý rozdíl = nerealizovaný zisk. Ceny přepočteny dnešním kurzem."
      >
        {series?.length ? <ValueChart data={series} /> : <Empty msg="Historická data se nepodařilo načíst." />}
      </Section>

      {/* Performance per period */}
      <div className="mt-6">
        <Section
          title="Výkonnost portfolia"
          subtitle="Sloupce = zisk/ztráta v Kč · výnos počítán jako TWR (nezávislý na vkladech)"
          hint="Zisk/ztráta za období očištěná o vklady a výběry. Výnos v tooltipu je TWR (time-weighted) — čistá výkonnost titulů nezávislá na tom, kdy a kolik bylo vloženo."
          action={
            <Toggle
              value={perfMode}
              onChange={(v) => setPerfMode(v as any)}
              options={[
                { value: "monthly", label: "Měsíce" },
                { value: "yearly", label: "Roky" },
              ]}
            />
          }
        >
          {perf.length ? <PerformanceChart key={perfMode} data={perf} /> : <Empty msg="Nedostatek dat pro výpočet výkonnosti." />}
        </Section>
      </div>

      {/* Benchmark vs S&P 500 + risk metrics */}
      <div className="mt-6">
        <Section
          title="Výkonnost vs. trh"
          subtitle="Portfolio (TWR) vs. S&P 500 Total Return, přepočteno na 100 k počátku"
          hint="Obě křivky startují na 100. S&P 500 je počítáno jako Total Return index (^SP500TR, vč. reinvestovaných dividend)."
        >
          {risk && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <MiniStat
                label="Volatilita (p.a.)"
                value={`${((risk.volatility ?? 0) * 100).toFixed(1)} %`}
                hint="Kolísavost denních výnosů, anualizovaná (směr. odchylka × √252). Vyšší = rizikovější."
              />
              <MiniStat
                label="Sharpe ratio"
                value={(risk.sharpe ?? 0).toFixed(2)}
                tone={(risk.sharpe ?? 0) >= 1 ? "pos" : undefined}
                hint="Výnos nad bezrizikovou sazbou (3 %) na jednotku rizika. >1 dobré, <0,5 slabé."
              />
            </div>
          )}
          {benchmark.length ? <BenchmarkChart data={benchmark} /> : <Empty msg="Benchmark se nepodařilo načíst." />}
        </Section>
      </div>

      {/* Market mood (VIX) */}
      <div className="mt-6">
        <Section
          title="Nálada trhu"
          subtitle="VIX — index očekávané volatility S&P 500 („index strachu“)"
          hint="VIX měří implikovanou volatilitu opcí na S&P 500 na příštích 30 dní."
          secondary
        >
          <MarketMood refreshTick={refreshTick} />
        </Section>
      </div>

      {/* Allocation + holdings + earnings calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-6 items-stretch">
        <div className="lg:col-span-3 min-w-0 space-y-6">
          <Section
            title="Alokace portfolia"
            subtitle="Podle tržní hodnoty"
            hint="Rozdělení tržní hodnoty pozic. Přepínej mezi jednotlivými tituly, sektory a měnami."
            action={
              <Toggle
                value={allocMode}
                onChange={(v) => setAllocMode(v as any)}
                options={[
                  { value: "pozice", label: "Pozice" },
                  { value: "sektory", label: "Sektory" },
                  { value: "meny", label: "Měny" },
                ]}
              />
            }
          >
            {alloc.length ? <AllocationPie data={alloc} /> : <Empty msg="Žádné otevřené pozice." />}
          </Section>
          <Section title="Pozice" subtitle="Klikni na titul pro detail, graf s obchody a novinky">
            <HoldingsTable holdings={holdings} total={s.totalMarketValue} onSelect={setDetail} />
          </Section>
        </div>
        <div className="lg:col-span-2 min-w-0 h-full">
          <Section title="Earnings kalendář" subtitle="Nejbližší termín výsledků" className="h-full flex flex-col" secondary>
            <EarningsCalendar refreshTick={refreshTick} endpoint="/api/demo/earnings" />
          </Section>
        </div>
      </div>

      {/* Analyst forecasts & ratings */}
      <div className="mt-6">
        <AnalystPanel holdings={holdings.map((h) => ({ symbol: h.symbol, instrument: h.instrument }))} refreshTick={refreshTick} />
      </div>

      {/* Dividends + deposits */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Section title="Dividendy v čase" subtitle={`Přijaté dividendy po měsících od ${monthYear(DIVIDENDS_FROM)}, podle titulu (brutto, CZK)`}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <MiniStat
              label="Příjem za 12 měsíců"
              value={czk(s.dividendTtmTotal)}
              tone="pos"
              hint="Skutečně přijaté dividendy (netto po srážkové dani) za posledních 12 měsíců."
            />
            <MiniStat
              label="Yield on cost"
              value={`${(s.dividendYieldOnCostPct ?? 0).toFixed(2)} %`}
              hint="Roční dividendy / pořizovací cena."
            />
            <MiniStat
              label="Dividendový výnos"
              value={`${(s.dividendForwardYieldPct ?? 0).toFixed(2)} %`}
              hint="Roční dividendy / aktuální tržní hodnota portfolia."
            />
          </div>
          {dividendRows.length ? (
            <DividendStackedChart data={dividendRows} tickers={s.dividendTickers} />
          ) : (
            <Empty msg="Zatím žádné dividendy." />
          )}
        </Section>
        <Section title="Vklady" subtitle={`Měsíční vklady od ${monthYear(DEPOSITS_FROM)} (CZK)`}>
          {deposits.length > 0 && (
            <div className="grid grid-cols-1 gap-3 mb-4">
              <MiniStat
                label="Průměrný vklad / měsíc"
                value={czk(avgMonthlyDeposit)}
                hint={`Součet vkladů od ${monthYear(DEPOSITS_FROM)} vydělený počtem měsíců v tomto období.`}
              />
            </div>
          )}
          {deposits.length ? <DepositsChart data={deposits} /> : <Empty msg="Žádné vklady v tomto období." />}
        </Section>
      </div>

      {/* Dividend projection / calendar */}
      <div className="mt-6">
        <Section title="Projekce příjmů" subtitle="Očekávaný příjem na 12 měsíců podle akcií k ex-dni">
          <DividendCalendar refreshTick={refreshTick} endpoint="/api/demo/dividends" />
        </Section>
      </div>

      {/* Tax time test + annual value-limit exemption */}
      <div className="mt-6">
        <Section
          title="Daňový přehled"
          subtitle="Osvobození od daně z příjmu při prodeji akcií (§4/1/w ZDP)"
          hint="Orientační výpočet, ne daňové poradenství."
          secondary
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <MiniStat
              label="Využito ročního limitu"
              value={`${czk(s.taxYearSoldCzk ?? 0)} / ${czk(ANNUAL_VALUE_LIMIT_CZK)}`}
              tone={(s.taxYearSoldCzk ?? 0) > ANNUAL_VALUE_LIMIT_CZK ? "neg" : undefined}
              hint="Hrubý příjem (ne zisk) z prodeje akcií v aktuálním kalendářním roce."
            />
            <MiniStat
              label="Zbývá do limitu"
              value={czk(Math.max(0, ANNUAL_VALUE_LIMIT_CZK - (s.taxYearSoldCzk ?? 0)))}
              hint="Kolik ještě letos lze prodat (hrubý příjem), aby zisk zůstal osvobozený i bez splnění časového testu."
            />
          </div>
          <TaxTestTable holdings={holdings} />
        </Section>
      </div>

      <p className="text-center text-muted text-xs mt-10">
        Demo · Ceny: Yahoo Finance · Výpočet pozic: FIFO ze syntetických transakcí · Data jsou vymyšlená, ne investiční doporučení.
      </p>

      {detail && (
        <StockDetail
          ticker={detail.ticker}
          instrument={detail.instrument}
          onClose={() => setDetail(null)}
          endpoint="/api/demo/stockdetail"
        />
      )}
    </div>
  );
}
