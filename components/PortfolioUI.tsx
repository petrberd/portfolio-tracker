"use client";

// Shared dashboard building blocks used by both the real app (app/page.tsx) and
// the public demo (app/demo/page.tsx). Split out from app/page.tsx because
// Next.js's typed-routes build fails if a page.tsx file has any named exports
// beyond its default component and the reserved route-config exports.

import { Fragment, useState } from "react";
import { czk, num, pct, shortDate } from "@/lib/format";
import { PALETTE } from "@/components/Charts";
import { InfoTip } from "@/components/InfoTip";
import { IconButton } from "@/components/IconButton";
import { holdingTaxStatus } from "@/lib/taxtest";

const money = (v: number, ccy: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: ccy || "USD", maximumFractionDigits: 2 }).format(v ?? 0);

/** "YYYY-MM" shifted by `n` months (n can be negative). */
export function addMonths(yyyyMm: string, n: number): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** "YYYY-MM" -> "M/YYYY" (e.g. "2024-10" -> "10/2024"). */
export function monthYear(yyyyMm: string): string {
  if (!yyyyMm) return "";
  const [y, m] = yyyyMm.split("-");
  return `${parseInt(m, 10)}/${y}`;
}

export function Kpi({ label, value, sub, tone, hint }: { label: string; value: string; sub?: string; tone?: "pos" | "neg"; hint?: string }) {
  const toneCls = tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "text-white";
  return (
    <div className="card p-4 min-w-0">
      <div className="stat-label">
        {label}
        {hint && <InfoTip text={hint} />}
      </div>
      <div className={`text-xl font-semibold mt-1 tabular-nums ${toneCls} truncate`}>{value}</div>
      {sub && <div className="text-muted text-xs mt-1 truncate">{sub}</div>}
    </div>
  );
}

export function MiniStat({ label, value, tone, hint }: { label: string; value: string; tone?: "pos" | "neg"; hint?: string }) {
  const toneCls = tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "text-white";
  return (
    <div className="bg-panel2 rounded-xl p-3 min-w-0">
      <div className="stat-label">
        {label}
        {hint && <InfoTip text={hint} />}
      </div>
      <div className={`text-lg font-semibold mt-0.5 tabular-nums ${toneCls} truncate`}>{value}</div>
    </div>
  );
}

