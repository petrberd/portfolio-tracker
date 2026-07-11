"use client";

import { useEffect, useState } from "react";

const shortDate = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "short", year: "2-digit" }) : "—";

function fmtShares(n: number): string {
  const abs = Math.abs(n);
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M ks`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}k ks`;
  return `${sign}${abs} ks`;
}

/** Form 4 share counts are always positive magnitudes — the P/S code carries the sign. */
function fmtTradeShares(shares: number, code: "P" | "S"): string {
  return fmtShares(code === "S" ? -shares : shares);
}

const MOVE_LABEL: Record<string, { label: string; pos: boolean }> = {
  new: { label: "nový nákup", pos: true },
  increased: { label: "navýšení", pos: true },
  decreased: { label: "snížení", pos: false },
  closed: { label: "uzavřeno", pos: false },
};

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-brand/20 text-brand mb-2">
      {children}
    </span>
  );
}

export function SmartMoney({ refreshTick = 0 }: { refreshTick?: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/smartmoney", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => !cancelled && setData(j))
      .catch(() => !cancelled && setData({ available: false }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  if (loading) return <div className="h-[200px] flex items-center justify-center text-muted text-sm">Načítám smart money data…</div>;
  if (!data?.available) return <div className="h-[120px] flex items-center justify-center text-muted text-sm">Nepodařilo se načíst.</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {(data.managers ?? []).map((m: any) => (
        <div key={m.fund} className="bg-panel2 rounded-xl p-4 min-w-0">
          <Tag>Super investoři</Tag>
          <div className="font-semibold">{m.person}</div>
          <div className="text-muted text-xs mb-2 truncate">
            {m.fund} · 13F k {shortDate(m.periodOfReport)}
          </div>
          <div className="space-y-1.5">
            {m.moves.slice(0, 3).map((mv: any, i: number) => {
              const info = MOVE_LABEL[mv.kind];
              return (
                <div key={i} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{mv.name}</span>
                  <span className={`text-xs font-medium shrink-0 ${info.pos ? "text-pos" : "text-neg"}`}>
                    {info.label} ({fmtShares(mv.sharesDelta)})
                  </span>
                </div>
              );
            })}
            {!m.moves.length && <div className="text-muted text-xs">Žádné změny oproti minulému čtvrtletí.</div>}
          </div>
        </div>
      ))}

      {(data.insiders ?? []).map((p: any) => (
        <div key={p.person} className="bg-panel2 rounded-xl p-4 min-w-0">
          <Tag>Insideři</Tag>
          <div className="font-semibold">{p.person}</div>
          <div className="text-muted text-xs mb-2 truncate">
            {p.officerTitle || p.company} · Form 4
          </div>
          <div className="space-y-1.5">
            {p.trades.slice(0, 3).map((t: any, i: number) => (
              <div key={i} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{t.ticker || t.issuer}</span>
                <span className={`text-xs font-medium shrink-0 ${t.code === "P" ? "text-pos" : "text-neg"}`}>
                  {t.code === "P" ? "nákup" : "prodej"} {fmtTradeShares(t.shares, t.code)}
                </span>
              </div>
            ))}
            {!p.trades.length && (
              <div className="text-muted text-xs">Žádný nákup/prodej na volném trhu v posledních Form 4.</div>
            )}
          </div>
        </div>
      ))}

      <p className="lg:col-span-2 text-muted text-[11px] mt-1">
        Zdroj: SEC EDGAR (13F-HR a Form 4). 13F ukazuje jen stav držby ke konci čtvrtletí (ne přímo transakce) se
        zpožděním až 45 dní — „nákup/prodej" u super investorů je dopočtená změna pozice mezi dvěma čtvrtletími, ne
        aktuální obchod. U 13F pozic chybí spolehlivé bezplatné mapování CUSIP → ticker, proto je uveden název firmy.
        U insiderů se počítají jen skutečné nákupy/prodeje na volném trhu (kódy P/S), ne granty ani daňové odvody.
      </p>
    </div>
  );
}
