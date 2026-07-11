"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { czk, num, pct, shortDate } from "@/lib/format";
import {
  AllocationPie,
  BenchmarkChart,
  DepositsChart,
  DividendStackedChart,
  PerformanceChart,
  ValueChart,
  PALETTE,
} from "@/components/Charts";
import { AnalystPanel } from "@/components/Analysts";
import { EarningsCalendar } from "@/components/EarningsCalendar";
import { SmartMoney } from "@/components/SmartMoney";
import { MarketMood } from "@/components/MarketMood";
import { StockDetail } from "@/components/StockDetail";
import { DividendCalendar } from "@/components/DividendCalendar";
import { InfoTip } from "@/components/InfoTip";
import { holdingTaxStatus, ANNUAL_VALUE_LIMIT_CZK } from "@/lib/taxtest";

type Data = any;
// Every chart's upper end is "today", computed fresh on each request from live data, so
// new months (deposits, dividends, performance, the income projection) show up on their
// own as time passes. The lower bounds below are derived from the account's own data
// (first transaction, first dividend) rather than hardcoded dates, so a different
// account's history — of any length or start date — needs no manual editing here.

/** "YYYY-MM" shifted by `n` months (n can be negative). */
function addMonths(yyyyMm: string, n: number): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** "YYYY-MM" -> "M/YYYY" (e.g. "2024-10" -> "10/2024"). */
function monthYear(yyyyMm: string): string {
  if (!yyyyMm) return "";
  const [y, m] = yyyyMm.split("-");
  return `${parseInt(m, 10)}/${y}`;
}

