"use client";

import { useEffect, useState } from "react";
import { InfoTip } from "@/components/InfoTip";
import { SemiGauge } from "@/components/Gauge";
import { VixChart } from "@/components/Charts";

// VIX level bands — the commonly-cited rule-of-thumb reading of the index, not
// an official CBOE classification.
const VIX_LEVELS = [
  { max: 12, label: "Extrémní klid", color: "#16a34a" },
  { max: 20, label: "Klid", color: "#84cc16" },
  { max: 30, label: "Zvýšená nervozita", color: "#eab308" },
  { max: 40, label: "Strach", color: "#f97316" },
  { max: Infinity, label: "Panika", color: "#ef4444" },
];
const VIX_MIN = 10;
const VIX_MAX = 45;

function levelFor(vix: number) {
  return VIX_LEVELS.find((l) => vix < l.max) ?? VIX_LEVELS[VIX_LEVELS.length - 1];
}

export function MarketMood({ refreshTick = 0 }: { refreshTick?: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/market", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => !cancelled && setData(j))
      .catch(() => !cancelled && setData({ available: false }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  if (loading) return <div className="h-[240px] flex items-center justify-center text-muted text-sm">Načítám VIX…</div>;
  if (!data?.available)
    return <div className="h-[120px] flex items-center justify-center text-muted text-sm">VIX se nepodařilo načíst.</div>;

  const level = levelFor(data.vix);

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center mb-4">
        <div className="min-w-0">
          <div className="text-4xl font-semibold">{data.vix.toFixed(1)}</div>
          {data.changePercent != null && (
            <div className={`text-sm mt-1 ${data.changePercent >= 0 ? "text-neg" : "text-pos"}`}>
              {data.changePercent >= 0 ? "+" : ""}
              {data.changePercent.toFixed(1)} % oproti včerejšímu uzavření
            </div>
          )}
          <span
            className="inline-block text-xs font-semibold px-2.5 py-1 rounded-lg mt-2"
            style={{ color: level.color, background: `${level.color}1f` }}
          >
            {level.label}
          </span>
        </div>
        <SemiGauge zones={VIX_LEVELS.map((l) => l.color)} value={data.vix} min={VIX_MIN} max={VIX_MAX} />
      </div>
      {data.history?.length ? (
        <VixChart data={data.history} />
      ) : (
        <div className="h-[120px] flex items-center justify-center text-muted text-sm">Historie VIX se nepodařilo načíst.</div>
      )}
    </div>
  );
}
