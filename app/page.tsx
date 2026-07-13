"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { czk, pct, shortDate, shortDateTime } from "@/lib/format";
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
import { Wishlist } from "@/components/Wishlist";
import { InfoTip } from "@/components/InfoTip";
import { SectionVisibilityProvider, useSectionVisibility, HiddenSectionsChip } from "@/components/SectionVisibility";
import { SectionOrderProvider, useSectionOrder } from "@/components/SectionOrder";
import { SortableBlock } from "@/components/SortableBlock";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
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
import { notifyPriceAlerts } from "@/lib/notifyAlerts";

type Data = any;
// Every chart's upper end is "today", computed fresh on each request from live data, so
// new months (deposits, dividends, performance, the income projection) show up on their
// own as time passes. The lower bounds below are derived from the account's own data
// (first transaction, first dividend) rather than hardcoded dates, so a different
// account's history — of any length or start date — needs no manual editing here.

export default function Page() {
  return (
    <SectionVisibilityProvider>
      <SectionOrderProvider>
        <PageContent />
      </SectionOrderProvider>
    </SectionVisibilityProvider>
  );
}

function PageContent() {
  const { isHidden, hide } = useSectionVisibility();
  const { order, reorderVisible } = useSectionOrder();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [perfMode, setPerfMode] = useState<"monthly" | "yearly">("monthly");
  const [allocMode, setAllocMode] = useState<"pozice" | "sektory" | "meny">("pozice");
  const [detail, setDetail] = useState<{ ticker: string; instrument: string; resolved?: boolean } | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const revolutFileRef = useRef<HTMLInputElement>(null);
  const holdingNotifiedRef = useRef<Set<string> | null>(null);

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
      if (json.holdings) {
        notifyPriceAlerts(
          json.holdings.map((h: any) => ({
            symbol: h.symbol,
            name: h.instrument,
            alert: h.alert,
            triggered: h.alertTriggered,
            price: h.livePrice,
            currency: h.currency,
          })),
          holdingNotifiedRef
        );
      }
      // Brief visible confirmation that "Obnovit ceny" actually did something —
      // otherwise the button just silently reverts to its idle label.
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

  // Auto-refresh live data (prices, analyst ratings, dividend calendar…) every 5 minutes.
  useEffect(() => {
    const id = setInterval(() => {
      load(true);
      setRefreshTick((t) => t + 1);
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  const setHoldingAlert = async (symbol: string, alert: { targetPrice: number; direction: "above" | "below" } | null) => {
    await fetch("/api/holding-alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(alert ? { symbol, ...alert } : { symbol, clear: true }),
    });
    await load();
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>, broker: "xtb" | "revolut" = "xtb") => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("broker", broker);
      const res = await fetch("/api/import", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Import selhal.");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Import selhal.");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  if (loading && !data) return <Splash msg="Načítám portfolio a stahuji ceny…" />;

  if (!data?.imported) {
    return (
      <div className="relative max-w-2xl mx-auto px-6 py-24 text-center overflow-hidden">
        <svg
          viewBox="0 0 400 120"
          className="absolute left-1/2 top-8 -translate-x-1/2 w-[420px] max-w-none opacity-[0.07] pointer-events-none"
          aria-hidden
        >
          <path
            d="M0 100 L40 92 L80 96 L120 70 L160 78 L200 45 L240 55 L280 20 L320 32 L360 8 L400 15"
            fill="none"
            stroke="#5b8cff"
            strokeWidth={3}
          />
        </svg>
        <div className="relative">
          <h1 className="text-2xl font-semibold mb-2">Portfolio Tracker</h1>
          <p className="text-muted mb-8">Zatím nemáš naimportovaná data z XTB ani Revolutu.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <UploadButton fileRef={fileRef} onUpload={onUpload} importing={importing} broker="xtb" big />
            <UploadButton fileRef={revolutFileRef} onUpload={onUpload} importing={importing} broker="revolut" big />
          </div>
          {error && <p className="text-neg mt-4 text-sm">{error}</p>}
        </div>
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
  const allocRaw =
    allocMode === "sektory"
      ? groupSum((h) => h.sector)
      : allocMode === "meny"
      ? groupSum((h) => h.currency)
      : holdings.filter((h) => h.marketValueCzk > 0).map((h) => ({ name: h.instrument, value: h.marketValueCzk }));
  // Past ~8 slices a pie/legend stops being readable — fold anything under 3% of the total
  // into a single "Ostatní" bucket so the chart and legend stay scannable at a glance.
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
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Portfolio Tracker</h1>
          <p className="text-muted text-sm mt-1">
            Účet {data.accountNumber} · {holdings.length} otevřených pozic · ceny k{" "}
            {data.pricesAsOf ? shortDateTime(data.pricesAsOf) : "—"} · import portfolia{" "}
            {data.importedAt ? shortDate(data.importedAt) : "—"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center">
            <button
              onClick={() => {
                load(true);
                setRefreshTick((t) => t + 1);
              }}
              disabled={refreshing}
              className={`text-sm px-3 py-2 rounded-xl border transition disabled:opacity-50 ${
                justRefreshed ? "border-pos/40 text-pos" : "border-line hover:bg-panel2"
              }`}
            >
              {refreshing ? "Stahuji…" : justRefreshed ? "✓ Aktualizováno" : "↻ Obnovit ceny"}
            </button>
            <InfoTip text="Ihned stáhne aktuální ceny akcií, kurz a rating analytiků (jinak se stránka sama obnovuje každých 5 minut)." />
          </div>
          <UploadButton fileRef={fileRef} onUpload={onUpload} importing={importing} broker="xtb" label="↑ XTB" />
          <UploadButton fileRef={revolutFileRef} onUpload={onUpload} importing={importing} broker="revolut" label="↑ Revolut" />
          <HiddenSectionsChip />
        </div>
      </div>

      {error && <p className="text-neg mb-4 text-sm">{error}</p>}

      {/* Headline — the one number to check at a glance, before the KPI grid below explains it. */}
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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {(s.cashAccounts ?? []).length > 0 && (
          <Kpi
            label="Volná hotovost"
            value={czk(s.freeCash ?? 0)}
            sub={(s.cashAccounts ?? []).map((a: any) => a.name).join(" + ") || undefined}
            hint="Hotovost na spořicích účtech mimo brokerské účty. Nastavuje se v data/cash.json."
          />
        )}
        <Kpi
          label="Tržní hodnota"
          value={czk(s.totalMarketValue + (s.xtbCash ?? 0))}
          sub={`vč. volných ${czk(s.xtbCash ?? 0)}`}
          hint="Celková hodnota brokerských účtů (XTB + Revolut): tržní hodnota držených akcií (kusy × živá cena × kurz) + volné nezainvestované prostředky."
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

      {(() => {
        const blockContent: Record<string, React.ReactNode> = {
          value: !isHidden("value") ? (
            <Section
              title="Hodnota portfolia v čase"
              subtitle="Tržní hodnota vs. pořizovací cena držených pozic (CZK)"
              hint="Modrá = tržní hodnota akcií, oranžová = jejich pořizovací cena (FIFO). Svislý rozdíl = nerealizovaný zisk. Ceny přepočteny dnešním kurzem."
              onHide={() => hide("value", "Hodnota portfolia v čase")}
            >
              {series?.length ? (
                <ValueChart data={series} />
              ) : (
                <Empty msg="Historická data se nepodařilo načíst. Zkus Obnovit ceny." />
              )}
            </Section>
          ) : null,

          performance: !isHidden("performance") ? (
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
              onHide={() => hide("performance", "Výkonnost portfolia")}
            >
              {perf.length ? <PerformanceChart key={perfMode} data={perf} /> : <Empty msg="Nedostatek dat pro výpočet výkonnosti." />}
            </Section>
          ) : null,

          benchmark: !isHidden("benchmark") ? (
            <Section
              title="Výkonnost vs. trh"
              subtitle="Tvé portfolio (TWR) vs. S&P 500 Total Return, přepočteno na 100 k počátku"
              hint="Obě křivky startují na 100. S&P 500 je počítáno jako Total Return index (^SP500TR, vč. reinvestovaných dividend) — fér srovnání proti tvému portfoliu, které dividendy a úroky taky zahrnuje do výkonnosti."
              onHide={() => hide("benchmark", "Výkonnost vs. trh")}
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
          ) : null,

          vix: !isHidden("vix") ? (
            <Section
              title="Nálada trhu"
              subtitle="VIX — index očekávané volatility S&P 500 („index strachu“)"
              hint="VIX měří implikovanou volatilitu opcí na S&P 500 na příštích 30 dní — čím vyšší, tím víc trh čeká výkyvy (strach); nízký VIX = klid. Pásma jsou obecně používaný odhad, ne oficiální klasifikace CBOE."
              secondary
              onHide={() => hide("vix", "Nálada trhu")}
            >
              <MarketMood refreshTick={refreshTick} />
            </Section>
          ) : null,

          allocationCluster:
            !isHidden("allocation") || !isHidden("holdings") || !isHidden("earnings") ? (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-stretch">
                {(!isHidden("allocation") || !isHidden("holdings")) && (
                  <div className="lg:col-span-3 min-w-0 space-y-6">
                    {!isHidden("allocation") && (
                      <Section
                        title="Alokace portfolia"
                        subtitle="Podle tržní hodnoty"
                        hint="Rozdělení tržní hodnoty pozic. Přepínej mezi jednotlivými tituly, sektory (stockanalysis.com) a měnami."
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
                        onHide={() => hide("allocation", "Alokace portfolia")}
                      >
                        {alloc.length ? <AllocationPie data={alloc} /> : <Empty msg="Žádné otevřené pozice." />}
                      </Section>
                    )}
                    {!isHidden("holdings") && (
                      <Section
                        title="Pozice"
                        subtitle="Klikni na titul pro detail, graf s tvými obchody a novinky"
                        onHide={() => hide("holdings", "Pozice")}
                      >
                        <HoldingsTable
                          holdings={holdings}
                          total={s.totalMarketValue}
                          onSelect={setDetail}
                          onAlertChange={setHoldingAlert}
                        />
                      </Section>
                    )}
                  </div>
                )}
                {!isHidden("earnings") && (
                  <div className="lg:col-span-2 min-w-0 h-full">
                    <Section
                      title="Earnings kalendář"
                      subtitle="Nejbližší termín výsledků"
                      className="h-full flex flex-col"
                      secondary
                      onHide={() => hide("earnings", "Earnings kalendář")}
                    >
                      <EarningsCalendar refreshTick={refreshTick} />
                    </Section>
                  </div>
                )}
              </div>
            ) : null,

          wishlist: !isHidden("wishlist") ? (
            <Section
              title="Sledované tituly"
              subtitle="Tituly mimo portfolio — detail a volitelný cenový alert"
              hint="Přidej libovolný titul podle tickeru nebo názvu firmy. U ceny je i cíl analytiků (12měsíční průměr) a potenciál v %. Klikni na řádek pro detail (cena, fundamenty, analytici, novinky) — stejný jako u vlastních pozic, jen bez tvých obchodů. Alert je jen vizuální zvýraznění, ne push notifikace."
              onHide={() => hide("wishlist", "Sledované tituly")}
            >
              <Wishlist
                onSelect={(symbol, name) => setDetail({ ticker: symbol, instrument: name, resolved: true })}
                refreshTick={refreshTick}
              />
            </Section>
          ) : null,

          analysts: !isHidden("analysts") ? (
            <AnalystPanel
              holdings={holdings.map((h) => ({ symbol: h.symbol, instrument: h.instrument }))}
              refreshTick={refreshTick}
              onHide={() => hide("analysts", "Analytické odhady")}
            />
          ) : null,

          dividendsCluster:
            !isHidden("dividends") || !isHidden("deposits") ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {!isHidden("dividends") && (
                  <Section
                    title="Dividendy v čase"
                    subtitle={`Přijaté dividendy po měsících od ${monthYear(DIVIDENDS_FROM)}, podle titulu (brutto, CZK)`}
                    onHide={() => hide("dividends", "Dividendy v čase")}
                  >
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
                )}
                {!isHidden("deposits") && (
                  <Section
                    title="Vklady"
                    subtitle={`Měsíční vklady od ${monthYear(DEPOSITS_FROM)} (CZK)`}
                    onHide={() => hide("deposits", "Vklady")}
                  >
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
                )}
              </div>
            ) : null,

          dividendProjection: !isHidden("dividendProjection") ? (
            <Section
              title="Projekce příjmů"
              subtitle="Očekávaný příjem na 12 měsíců: dividendy (podle akcií k ex-dni) + úroky ze spořicích účtů (netto po 15% dani)"
              onHide={() => hide("dividendProjection", "Projekce příjmů")}
            >
              <DividendCalendar refreshTick={refreshTick} />
            </Section>
          ) : null,

          tax: !isHidden("tax") ? (
            <Section
              title="Daňový přehled"
              subtitle="Osvobození od daně z příjmu při prodeji akcií (§4/1/w ZDP)"
              hint="Orientační výpočet, ne daňové poradenství. Prodej je osvobozen, pokud je splněna ALESPOŇ JEDNA podmínka: časový test (držba přes 3 roky od nákupu, po jednotlivých FIFO tranších) nebo roční hodnotový limit (celkový hrubý příjem z prodeje CP v kalendářním roce do 100 000 Kč, bez ohledu na dobu držby)."
              secondary
              onHide={() => hide("tax", "Daňový přehled")}
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
          ) : null,
        };

        const visibleOrder = order.filter((id) => blockContent[id] != null);

        function handleDragEnd(event: DragEndEvent) {
          const { active, over } = event;
          if (!over || active.id === over.id) return;
          const oldIndex = visibleOrder.indexOf(String(active.id));
          const newIndex = visibleOrder.indexOf(String(over.id));
          if (oldIndex === -1 || newIndex === -1) return;
          reorderVisible(arrayMove(visibleOrder, oldIndex, newIndex));
        }

        return (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleOrder} strategy={verticalListSortingStrategy}>
              {visibleOrder.map((id) => (
                <div key={id} className="mt-6 first:mt-0">
                  <SortableBlock id={id}>{blockContent[id]}</SortableBlock>
                </div>
              ))}
            </SortableContext>
          </DndContext>
        );
      })()}

      <p className="text-center text-muted text-xs mt-10">
        Ceny: Yahoo Finance · Výpočet pozic: FIFO z XTB/Revolut transakcí · Pouze pro osobní přehled, ne investiční poradenství.
      </p>

      {detail && (
        <StockDetail
          ticker={detail.ticker}
          instrument={detail.instrument}
          onClose={() => setDetail(null)}
          resolved={detail.resolved}
        />
      )}
    </div>
  );
}

function UploadButton({ fileRef, onUpload, importing, big, broker = "xtb", label }: any) {
  const accept = broker === "revolut" ? ".csv" : ".xlsx,.xls";
  const defaultLabel = broker === "revolut" ? "Nahrát Revolut export (.csv)" : "Nahrát XTB export (.xlsx)";
  return (
    <label
      className={`inline-flex items-center gap-2 rounded-xl transition cursor-pointer ${
        broker === "revolut" ? "border border-line hover:bg-panel2" : "bg-brand text-white hover:opacity-90"
      } ${big ? "px-5 py-3 text-base" : "px-3 py-2 text-sm"}`}
    >
      {importing ? "Importuji…" : label ?? (big ? defaultLabel : "↑ Nahrát export")}
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onUpload(e, broker)}
        disabled={importing}
      />
    </label>
  );
}
