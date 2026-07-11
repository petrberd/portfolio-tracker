"use client";

import { useEffect, useState } from "react";
import { InfoTip } from "@/components/InfoTip";
import { SemiGauge } from "@/components/Gauge";

const money = (v: number, ccy: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: ccy || "USD", maximumFractionDigits: 2 }).format(v ?? 0);

interface Holding {
  symbol: string;
  instrument: string;
}

// English rating -> Czech label + colour.
const RATING: Record<string, { label: string; color: string }> = {
  "Strong Buy": { label: "Silný nákup", color: "#16a34a" },
  Buy: { label: "Nákup", color: "#22c55e" },
  Hold: { label: "Držet", color: "#eab308" },
  Sell: { label: "Prodej", color: "#f97316" },
  "Strong Sell": { label: "Silný prodej", color: "#ef4444" },
};

// Fair-value gauge zones, keyed by upside % (target vs. current price).
// Mirrored vs. the usual layout: strongly undervalued sits on the RIGHT.
const GAUGE_ZONES = [
  { max: -18, label: "Silně nadhodnocená", color: "#ef4444" },
  { max: -6, label: "Nadhodnocená", color: "#f97316" },
  { max: 6, label: "Přiměřeně oceněná", color: "#eab308" },
  { max: 18, label: "Podhodnocená", color: "#84cc16" },
  { max: Infinity, label: "Silně podhodnocená", color: "#16a34a" },
];
const GAUGE_CLAMP = 30; // upside % mapped to the arc's outer edges beyond this

function zoneFor(upsidePct: number) {
  return GAUGE_ZONES.find((z) => upsidePct < z.max) ?? GAUGE_ZONES[GAUGE_ZONES.length - 1];
}

/** Mirrored "fair value" gauge: strongly undervalued on the right, overvalued on the left. */
function FairPriceGauge({ upsidePct }: { upsidePct: number }) {
  return (
    <SemiGauge
      zones={GAUGE_ZONES.map((z) => z.color)}
      value={upsidePct}
      min={-GAUGE_CLAMP}
      max={GAUGE_CLAMP}
      showTopTick
    />
  );
}

const ROWS: { key: keyof Breakdown; label: string; color: string }[] = [
  { key: "strongBuy", label: "Silný nákup", color: "#16a34a" },
  { key: "buy", label: "Nákup", color: "#22c55e" },
  { key: "hold", label: "Držet", color: "#64748b" },
  { key: "sell", label: "Prodej", color: "#f97316" },
  { key: "strongSell", label: "Silný prodej", color: "#ef4444" },
];

interface Breakdown {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export function AnalystPanel({ holdings, refreshTick = 0 }: { holdings: Holding[]; refreshTick?: number }) {
  const [symbol, setSymbol] = useState(holdings[0]?.symbol ?? "");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/analysts?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => !cancelled && setData(j))
      .catch(() => !cancelled && setData({ available: false }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // refreshTick bumps every 5 min to pick up newly-cached ratings without forcing a re-scrape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, refreshTick]);

  const a = data?.analysts;
  const up = data?.upsidePct ?? null;
  const ccy = data?.currency ?? "USD";
  const rating = a ? RATING[a.rating] ?? { label: a.rating, color: "#8b98b8" } : null;
  const maxCount = a ? Math.max(...ROWS.map((r) => a.breakdown[r.key]), 1) : 1;

  return (
    <div className="card p-5">
      {/* Header with selector + overall rating */}
      <div className="flex items-center justify-between gap-4 border-b border-line pb-4 mb-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="stat-label">Analytické odhady ·</span>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            autoComplete="off"
            className="bg-panel2 border border-line rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-brand"
          >
            {holdings.map((h) => (
              <option key={h.symbol} value={h.symbol}>
                {h.instrument}
              </option>
            ))}
          </select>
        </div>
        {rating && (
          <span className="text-sm font-semibold px-2.5 py-1 rounded-lg" style={{ color: rating.color, background: `${rating.color}1f` }}>
            {rating.label}
          </span>
        )}
      </div>

      {loading && <div className="h-[240px] flex items-center justify-center text-muted text-sm">Načítám odhady…</div>}

      {!loading && data && !data.available && (
        <div className="h-[240px] flex items-center justify-center text-muted text-sm text-center px-6">
          Pro tento titul nejsou dostupné analytické odhady (většinou jen US akcie).
        </div>
      )}

      {!loading && a && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Fair value gauge */}
          <div className="min-w-0">
            <div className="stat-label">
              Férová cena
              <InfoTip text="Průměrná 12měsíční cílová cena analytiků coby odhad férové hodnoty. Ukazatel: jak moc se od ní aktuální cena odchyluje (mimo ±30 % je jehla na krajní hodnotě stupnice)." />
            </div>
            <div className={`text-3xl font-semibold mt-1 ${up != null && up >= 0 ? "text-pos" : "text-neg"}`}>
              {money(a.targetPrice, ccy)}
            </div>
            {up != null && (
              <div className={`text-sm mt-1 ${up >= 0 ? "text-pos" : "text-neg"}`}>
                {up >= 0 ? "+" : ""}
                {up.toFixed(1)} % vs. aktuální cena {money(data.price, ccy)}
              </div>
            )}
            {up != null && (
              <span
                className="inline-block text-xs font-semibold px-2.5 py-1 rounded-lg mt-2"
                style={{ color: zoneFor(up).color, background: `${zoneFor(up).color}1f` }}
              >
                {zoneFor(up).label}
              </span>
            )}
            {up != null && <FairPriceGauge upsidePct={up} />}
            <div className="text-muted text-xs mt-2">Podle {a.count} analytiků za poslední ~3 měsíce.</div>
          </div>

          {/* Rating breakdown */}
          <div className="space-y-2 min-w-0">
            {ROWS.map((r) => {
              const n = a.breakdown[r.key] as number;
              return (
                <div key={r.key} className="flex items-center gap-3 text-sm">
                  <span className="w-[92px] shrink-0 text-white/80">{r.label}</span>
                  <div className="flex-1 h-2.5 bg-panel2 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(n / maxCount) * 100}%`, background: r.color }} />
                  </div>
                  <span className="w-7 text-right tabular-nums text-muted shrink-0">{n}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-muted text-[11px] mt-5">Zdroj: stockanalysis.com · Souhrn cílových cen a doporučení analytiků, ne investiční doporučení.</p>
    </div>
  );
}