export function Section({
  title,
  subtitle,
  action,
  hint,
  className,
  children,
  secondary,
  onHide,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  hint?: string;
  className?: string;
  children: React.ReactNode;
  /** Lower-priority sections (VIX, earnings, tax) read visually quieter, so primary
   * sections (value, performance, allocation, holdings) keep first claim on attention. */
  secondary?: boolean;
  /** Shows a small "hide this section" control in the header when provided. */
  onHide?: () => void;
}) {
  return (
    <div className={`card p-5 min-w-0 ${secondary ? "card-secondary" : ""} ${className ?? ""}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className={secondary ? "text-sm font-medium text-white/85" : "text-base font-semibold"}>
            {title}
            {hint && <InfoTip text={hint} />}
          </h2>
          {subtitle && <p className="text-muted text-xs mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {action}
          {onHide && (
            <IconButton
              onClick={onHide}
              label={`Skrýt sekci ${title}`}
              tooltip="Dočasně skryje tuto sekci. Zpátky ji zapneš přes „Skryté sekce“ nahoře na stránce."
            >
              −
            </IconButton>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

export function Toggle({
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
          className={`px-3.5 py-2.5 min-h-[44px] transition ${
            value === o.value ? "bg-brand text-white" : "text-muted hover:bg-panel2"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function HoldingsTable({
  holdings,
  total,
  onSelect,
  onAlertChange,
}: {
  holdings: any[];
  total: number;
  onSelect: (h: { ticker: string; instrument: string }) => void;
  /** Omitted on /demo — when absent the per-row alert UI (and its own row expansion) is hidden. */
  onAlertChange?: (symbol: string, alert: { targetPrice: number; direction: "above" | "below" } | null) => void;
}) {
  const [editingSymbol, setEditingSymbol] = useState<string | null>(null);
  const [alertPrice, setAlertPrice] = useState("");
  const [alertDir, setAlertDir] = useState<"above" | "below">("above");

  const openAlertEditor = (h: any) => {
    setEditingSymbol(h.symbol);
    setAlertPrice(h.alert ? String(h.alert.targetPrice) : h.livePrice ? h.livePrice.toFixed(2) : "");
    setAlertDir(h.alert?.direction ?? "above");
  };

  const saveAlert = (symbol: string) => {
    const price = parseFloat(alertPrice.replace(",", "."));
    if (!Number.isFinite(price) || price <= 0) return;
    onAlertChange?.(symbol, { targetPrice: price, direction: alertDir });
    setEditingSymbol(null);
  };

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
          {holdings.map((h, i) => {
            const rowClick = () => onSelect({ ticker: h.ticker, instrument: h.instrument });
            return (
              <Fragment key={h.ticker}>
                <tr className={`border-b border-line/50 ${h.alertTriggered ? "bg-pos/5" : ""}`}>
                  <td className="py-2.5 cursor-pointer hover:bg-panel2/40" onClick={rowClick}>
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full shrink-0 mt-0.5 self-start" style={{ background: PALETTE[i % PALETTE.length] }} />
                      <div className="min-w-0">
                        <div className="font-medium">{h.instrument}</div>
                        <div className="text-muted text-xs">{h.ticker}</div>
                        {/* Mobile-only: the columns hidden below sm are folded in here so nothing is lost. */}
                        <div className="sm:hidden flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted text-[11px] mt-1">
                          <span>{num(h.shares, 4)} ks</span>
                          {h.avgNativePrice && <span>⌀ {num(h.avgNativePrice)} {h.currency}</span>}
                          {h.livePrice && (
                            <span>
                              {num(h.livePrice)} {h.currency}
                              {h.dayChangePercent ? (
                                <span className={h.dayChangePercent >= 0 ? "text-pos" : "text-neg"}> {pct(h.dayChangePercent)}</span>
                              ) : null}
                            </span>
                          )}
                          {total > 0 && <span>{((h.marketValueCzk / total) * 100).toFixed(1)} % podílu</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden sm:table-cell text-right tabular-nums cursor-pointer hover:bg-panel2/40" onClick={rowClick}>
                    {num(h.shares, 4)}
                    <div className="text-muted text-xs">
                      {h.avgNativePrice ? `⌀ ${num(h.avgNativePrice)} ${h.currency}` : "—"}
                    </div>
                  </td>
                  <td className="hidden sm:table-cell text-right tabular-nums cursor-pointer hover:bg-panel2/40" onClick={rowClick}>
                    {h.livePrice ? `${num(h.livePrice)} ${h.currency}` : "—"}
                    {h.dayChangePercent ? (
                      <div className={`text-xs ${h.dayChangePercent >= 0 ? "text-pos" : "text-neg"}`}>{pct(h.dayChangePercent)}</div>
                    ) : null}
                  </td>
                  <td className="text-right tabular-nums cursor-pointer hover:bg-panel2/40" onClick={rowClick}>
                    {czk(h.marketValueCzk)}
                  </td>
                  <td
                    className={`text-right tabular-nums cursor-pointer hover:bg-panel2/40 ${h.unrealizedPnlCzk >= 0 ? "text-pos" : "text-neg"}`}
                    onClick={rowClick}
                  >
                    <div>{czk(h.unrealizedPnlCzk)}</div>
                    <div className="text-xs">{pct(h.unrealizedPnlPct)}</div>
                  </td>
                  <td className="hidden sm:table-cell text-right tabular-nums text-muted cursor-pointer hover:bg-panel2/40" onClick={rowClick}>
                    {total > 0 ? `${((h.marketValueCzk / total) * 100).toFixed(1)} %` : "—"}
                  </td>
                </tr>
                {onAlertChange && (
                  <tr className="border-b border-line/50">
                    <td colSpan={6} className="pb-2.5 pt-0 pl-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {h.alertTriggered && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg text-pos bg-pos/10">
                            🔔 Cíl dosažen
                          </span>
                        )}
                        {editingSymbol === h.symbol ? (
                          <>
                            <select
                              value={alertDir}
                              onChange={(e) => setAlertDir(e.target.value as "above" | "below")}
                              className="bg-panel2 border border-line rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-brand"
                            >
                              <option value="above">při růstu nad</option>
                              <option value="below">při poklesu pod</option>
                            </select>
                            <input
                              value={alertPrice}
                              onChange={(e) => setAlertPrice(e.target.value)}
                              inputMode="decimal"
                              className="w-24 bg-panel2 border border-line rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-brand"
                            />
                            <button
                              onClick={() => saveAlert(h.symbol)}
                              className="text-xs px-2.5 py-1.5 rounded-lg bg-brand text-white hover:opacity-90 transition"
                            >
                              Uložit
                            </button>
                            <button
                              onClick={() => setEditingSymbol(null)}
                              className="text-xs px-2 py-1.5 rounded-lg text-muted hover:bg-panel2 transition"
                            >
                              Zrušit
                            </button>
                          </>
                        ) : h.alert ? (
                          <>
                            <button
                              onClick={() => openAlertEditor(h)}
                              className="text-xs px-2 py-1 rounded-lg border border-line text-muted hover:bg-panel2 transition"
                            >
                              Alert {h.alert.direction === "above" ? "≥" : "≤"} {money(h.alert.targetPrice, h.currency)}
                            </button>
                            <button onClick={() => onAlertChange(h.symbol, null)} className="text-xs text-muted hover:text-neg transition">
                              zrušit
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => openAlertEditor(h)}
                            className="text-xs px-2 py-1 rounded-lg border border-line text-muted hover:bg-panel2 transition"
                          >
                            + Nastavit alert
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TaxTestTable({ holdings }: { holdings: any[] }) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const rows = holdings.map((h) => ({ h, status: holdingTaxStatus(h.lots ?? [], todayIso) }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted text-xs uppercase tracking-wide border-b border-line">
            <th className="text-left font-medium py-2">Titul</th>
            <th className="hidden sm:table-cell text-right font-medium py-2">Kusů celkem</th>
            <th className="text-right font-medium py-2">Osvobozeno (časový test)</th>
            <th className="hidden sm:table-cell text-right font-medium py-2">Příští osvobození</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ h, status }) => (
            <tr key={h.ticker} className="border-b border-line/50">
              <td className="py-2.5">
                <div className="font-medium">{h.instrument}</div>
                <div className="text-muted text-xs">{h.ticker}</div>
                {/* Mobile-only: kusů celkem/příští osvobození folded in here since those columns hide below sm. */}
                <div className="sm:hidden flex flex-wrap gap-x-2 text-muted text-[11px] mt-1">
                  <span>{num(status.totalShares, 4)} ks celkem</span>
                  {status.nextExemptDate && (
                    <span>
                      další {shortDate(status.nextExemptDate)} ({num(status.nextExemptShares, 4)} ks)
                    </span>
                  )}
                </div>
              </td>
              <td className="hidden sm:table-cell text-right tabular-nums">{num(status.totalShares, 4)}</td>
              <td className="text-right tabular-nums">
                {num(status.exemptShares, 4)}
                {status.pendingShares <= 1e-6 && <span className="text-pos text-xs ml-1">✓ vše</span>}
              </td>
              <td className="hidden sm:table-cell text-right tabular-nums text-muted">
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

export function Splash({ msg }: { msg: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center text-muted">
      <div className="text-center">
        <div className="animate-pulse text-brand text-3xl mb-3">◐</div>
        {msg}
      </div>
    </div>
  );
}

export function Empty({ msg }: { msg: string }) {
  return <div className="h-[260px] flex items-center justify-center text-muted text-sm text-center px-6">{msg}</div>;
}
