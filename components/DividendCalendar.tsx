"use client";

import { useEffect, useState } from "react";
import { DividendStackedChart } from "@/components/Charts";
import { InfoTip } from "@/components/InfoTip";
import { SkeletonBlock } from "@/components/Skeleton";
import { czk } from "@/lib/format";

const shortDate = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "short", year: "2-digit" }) : "—";

export function DividendCalendar({ refreshTick = 0, endpoint = "/api/dividends" }: { refreshTick?: number; endpoint?: string }) {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // refreshTick > 0 means "Obnovit ceny" or the 5-min auto-refresh triggered this —
    // bypass the server's price/dividend cache then, same as the other panels.
    fetch(`${endpoint}${refreshTick > 0 ? "?refresh=1" : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => !cancelled && setD(j))
      .catch(() => !cancelled && setD({ available: false }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick, endpoint]);

  if (loading) return <SkeletonBlock height={300} lines={5} />;
  if (!d?.available || !d.payments?.length)
    return <div className="h-[120px] flex items-center justify-center text-muted text-sm">Žádné projektované dividendy.</div>;

  const monthly = d.annualIncomeCzk / 12;
  const upcoming = d.payments.slice(0, 10);

  return (
    <div className="animate-[fadein_.2s_ease-out]">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Stat label="Příjem / 12 měsíců" value={czk(d.annualIncomeCzk)} tone hint="Očekávaný příjem na příštích 12 měsíců: dividendy + úroky ze spořicích účtů." />
        <Stat label="Průměrně měsíčně" value={czk(monthly)} hint="Roční projektovaný příjem dělený dvanácti." />
        <Stat label="z toho dividendy" value={czk(d.dividendCzk ?? 0)} hint="Část projekce z dividend akcií (podle počtu kusů k ex-dni)." />
        <Stat label="z toho úroky (netto)" value={czk(d.interestCzk ?? 0)} hint="Část projekce z úroků spořicích účtů, netto po 15% srážkové dani." />
      </div>

      <DividendStackedChart data={d.byMonthBreakdown} tickers={d.incomeSources} />

      <div className="mt-4 overflow-x-auto">
        <div className="stat-label mb-2">Nejbližší platby</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted text-xs uppercase tracking-wide border-b border-line">
              <th className="text-left font-medium py-2">Titul</th>
              <th className="hidden sm:table-cell text-left font-medium py-2">Ex-dividend</th>
              <th className="hidden sm:table-cell text-left font-medium py-2">Výplata</th>
              <th className="text-right font-medium py-2">Očekáváno</th>
            </tr>
          </thead>
          <tbody>
            {upcoming.map((p: any, i: number) => (
              <tr key={i} className="border-b border-line/50">
                <td className="py-2">
                  {p.instrument}
                  {/* Mobile-only: ex-dividend/výplata folded in here since the dedicated columns are hidden below sm. */}
                  <div className="sm:hidden flex flex-wrap gap-x-2 text-muted text-[11px] mt-0.5">
                    {p.kind !== "interest" && <span>ex {shortDate(p.exDate)}</span>}
                    <span>
                      výplata {shortDate(p.payDate)}
                      {p.estimatedPay && <span className="ml-1">(odhad)</span>}
                    </span>
                  </div>
                </td>
                <td className="hidden sm:table-cell py-2 tabular-nums text-muted">{p.kind === "interest" ? "—" : shortDate(p.exDate)}</td>
                <td className="hidden sm:table-cell py-2 tabular-nums text-muted">
                  {shortDate(p.payDate)}
                  {p.estimatedPay && <span className="text-xs ml-1 text-muted">(odhad)</span>}
                </td>
                <td className="py-2 text-right tabular-nums text-pos">{czk(p.incomeCzk)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-muted text-[11px] mt-3">
        Dividendy: podle počtu akcií k ex-dni a poslední dividendy (extrapolovaná kadence), ex/pay date z Nasdaqu (reálné) nebo
        Yahoo (pay date odhad). Úroky: ze spořicích účtů, netto po 15% srážkové dani, výplata 1. dne měsíce. Nezohledňuje růst ani škrty.
      </p>
    </div>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: boolean; hint?: string }) {
  return (
    <div className="bg-panel2 rounded-xl p-3 min-w-0">
      <div className="stat-label">
        {label}
        {hint && <InfoTip text={hint} />}
      </div>
      <div className={`text-lg font-semibold mt-0.5 ${tone ? "text-pos" : "text-white"} truncate`}>{value}</div>
    </div>
  );
}