export default function Page() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [perfMode, setPerfMode] = useState<"monthly" | "yearly">("monthly");
  const [allocMode, setAllocMode] = useState<"pozice" | "sektory" | "meny">("pozice");
  const [detail, setDetail] = useState<{ ticker: string; instrument: string } | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (force = false) => {
    force ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const qs = force ? "?refresh=1" : "";
      let res = await fetch(`/api/portfolio${qs}`, { cache: "no-store" });
      let json = await res.json();
      // Nothing imported yet -> try auto-import of the export in the folder.
      if (!json.imported) {
        await fetch("/api/import", { cache: "no-store" });
        res = await fetch("/api/portfolio", { cache: "no-store" });
        json = await res.json();
      }
      setData(json);
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

  // Auto-refresh live data (prices, analyst ratings, dividend calendar…) every 5 minutes.
  useEffect(() => {
    const id = setInterval(() => {
      load(true);
      setRefreshTick((t) => t + 1);
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Import selhal.");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Import selhal.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (loading && !data) return <Splash msg="Načítám portfolio a stahuji ceny…" />;

  if (!data?.imported) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold mb-2">Portfolio Tracker</h1>
        <p className="text-muted mb-8">Zatím nemáš naimportovaná data z XTB.</p>
        <UploadButton fileRef={fileRef} onUpload={onUpload} importing={importing} big />
        {error && <p className="text-neg mt-4 text-sm">{error}</p>}
      </div>
    );
  }

  const s = data.summary;
  const holdings = data.holdings as any[];

  // First full calendar month of activity — the first (often partial, mid-month) month
  // is skipped so the value/performance charts start on a clean, meaningful baseline.
  const firstOpMonth = (s.firstOpDate as string)?.slice(0, 7) || "";
  const secondFullMonth = firstOpMonth ? addMonths(firstOpMonth, 1) : "";
  const VALUE_FROM = secondFullMonth ? `${secondFullMonth}-01` : "";
  const DEPOSITS_FROM = secondFullMonth;
  const PERFORMANCE_FROM = secondFullMonth;
  // First month with an actual dividend, so the chart never opens with a run of blank months.
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
  const alloc =
    allocMode === "sektory"
      ? groupSum((h) => h.sector)
      : allocMode === "meny"
      ? groupSum((h) => h.currency)
      : holdings.filter((h) => h.marketValueCzk > 0).map((h) => ({ name: h.instrument, value: h.marketValueCzk }));

  const deposits = (s.cashflowByMonth as any[])
    .filter((m) => m.month >= DEPOSITS_FROM)
    .map((m) => ({ month: m.month, deposits: m.deposits }));
  const avgMonthlyDeposit = deposits.length ? deposits.reduce((sum, d) => sum + d.deposits, 0) / deposits.length : 0;

  const dividendRows = (s.dividendByMonth as any[]).filter((r) => r.month >= DIVIDENDS_FROM);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Portfolio Tracker</h1>
          <p className="text-muted text-sm mt-1">
            XTB účet {data.accountNumber} · {holdings.length} otevřených pozic · ceny z{" "}
            {data.importedAt ? shortDate(data.importedAt) : "—"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center">
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="text-sm px-3 py-2 rounded-xl border border-line hover:bg-panel2 transition disabled:opacity-50"
            >
              {refreshing ? "Stahuji…" : "↻ Obnovit ceny"}
            </button>
            <InfoTip text="Ihned stáhne aktuální ceny akcií, kurz a rating analytiků (jinak se stránka sama obnovuje každých 5 minut)." />
          </div>
          <UploadButton fileRef={fileRef} onUpload={onUpload} importing={importing} />
        </div>
      </div>

      {error && <p className="text-neg mb-4 text-sm">{error}</p>}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {(s.cashAccounts ?? []).length > 0 && (
          <Kpi
            label="Volná hotovost"
            value={czk(s.freeCash ?? 0)}
            sub={(s.cashAccounts ?? []).map((a: any) => a.name).join(" + ") || undefined}
            hint="Hotovost na spořicích účtech mimo XTB. Nastavuje se v data/cash.json."
          />
        )}
        <Kpi
          label="Tržní hodnota"
          value={czk(s.totalMarketValue + (s.xtbCash ?? 0))}
          sub={`vč. volných ${czk(s.xtbCash ?? 0)}`}
          hint="Celková hodnota XTB účtu: tržní hodnota držených akcií (kusy × živá cena × kurz) + volné nezainvestované prostředky na XTB."
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
        {series?.length ? (
          <ValueChart data={series} />
        ) : (
          <Empty msg="Historická data se nepodařilo načíst. Zkus Obnovit ceny." />
        )}
      </Section>

      {/* Performance per period */}
      <div className="mt-6">
        <Section
          title="Výkonnost portfolia"
          subtitle="Sloupce = zisk/ztráta v Kč · výnos počítán jako TWR (nezávislý na vkladech)"
          hint="Zisk/ztráta za období očištěná o vklady a výběry. Výnos v tooltipu je TWR (time-weighted) — čistá výkonnost titulů nezávislá na tom, kdy a kolik jsi vložila."
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
          subtitle="Tvé portfolio (TWR) vs. S&P 500 Total Return, přepočteno na 100 k počátku"
          hint="Obě křivky startují na 100. S&P 500 je počítáno jako Total Return index (^SP500TR, vč. reinvestovaných dividend) — fér srovnání proti tvému portfoliu, které dividendy a úroky taky zahrnuje do výkonnosti."
        >
          {risk && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <MiniStat
                label="Roční výnos (p.a.)"
                value={pct((risk.annualizedReturn ?? 0) * 100)}
                tone={(risk.annualizedReturn ?? 0) >= 0 ? "pos" : "neg"}
                hint="Anualizovaný time-weighted výnos portfolia (nezávislý na načasování a velikosti vkladů)."
              />
              <MiniStat
                label="Volatilita (p.a.)"
                value={`${((risk.volatility ?? 0) * 100).toFixed(1)} %`}
                hint="Kolísavost denních výnosů, anualizovaná (směr. odchylka × √252). Vyšší = rizikovější."
              />
              <MiniStat
                label="Max. pokles"
                value={`${((risk.maxDrawdown ?? 0) * 100).toFixed(1)} %`}
                tone="neg"
                hint="Největší propad z vrcholu na následné dno (max drawdown) za sledované období."
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
          hint="VIX měří implikovanou volatilitu opcí na S&P 500 na příštích 30 dní — čím vyšší, tím víc trh čeká výkyvy (strach); nízký VIX = klid. Pásma jsou obecně používaný odhad, ne oficiální klasifikace CBOE."
        >
          <MarketMood refreshTick={refreshTick} />
        </Section>
      </div>

      {/* Allocation + holdings */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-6">
        <div className="lg:col-span-2 min-w-0">
          <Section
            title="Alokace portfolia"
            subtitle="Podle tržní hodnoty"
            hint="Rozdělení tržní hodnoty pozic. Přepínej mezi jednotlivými tituly, sektory (data z Finnhubu) a měnami."
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
        </div>
        <div className="lg:col-span-3 min-w-0">
          <Section title="Pozice" subtitle="Klikni na titul pro detail, graf s tvými obchody a novinky">
            <HoldingsTable holdings={holdings} total={s.totalMarketValue} onSelect={setDetail} />
          </Section>
        </div>
      </div>

      {/* Analyst forecasts & ratings */}
      <div className="mt-6">
        <AnalystPanel holdings={holdings.map((h) => ({ symbol: h.symbol, instrument: h.instrument }))} refreshTick={refreshTick} />
      </div>

      {/* Earnings calendar */}
      <div className="mt-6">
        <Section
          title="Earnings kalendář"
          subtitle="Nejbližší termín výsledků pro každý titul v portfoliu"
          hint="Kde stockanalysis.com uvádí datum v budoucnosti, bereme ho přímo. Kde je poslední známé datum už v minulosti (web ho ještě nestihl posunout), appka ho odhadne o ~91 dní dopředu a označí (odhad)."
        >
          <EarningsCalendar refreshTick={refreshTick} />
        </Section>
      </div>

      {/* Smart money: 13F super-investor moves + insider Form 4 trades */}
      <div className="mt-6">
        <Section
          title="Smart Money"
          subtitle="Sleduj obchody super investorů a insiderů (SEC EDGAR)"
          hint="13F filings ukazují držbu top fondů se zpožděním až 45 dní po konci čtvrtletí — je to stav pozice, ne živý obchod. Form 4 u insiderů (P/S) je aktuálnější, ale jde jen o pár vybraných lidí, ne kompletní přehled."
        >
          <SmartMoney refreshTick={refreshTick} />
        </Section>
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
              hint="Roční dividendy / pořizovací cena. Výnos vůči tomu, cos za akcie zaplatila."
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
                hint={`Součet vkladů od ${monthYear(DEPOSITS_FROM)} vydělený počtem měsíců v tomto období (vč. měsíců bez vkladu).`}
              />
            </div>
          )}
          {deposits.length ? <DepositsChart data={deposits} /> : <Empty msg="Žádné vklady v tomto období." />}
        </Section>
      </div>

      {/* Dividend projection / calendar */}
      <div className="mt-6">
        <Section title="Projekce příjmů" subtitle="Očekávaný příjem na 12 měsíců: dividendy (podle akcií k ex-dni) + úroky ze spořicích účtů (netto po 15% dani)">
          <DividendCalendar refreshTick={refreshTick} />
        </Section>
      </div>

      {/* Tax time test + annual value-limit exemption */}
      <div className="mt-6">
        <Section
          title="Daňový přehled"
          subtitle="Osvobození od daně z příjmu při prodeji akcií (§4/1/w ZDP)"
          hint="Orientační výpočet, ne daňové poradenství. Prodej je osvobozen, pokud je splněna ALESPOŇ JEDNA podmínka: časový test (držba přes 3 roky od nákupu, po jednotlivých FIFO tranších) nebo roční hodnotový limit (celkový hrubý příjem z prodeje CP v kalendářním roce do 100 000 Kč, bez ohledu na dobu držby)."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <MiniStat
              label="Využito ročního limitu"
              value={`${czk(s.taxYearSoldCzk ?? 0)} / ${czk(ANNUAL_VALUE_LIMIT_CZK)}`}
              tone={(s.taxYearSoldCzk ?? 0) > ANNUAL_VALUE_LIMIT_CZK ? "neg" : undefined}
              hint="Hrubý příjem (ne zisk) z prodeje akcií v aktuálním kalendářním roce. Pod 100 000 Kč je zisk osvobozený bez ohledu na dobu držby."
            />
            <MiniStat
              label="Zbývá do limitu"
              value={czk(Math.max(0, ANNUAL_VALUE_LIMIT_CZK - (s.taxYearSoldCzk ?? 0)))}
              hint="Kolik ještě letos můžeš prodat (hrubý příjem), aby zisk zůstal osvobozený i bez splnění časového testu."
            />
          </div>
          <TaxTestTable holdings={holdings} />
        </Section>
      </div>

      <p className="text-center text-muted text-xs mt-10">
        Ceny: Yahoo Finance · Výpočet pozic: FIFO z XTB Cash Operations · Pouze pro osobní přehled, ne investiční poradenství.
      </p>

      {detail && <StockDetail ticker={detail.ticker} instrument={detail.instrument} onClose={() => setDetail(null)} />}
    </div>
  );
}

function Kpi({ label, value, sub, tone, hint }: { label: string; value: string; sub?: string; tone?: "pos" | "neg"; hint?: string }) {
  const toneCls = tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "text-white";
  return (
    <div className="card p-4 min-w-0">
      <div className="stat-label">
        {label}
        {hint && <InfoTip text={hint} />}
      </div>
      <div className={`text-xl font-semibold mt-1 ${toneCls} truncate`}>{value}</div>
      {sub && <div className="text-muted text-xs mt-1 truncate">{sub}</div>}
    </div>
  );
}

function MiniStat({ label, value, tone, hint }: { label: string; value: string; tone?: "pos" | "neg"; hint?: string }) {
  const toneCls = tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "text-white";
  return (
    <div className="bg-panel2 rounded-xl p-3 min-w-0">
      <div className="stat-label">
        {label}
        {hint && <InfoTip text={hint} />}
      </div>
      <div className={`text-lg font-semibold mt-0.5 ${toneCls} truncate`}>{value}</div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  action,
  hint,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-5 min-w-0">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">
            {title}
            {hint && <InfoTip text={hint} />}
          </h2>
          {subtitle && <p className="text-muted text-xs mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex rounded-lg border border-line overflow-hidden text-sm shrink-0">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 transition ${
            value === o.value ? "bg-brand text-white" : "text-muted hover:bg-panel2"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function HoldingsTable({
  holdings,
  total,
  onSelect,
}: {
  holdings: any[];
  total: number;
  onSelect: (h: { ticker: string; instrument: string }) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted text-xs uppercase tracking-wide border-b border-line">
            <th className="text-left font-medium py-2">Titul</th>
            <th className="hidden sm:table-cell text-right font-medium py-2">Kusů</th>
            <th className="hidden sm:table-cell text-right font-medium py-2">Aktuální cena</th>
            <th className="text-right font-medium py-2">Hodnota</th>
            <th className="text-right font-medium py-2">Zisk</th>
            <th className="hidden sm:table-cell text-right font-medium py-2">Podíl</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h, i) => (
            <tr
              key={h.ticker}
              onClick={() => onSelect({ ticker: h.ticker, instrument: h.instrument })}
              className="border-b border-line/50 hover:bg-panel2/40 cursor-pointer"
            >
              <td className="py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                  <div>
                    <div className="font-medium">{h.instrument}</div>
                    <div className="text-muted text-xs">{h.ticker}</div>
                  </div>
                </div>
              </td>
              <td className="hidden sm:table-cell text-right tabular-nums">
                {num(h.shares, 4)}
                <div className="text-muted text-xs">
                  {h.avgNativePrice ? `⌀ ${num(h.avgNativePrice)} ${h.currency}` : "—"}
                </div>
              </td>
              <td className="hidden sm:table-cell text-right tabular-nums">
                {h.livePrice ? `${num(h.livePrice)} ${h.currency}` : "—"}
                {h.dayChangePercent ? (
                  <div className={`text-xs ${h.dayChangePercent >= 0 ? "text-pos" : "text-neg"}`}>{pct(h.dayChangePercent)}</div>
                ) : null}
              </td>
              <td className="text-right tabular-nums">{czk(h.marketValueCzk)}</td>
              <td className={`text-right tabular-nums ${h.unrealizedPnlCzk >= 0 ? "text-pos" : "text-neg"}`}>
                <div>{czk(h.unrealizedPnlCzk)}</div>
                <div className="text-xs">{pct(h.unrealizedPnlPct)}</div>
              </td>
              <td className="hidden sm:table-cell text-right tabular-nums text-muted">
                {total > 0 ? `${((h.marketValueCzk / total) * 100).toFixed(1)} %` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TaxTestTable({ holdings }: { holdings: any[] }) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const rows = holdings.map((h) => ({ h, status: holdingTaxStatus(h.lots ?? [], todayIso) }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted text-xs uppercase tracking-wide border-b border-line">
            <th className="text-left font-medium py-2">Titul</th>
            <th className="text-right font-medium py-2">Kusů celkem</th>
            <th className="text-right font-medium py-2">Osvobozeno (časový test)</th>
            <th className="text-right font-medium py-2">Příští osvobození</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ h, status }) => (
            <tr key={h.ticker} className="border-b border-line/50">
              <td className="py-2.5">
                <div className="font-medium">{h.instrument}</div>
                <div className="text-muted text-xs">{h.ticker}</div>
              </td>
              <td className="text-right tabular-nums">{num(status.totalShares, 4)}</td>
              <td className="text-right tabular-nums">
                {num(status.exemptShares, 4)}
                {status.pendingShares <= 1e-6 && <span className="text-pos text-xs ml-1">✓ vše</span>}
              </td>
              <td className="text-right tabular-nums text-muted">
                {status.nextExemptDate ? (
                  <>
                    {shortDate(status.nextExemptDate)}{" "}
                    <span className="text-xs">({num(status.nextExemptShares, 4)} ks)</span>
                  </>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UploadButton({ fileRef, onUpload, importing, big }: any) {
  return (
    <label
      className={`inline-flex items-center gap-2 rounded-xl bg-brand text-white cursor-pointer hover:opacity-90 transition ${
        big ? "px-5 py-3 text-base" : "px-3 py-2 text-sm"
      }`}
    >
      {importing ? "Importuji…" : big ? "Nahrát XTB export (.xlsx)" : "↑ Nahrát export"}
      <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onUpload} disabled={importing} />
    </label>
  );
}

function Splash({ msg }: { msg: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center text-muted">
      <div className="text-center">
        <div className="animate-pulse text-brand text-3xl mb-3">◐</div>
        {msg}
      </div>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="h-[260px] flex items-center justify-center text-muted text-sm text-center px-6">{msg}</div>;
}
