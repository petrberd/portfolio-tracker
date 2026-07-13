"use client";

import { useEffect, useRef, useState } from "react";
import {
  ComposedChart,
  Line,
  ReferenceDot,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { InfoTip } from "@/components/InfoTip";
import { SkeletonBlock } from "@/components/Skeleton";
import { Toggle } from "@/components/PortfolioUI";

type Range = "1mo" | "3mo" | "1y" | "5y";
const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: "1mo", label: "1 měsíc" },
  { value: "3mo", label: "3 měsíce" },
  { value: "1y", label: "1 rok" },
  { value: "5y", label: "5 let" },
];
const RANGE_TITLE: Record<Range, string> = {
  "1mo": "Cena za měsíc",
  "3mo": "Cena za 3 měsíce",
  "1y": "Cena za rok",
  "5y": "Cena za 5 let",
};

const money = (v: number, ccy: string, d = 2) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: ccy || "USD", maximumFractionDigits: d }).format(v ?? 0);

const bigMoney = (v: number, ccy: string) => {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)} ${ccy === "USD" ? "$" : ccy} bil.`;
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1)} mld`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(0)} mil.`;
  return money(v, ccy, 0);
};

const shortDate = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "short", year: "2-digit" }) : "";

const RATING: Record<string, { label: string; color: string }> = {
  "Strong Buy": { label: "Silný nákup", color: "#16a34a" },
  Buy: { label: "Nákup", color: "#22c55e" },
  Hold: { label: "Držet", color: "#eab308" },
  Sell: { label: "Prodej", color: "#f97316" },
  "Strong Sell": { label: "Silný prodej", color: "#ef4444" },
};

export function StockDetail({
  ticker,
  instrument,
  onClose,
  endpoint = "/api/stockdetail",
  resolved = false,
}: {
  ticker: string;
  instrument: string;
  onClose: () => void;
  endpoint?: string;
  /** True when `ticker` is already a Yahoo symbol (e.g. a wishlist item), not an XTB ticker to convert. */
  resolved?: boolean;
}) {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("1y");
  const [chartLoading, setChartLoading] = useState(false);
  const [dotsVisible, setDotsVisible] = useState(false);
  const rangeInitRef = useRef(false);

  // Buy/sell dots pop in ~1s after the chart line itself, so the line draws in first and
  // the trade markers read as an annotation on top of it rather than everything appearing
  // at once. Re-triggers on every fresh `d` (new ticker, or a range switch).
  useEffect(() => {
    setDotsVisible(false);
    if (!d) return;
    const t = setTimeout(() => setDotsVisible(true), 900);
    return () => clearTimeout(t);
  }, [d]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock the background page while the modal is open — otherwise the page behind
  // this fixed overlay can still scroll (vertically and, on iOS Safari during
  // momentum scroll, horizontally), which reads as the modal itself "drifting"
  // instead of staying put.
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  // New stock opened (fresh mount, effectively — the modal only renders when there's a
  // `detail`, so switching tickers unmounts/remounts this component) — full-page skeleton.
  useEffect(() => {
    let cancelled = false;
    rangeInitRef.current = false;
    setLoading(true);
    const qs = `ticker=${encodeURIComponent(ticker)}${resolved ? "&resolved=1" : ""}&range=${range}`;
    fetch(`${endpoint}?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => !cancelled && setD(j))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, endpoint, resolved]);

  // Range toggle clicked on an already-open modal — refetch just the chart data without
  // re-showing the full skeleton (fundamentals/analysts/news haven't changed).
  useEffect(() => {
    if (!rangeInitRef.current) {
      rangeInitRef.current = true;
      return;
    }
    let cancelled = false;
    setChartLoading(true);
    const qs = `ticker=${encodeURIComponent(ticker)}${resolved ? "&resolved=1" : ""}&range=${range}`;
    fetch(`${endpoint}?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => !cancelled && setD(j))
      .finally(() => !cancelled && setChartLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const ccy = d?.currency ?? "USD";
  const f = d?.fundamentals;
  const a = d?.analysts;
  const rating = a ? RATING[a.rating] ?? { label: a.rating, color: "#8b98b8" } : null;
  const upside = a && d?.price > 0 && a.targetPrice > 0 ? ((a.targetPrice - d.price) / d.price) * 100 : null;

  const line = (d?.history ?? []).map((h: any) => ({ t: new Date(h.date).getTime(), close: h.close }));
  const buys = (d?.trades ?? []).filter((t: any) => t.side === "buy").map((t: any) => ({ t: new Date(t.date).getTime(), price: t.price }));
  const sells = (d?.trades ?? []).filter((t: any) => t.side === "sell").map((t: any) => ({ t: new Date(t.date).getTime(), price: t.price }));
  const hasTrades = buys.length > 0 || sells.length > 0;
  const xDomain = line.length ? [line[0].t, line[line.length - 1].t] : [0, 1];
  const allPrices = [...line.map((p: any) => p.close), ...buys.map((b: any) => b.price), ...sells.map((s: any) => s.price)];
  const yMin = allPrices.length ? Math.min(...allPrices) : 0;
  const yMax = allPrices.length ? Math.max(...allPrices) : 1;
  const yPad = (yMax - yMin) * 0.06 || 1;

  const pe = f && f.eps > 0 && d?.price ? d.price / f.eps : null;
  const marketCap = f && f.shares > 0 && d?.price ? d.price * f.shares : null;
  const netMargin = f && f.revenue > 0 ? (f.netIncome / f.revenue) * 100 : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto overflow-x-hidden p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-4xl my-4 p-6 relative min-w-0 overflow-x-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Zavřít"
          className="absolute top-3 right-3 w-9 h-9 inline-flex items-center justify-center rounded-full border border-line text-muted hover:text-white hover:bg-panel2 transition text-lg leading-none"
        >
          ✕
        </button>

        {/* Header */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pr-8">
          <h2 className="text-xl font-semibold">{instrument}</h2>
          <span className="text-muted text-sm">{ticker}</span>
          {d && (
            <span className="ml-auto text-2xl font-semibold">{money(d.price, ccy)}</span>
          )}
        </div>

        {loading && <SkeletonBlock height={380} lines={6} />}

        {!loading && d && (
          <div className="animate-[fadein_.2s_ease-out]">
            {/* Fundamentals strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
              <Metric label="Tržní kap." value={marketCap != null ? bigMoney(marketCap, ccy) : "—"} hint="Tržní kapitalizace = aktuální cena × počet akcií." />
              <Metric label="P/E" value={pe != null ? pe.toFixed(1) : "—"} hint="Cena / zisk na akcii (EPS). Kolik platíš za 1 jednotku ročního zisku." />
              <Metric
                label="Tržby (rok)"
                value={f?.revenue ? bigMoney(f.revenue, ccy) : "—"}
                sub={f?.revenueGrowth ? `růst ${(f.revenueGrowth * 100).toFixed(0)} %` : undefined}
                hint="Roční tržby (poslední fiskální rok). Růst = průměrný meziroční růst (CAGR) z dostupné historie."
              />
              <Metric label="Čistá marže" value={netMargin != null ? `${netMargin.toFixed(1)} %` : "—"} hint="Čistý zisk / tržby — kolik z každé koruny tržeb zůstane jako zisk." />
            </div>

            {/* Dividend schedule */}
            {d.dividend && (
              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm bg-panel2 rounded-xl px-4 py-2.5">
                <span className="stat-label">Dividenda:</span>
                <span className="text-muted">
                  Ex-dividend <span className="text-white font-medium">{shortDate(d.dividend.nextEx)}</span>
                </span>
                <span className="text-muted">
                  Výplata <span className="text-white font-medium">{shortDate(d.dividend.nextPay)}</span>
                  {d.dividend.estimatedPay && <span className="text-xs ml-1 text-muted">(odhad)</span>}
                </span>
                <span className="text-muted">
                  <span className="text-white font-medium">{money(d.dividend.perShare, ccy)}</span>/akcii ·{" "}
                  {d.dividend.perYear === 12 ? "měsíčně" : d.dividend.perYear === 4 ? "kvartálně" : d.dividend.perYear === 2 ? "pololetně" : "ročně"}
                </span>
              </div>
            )}

            {/* Price chart with your trades (if any — wishlist items aren't owned, so they
                have none; the label/legend below only mention trades when there are some). */}
            <div className="mt-5">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <span className="stat-label">{RANGE_TITLE[range]}{hasTrades ? " · tvé obchody" : ""}</span>
                <div className="flex items-center gap-3 flex-wrap">
                  {hasTrades && (
                    <span className="text-xs text-muted flex gap-3">
                      <span><span className="inline-block w-2 h-2 rounded-full align-middle mr-1" style={{ background: "#22c55e" }} />nákup</span>
                      <span><span className="inline-block w-2 h-2 rounded-full align-middle mr-1" style={{ background: "#ef4444" }} />prodej</span>
                    </span>
                  )}
                  <Toggle value={range} onChange={(v) => setRange(v as Range)} options={RANGE_OPTIONS} />
                </div>
              </div>
              <ResponsiveContainer width="100%" height={260} className={chartLoading ? "opacity-50 transition-opacity" : "transition-opacity"}>
                <ComposedChart data={line} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1b2438" vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={xDomain}
                    tick={{ fill: "#8b98b8", fontSize: 11 }}
                    tickFormatter={(t) =>
                      range === "1mo" || range === "3mo"
                        ? new Date(t).toLocaleDateString("cs-CZ", { day: "numeric", month: "short" })
                        : new Date(t).toLocaleDateString("cs-CZ", { month: "short", year: "2-digit" })
                    }
                    minTickGap={44}
                  />
                  <YAxis
                    tick={{ fill: "#8b98b8", fontSize: 11 }}
                    width={52}
                    domain={[Math.floor(yMin - yPad), Math.ceil(yMax + yPad)]}
                    tickFormatter={(v) => money(v, ccy, 0)}
                  />
                  <Tooltip
                    contentStyle={{ background: "#131a2a", border: "1px solid #26304a", borderRadius: 12, fontSize: 13 }}
                    itemStyle={{ color: "#e6ebf5" }}
                    labelStyle={{ color: "#f0f3fa", fontWeight: 600 }}
                    labelFormatter={(t) =>
                      range === "1mo" || range === "3mo"
                        ? new Date(t as number).toLocaleString("cs-CZ", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                        : shortDate(new Date(t as number).toISOString())
                    }
                    formatter={(v: number) => [money(v, ccy), "Cena"]}
                  />
                  <Line type="monotone" dataKey="close" stroke="#7ea2ff" strokeWidth={2.2} dot={false} name="close" />
                  {dotsVisible &&
                    buys.map((b: any, i: number) => (
                      <ReferenceDot
                        key={`b${i}`}
                        x={b.t}
                        y={b.price}
                        r={3.5}
                        fill="#22c55e"
                        stroke="#0b0f19"
                        strokeWidth={1}
                        ifOverflow="extendDomain"
                        className="animate-[fadein_.4s_ease-out]"
                      />
                    ))}
                  {dotsVisible &&
                    sells.map((s: any, i: number) => (
                      <ReferenceDot
                        key={`s${i}`}
                        x={s.t}
                        y={s.price}
                        r={3.5}
                        fill="#ef4444"
                        stroke="#0b0f19"
                        strokeWidth={1}
                        ifOverflow="extendDomain"
                        className="animate-[fadein_.4s_ease-out]"
                      />
                    ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Analyst summary */}
            {a ? (
              <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm border-t border-line pt-4">
                <span className="stat-label">Analytici:</span>
                {rating && (
                  <span className="font-semibold px-2 py-0.5 rounded-md" style={{ color: rating.color, background: `${rating.color}1f` }}>
                    {rating.label}
                  </span>
                )}
                <span className="text-muted">
                  Cíl <span className="text-white font-medium">{money(a.targetPrice, ccy)}</span>
                  {upside != null && <span className={upside >= 0 ? "text-pos" : "text-neg"}> ({upside >= 0 ? "+" : ""}{upside.toFixed(1)} %)</span>}
                  {" "}· {a.count} analytiků
                </span>
              </div>
            ) : (
              <div className="mt-5 text-sm text-muted border-t border-line pt-4">
                <span className="stat-label">Analytici:</span> bez pokrytí — titul nemá dostupné
                analytické odhady (běžné u menších/spekulativních firem nebo mimo US trh).
              </div>
            )}

            {/* Insider transactions */}
            {d.insider?.length ? (
              <div className="mt-5 border-t border-line pt-4">
                <div className="stat-label mb-2">Insider obchody (posledních {Math.min(d.insider.length, 8)})</div>
                <ul className="space-y-1.5">
                  {d.insider.slice(0, 8).map((t: any, i: number) => {
                    const buy = t.change > 0;
                    return (
                      <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm py-1">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${buy ? "text-pos bg-pos/10" : "text-neg bg-neg/10"}`}>
                          {buy ? "koupil" : "prodal"}
                        </span>
                        <span className="text-white/85 min-w-0 break-words">{t.name}</span>
                        <span className="tabular-nums text-muted shrink-0 ml-auto">
                          {buy ? "+" : ""}
                          {Math.round(t.change).toLocaleString("cs-CZ")} ks
                          {t.price ? ` @ ${money(t.price, ccy)}` : ""}
                        </span>
                        <span className="text-muted text-xs shrink-0 w-16 text-right">{shortDate(t.date)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {/* News */}
            <div className="mt-5 border-t border-line pt-4">
              <div className="stat-label mb-2">Novinky</div>
              {d.news?.length ? (
                <ul className="space-y-2.5">
                  {d.news.map((n: any, i: number) => (
                    <li key={i}>
                      <a href={n.link} target="_blank" rel="noreferrer" className="text-sm hover:text-brand transition leading-snug block">
                        {n.title}
                      </a>
                      <span className="text-muted text-xs">{n.source}{n.publishedAt ? ` · ${shortDate(n.publishedAt)}` : ""}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted text-sm">Žádné novinky.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, sub, hint }: { label: string; value: string; sub?: string; hint?: string }) {
  return (
    <div className="bg-panel2 rounded-xl p-3 min-w-0">
      <div className="stat-label">
        {label}
        {hint && <InfoTip text={hint} />}
      </div>
      <div className="text-lg font-semibold mt-0.5 truncate">{value}</div>
      {sub && <div className="text-muted text-xs truncate">{sub}</div>}
    </div>
  );
}
