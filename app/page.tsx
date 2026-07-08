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
import { StockDetail } from "@/components/StockDetail";
import { DividendCalendar } from "@/components/DividendCalendar";

type Data = any;
const VALUE_FROM = "2024-10-31"; // value-over-time chart starts here
const DEPOSITS_FROM = "2024-10"; // deposits chart from Oct 2024 on
const DIVIDENDS_FROM = "2025-01"; // dividends chart from Jan 2025 on

export default function Page() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [perfMode, setPerfMode] = useState<"monthly" | "yearly">("monthly");
  const [allocMode, setAllocMode] = useState<"pozice" | "sektory" | "meny">("pozice");
  const [detail, setDetail] = useState<{ ticker: string; instrument: string } | null>(null);
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
  const series = (data.series as any[]).filter((p) => p.date >= VALUE_FROM);
  const perf = (data.performance?.[perfMode] ?? []) as any[];
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
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="text-sm px-3 py-2 rounded-xl border border-line hover:bg-panel2 transition disabled:opacity-50"
          >
            {refreshing ? "Stahuji…" : "↻ Obnovit ceny"}
          </button>
          <UploadButton fileRef={fileRef} onUpload={onUpload} importing={importing} />
        </div>
      </div>

      {error && <p className="text-neg mb-4 text-sm">{error}</p>}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Kpi label="Tržní hodnota" value={czk(s.totalMarketValue)} />
        <Kpi
          label="Nerealizovaný zisk"
          value={czk(s.totalUnrealized)}
          sub={pct(s.totalUnrealizedPct)}
          tone={s.totalUnrealized >= 0 ? "pos" : "neg"}
        />
        <Kpi label="Realizovaný zisk" value={czk(s.totalRealizedPnl)} tone={s.totalRealizedPnl >= 0 ? "pos" : "neg"} />
        <Kpi
          label="Dividendy (netto)"
          value={czk(s.totalDividendsGross + s.totalWithholdingTax)}
          sub={`brutto ${czk(s.totalDividendsGross)}`}
          tone="pos"
        />
      </div>

      {/* Value over time */}
      <Section title="Hodnota portfolia v čase" subtitle="Tržní hodnota vs. pořizovací cena držených pozic (CZK)">
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
        <Section title="Výkonnost vs. trh" subtitle="Tvé portfolio (TWR) vs. S&P 500, přepočteno na 100 k počátku">
          {risk && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <MiniStat label="Roční výnos (p.a.)" value={pct(risk.annualizedReturn * 100)} tone={risk.annualizedReturn >= 0 ? "pos" : "neg"} />
              <MiniStat label="Volatilita (p.a.)" value={`${(risk.volatility * 100).toFixed(1)} %`} />
              <MiniStat label="Max. pokles" value={`${(risk.maxDrawdown * 100).toFixed(1)} %`} tone="neg" />
              <MiniStat label="Sharpe ratio" value={risk.sharpe.toFixed(2)} tone={risk.sharpe >= 1 ? "pos" : undefined} />
            </div>
          )}
          {benchmark.length ? <BenchmarkChart data={benchmark} /> : <Empty msg="Benchmark se nepodařilo načíst." />}
        </Section>
      </div>

      {/* Allocation + holdings */}
      <div className="grid lg:grid-cols-5 gap-6 mt-6">
        <div className="lg:col-span-2">
          <Section
            title="Alokace portfolia"
            subtitle="Podle tržní hodnoty"
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
        <div className="lg:col-span-3">
          <Section title="Pozice" subtitle="Klikni na titul pro detail, graf s tvými obchody a novinky">
            <HoldingsTable holdings={holdings} total={s.totalMarketValue} onSelect={setDetail} />
          </Section>
        </div>
      </div>

      {/* Analyst forecasts & ratings */}
      <div className="mt-6">
        <AnalystPanel holdings={holdings.map((h) => ({ symbol: h.symbol, instrument: h.instrument }))} />
      </div>

      {/* Dividends + deposits */}
      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        <Section title="Dividendy v čase" subtitle="Přijaté dividendy po měsících od 1/2025, podle titulu (brutto, CZK)">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <MiniStat label="Příjem za 12 měsíců" value={czk(s.dividendTtmTotal)} tone="pos" />
            <MiniStat label="Yield on cost" value={`${(s.dividendYieldOnCostPct ?? 0).toFixed(2)} %`} />
            <MiniStat label="Dividendový výnos" value={`${(s.dividendForwardYieldPct ?? 0).toFixed(2)} %`} />
          </div>
          {dividendRows.length ? (
            <DividendStackedChart data={dividendRows} tickers={s.dividendTickers} />
          ) : (
            <Empty msg="Zatím žádné dividendy." />
          )}
        </Section>
        <Section title="Vklady" subtitle="Měsíční vklady od 10/2024 (CZK)">
          {deposits.length ? <DepositsChart data={deposits} /> : <Empty msg="Žádné vklady v tomto období." />}
        </Section>
      </div>

      {/* Dividend projection / calendar */}
      <div className="mt-6">
        <Section title="Dividendová projekce" subtitle="Očekávaný příjem na 12 měsíců podle aktuálních pozic + kalendář ex-dividend a výplat">
          <DividendCalendar />
        </Section>
      </div>

      <p className="text-center text-muted text-xs mt-10">
        Ceny: Yahoo Finance · Výpočet pozic: FIFO z XTB Cash Operations · Pouze pro osobní přehled, ne investiční poradenství.
      </p>

      {detail && <StockDetail ticker={detail.ticker} instrument={detail.instrument} onClose={() => setDetail(null)} />}
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "pos" | "neg" }) {
  const toneCls = tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "text-white";
  return (
    <div className="card p-4">
      <div className="stat-label">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${toneCls}`}>{value}</div>
      {sub && <div className="text-muted text-xs mt-1">{sub}</div>}
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  const toneCls = tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "text-white";
  return (
    <div className="bg-panel2 rounded-xl p-3">
      <div className="stat-label">{label}</div>
      <div className={`text-lg font-semibold mt-0.5 ${toneCls}`}>{value}</div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
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
            <th className="text-right font-medium py-2">Kusů</th>
            <th className="text-right font-medium py-2">Cena</th>
            <th className="text-right font-medium py-2">Hodnota</th>
            <th className="text-right font-medium py-2">Zisk</th>
            <th className="text-right font-medium py-2">Podíl</th>
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
              <td className="text-right tabular-nums">{num(h.shares, 4)}</td>
              <td className="text-right tabular-nums">
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
              <td className="text-right tabular-nums text-muted">
                {total > 0 ? `${((h.marketValueCzk / total) * 100).toFixed(1)} %` : "—"}
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
