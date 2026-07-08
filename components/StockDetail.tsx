"use client";

import { useEffect, useState } from "react";
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
}: {
  ticker: string;
  instrument: string;
  onClose: () => void;
}) {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/stockdetail?ticker=${encodeURIComponent(ticker)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => !cancelled && setD(j))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const ccy = d?.currency ?? "USD";
  const f = d?.fundamentals;
  const a = d?.analysts;
  const rating = a ? RATING[a.rating] ?? { label: a.rating, color: "#8b98b8" } : null;
  const upside = a && d?.price > 0 && a.targetPrice > 0 ? ((a.targetPrice - d.price) / d.price) * 100 : null;

  const line = (d?.history ?? []).map((h: any) => ({ t: new Date(h.date).getTime(), close: h.close }));
  const buys = (d?.trades ?? []).filter((t: any) => t.side === "buy").map((t: any) => ({ t: new Date(t.date).getTime(), price: t.price }));
  const sells = (d?.trades ?? []).filter((t: any) => t.side === "sell").map((t: any) => ({ t: new Date(t.date).getTime(), price: t.price }));
  const xDomain = line.length ? [line[0].t, line[line.length - 1].t] : [0, 1];
  const allPrices = [...line.map((p: any) => p.close), ...buys.map((b: any) => b.price), ...sells.map((s: any) => s.price)];
  const yMin = allPrices.length ? Math.min(...allPrices) : 0;
  const yMax = allPrices.length ? Math.max(...allPrices) : 1;
  const yPad = (yMax - yMin) * 0.06 || 1;

  const pe = f && f.eps > 0 && d?.price ? d.price / f.eps : null;
  const marketCap = f && f.shares > 0 && d?.price ? d.price * f.shares : null;
  const netMargin = f && f.revenue > 0 ? (f.netIncome / f.revenue) * 100 : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4 sm:p-8" onClick={onClose}>
      <div
        className="card w-full max-w-4xl my-4 p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-muted hover:text-white text-xl leading-none">
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

        {loading && <div className="h-[380px] flex items-center justify-center text-muted">Načítám detail…</div>}

        {!loading && d && (
          <>
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
                  {d.dividend.estimatedPay && <span className="text-[10px] ml-1">(odhad)</span>}
                </span>
                <span className="text-muted">
                  <span className="text-white font-medium">{money(d.dividend.perShare, ccy)}</span>/akcii ·{" "}
                  {d.dividend.perYear === 12 ? "měsíčně" : d.dividend.perYear === 4 ? "kvartálně" : d.dividend.perYear === 2 ? "pololetně" : "ročně"}
                </span>
              </div>
            )}

            {/* Price chart with your trades */}
            <div className="mt-5">
              <div className="flex items-center justify-between mb-1">
                <span className="stat-label">Cena za 2 roky · tvé obchody</span>
                <span className="text-xs text-muted flex gap-3">
                  <span><span className="inline-block w-2 h-2 rounded-full align-middle mr-1" style={{ background: "#22c55e" }} />nákup</span>
                  <span><span className="inline-block w-2 h-2 rounded-full align-middle mr-1" style={{ background: "#ef4444" }} />prodej</span>
                </span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={line} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1b2438" vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={xDomain}
                    tick={{ fill: "#8b98b8", fontSize: 11 }}
                    tickFormatter={(t) => new Date(t).toLocaleDateString("cs-CZ", { month: "short", year: "2-digit" })}
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
                    labelFormatter={(t) => shortDate(new Date(t as number).toISOString())}
                    formatter={(v: number) => [money(v, ccy), "Cena"]}
                  />
                  <Line type="monotone" dataKey="close" stroke="#7ea2ff" strokeWidth={2.2} dot={false} name="close" />
                  {buys.map((b: any, i: number) => (
                    <ReferenceDot key={`b${i}`} x={b.t} y={b.price} r={3.5} fill="#22c55e" stroke="#0b0f19" strokeWidth={1} ifOverflow="extendDomain" />
                  ))}
                  {sells.map((s: any, i: number) => (
                    <ReferenceDot key={`s${i}`} x={s.t} y={s.price} r={3.5} fill="#ef4444" stroke="#0b0f19" strokeWidth={1} ifOverflow="extendDomain" />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Analyst summary */}
            {a && (
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
            )}

            {/* Insider transactions */}
            {d.insider?.length ? (
              <div className="mt-5 border-t border-line pt-4">
                <div className="stat-label mb-2">Insider obchody (posledních {Math.min(d.insider.length, 8)})</div>
                <ul className="space-y-1.5">
                  {d.insider.slice(0, 8).map((t: any, i: number) => {
                    const buy = t.change > 0;
                    return (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${buy ? "text-pos bg-pos/10" : "text-neg bg-neg/10"}`}>
                          {buy ? "koupil" : "prodal"}
                        </span>
                        <span className="truncate flex-1 text-white/85">{t.name}</span>
                        <span className="tabular-nums text-muted shrink-0">
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
          </>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, sub, hint }: { label: string; value: string; sub?: string; hint?: string }) {
  return (
    <div className="bg-panel2 rounded-xl p-3">
      <div className="stat-label">
        {label}
        {hint && <InfoTip text={hint} />}
      </div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
      {sub && <div className="text-muted text-xs">{sub}</div>}
    </div>
  );
}
