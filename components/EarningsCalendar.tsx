"use client";

import { useEffect, useState } from "react";

const shortDate = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "short", year: "2-digit" }) : "—";

export function EarningsCalendar({ refreshTick = 0 }: { refreshTick?: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/earnings", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => !cancelled && setData(j))
      .catch(() => !cancelled && setData({ available: false }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  if (loading) return <div className="h-[120px] flex items-center justify-center text-muted text-sm">Načítám earnings kalendář…</div>;
  if (!data?.available || !data.events?.length)
    return <div className="h-[120px] flex items-center justify-center text-muted text-sm">Žádné nadcházející earnings.</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted text-xs uppercase tracking-wide border-b border-line">
            <th className="text-left font-medium py-2">Titul</th>
            <th className="text-right font-medium py-2">Datum</th>
          </tr>
        </thead>
        <tbody>
          {data.events.map((e: any) => (
            <tr key={e.ticker} className="border-b border-line/50">
              <td className="py-2.5">
                <div className="font-medium">{e.instrument}</div>
                <div className="text-muted text-xs">{e.ticker}</div>
              </td>
              <td className="text-right tabular-nums">
                {shortDate(e.date)}
                {e.estimated && <span className="text-[10px] ml-1 text-muted/70">(odhad)</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-muted text-[11px] mt-2">Zdroj: stockanalysis.com. „(odhad)" = promítnuto o ~91 dní dopředu.</p>
    </div>
  );
}
