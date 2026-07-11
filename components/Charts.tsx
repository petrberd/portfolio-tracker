"use client";

import { useEffect, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { czk, monthLabel, pct, shortDate } from "@/lib/format";

/** True below the sm breakpoint — lets charts thin out/rotate x-axis ticks on narrow phones. */
function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    setMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return mobile;
}

const PALETTE = [
  "#5b8cff", "#22c55e", "#f59e0b", "#ec4899", "#14b8a6",
  "#a855f7", "#ef4444", "#84cc16", "#06b6d4", "#f97316",
  "#8b5cf6", "#eab308", "#10b981", "#f43f5e", "#3b82f6",
];

const axisStyle = { fill: "#8b98b8", fontSize: 11 };
const tooltipStyle = {
  background: "#131a2a",
  border: "1px solid #26304a",
  borderRadius: 12,
  color: "#e6ebf5",
  fontSize: 13,
};
// Item/label text can otherwise inherit a dark series colour and become unreadable.
const tipItem = { color: "#e6ebf5" };
const tipLabel = { color: "#f0f3fa", fontWeight: 600, marginBottom: 2 };
const legendText = (v: string) => <span style={{ color: "#c7d0e6" }}>{v}</span>;
const periodLabel = (p: string) => (p.length > 4 ? monthLabel(p) : p); // "YYYY-MM" -> MM/YY, "YYYY" stays

/** Custom tooltip for the value chart: market value, cost basis, and their difference (unrealized P/L). */
function ValueTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const market = payload.find((p: any) => p.dataKey === "market")?.value ?? 0;
  const cost = payload.find((p: any) => p.dataKey === "costBasis")?.value ?? 0;
  const diff = market - cost;
  return (
    <div style={{ ...tooltipStyle, padding: "8px 12px" }}>
      <div style={tipLabel}>{shortDate(label)}</div>
      <div style={{ color: "#7ea2ff" }}>Tržní hodnota: {czk(market)}</div>
      <div style={{ color: "#f59e0b" }}>Pořizovací cena: {czk(cost)}</div>
      <div
        style={{
          color: diff >= 0 ? "#22c55e" : "#ef4444",
          marginTop: 5,
          paddingTop: 5,
          borderTop: "1px solid #26304a",
          fontWeight: 600,
        }}
      >
        Nerealizovaný zisk: {diff >= 0 ? "+" : ""}
        {czk(diff)}
      </div>
    </div>
  );
}

/** Stock-holdings market value (area) vs. FIFO cost basis (solid line). */
export function ValueChart({ data }: { data: { date: string; market: number; costBasis: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="valGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5b8cff" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#5b8cff" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1b2438" vertical={false} />
        <XAxis
          dataKey="date"
          tick={axisStyle}
          minTickGap={48}
          tickFormatter={(d) => new Date(d).toLocaleDateString("cs-CZ", { month: "short", year: "2-digit" })}
        />
        <YAxis tick={axisStyle} width={72} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
        <Tooltip content={<ValueTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} formatter={legendText} />
        <Area type="monotone" dataKey="market" stroke="#5b8cff" strokeWidth={2} fill="url(#valGrad)" name="Tržní hodnota" />
        <Line type="monotone" dataKey="costBasis" stroke="#f59e0b" strokeWidth={2.5} dot={false} name="Pořizovací cena" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** VIX history (~6 months) with the same calm/nervous/fear/panic band thresholds as the gauge. */
export function VixChart({ data }: { data: { date: string; vix: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="vixGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1b2438" vertical={false} />
        <XAxis
          dataKey="date"
          tick={axisStyle}
          minTickGap={48}
          tickFormatter={(d) => new Date(d).toLocaleDateString("cs-CZ", { day: "numeric", month: "short" })}
        />
        <YAxis tick={axisStyle} width={32} domain={["dataMin - 2", "dataMax + 2"]} />
        <Tooltip
          contentStyle={tooltipStyle}
          itemStyle={tipItem}
          labelStyle={tipLabel}
          labelFormatter={(d) => shortDate(d as string)}
          formatter={(v: number) => [v.toFixed(1), "VIX"]}
        />
        <ReferenceLine y={20} stroke="#8b98b8" strokeDasharray="3 3" />
        <ReferenceLine y={30} stroke="#8b98b8" strokeDasharray="3 3" />
        <Area type="monotone" dataKey="vix" stroke="#f59e0b" strokeWidth={2} fill="url(#vixGrad)" dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Per-period portfolio performance (market gain, contributions removed). */
export function PerformanceChart({ data }: { data: { period: string; gain: number; gainPct: number }[] }) {
  const isMobile = useIsMobile();
  // On phones, all-horizontal labels for every month collide into unreadable overlap.
  // Angle them and, if there are a lot of bars, skip every other label.
  const crowded = isMobile && data.length > 6;
  return (
    <ResponsiveContainer width="100%" height={crowded ? 320 : 300}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: 8, bottom: crowded ? 22 : 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1b2438" vertical={false} />
        <XAxis
          dataKey="period"
          tick={{ ...axisStyle, fontSize: crowded ? 10 : 11 }}
          interval={crowded ? 1 : 0}
          angle={crowded ? -45 : 0}
          textAnchor={crowded ? "end" : "middle"}
          height={crowded ? 40 : 30}
          tickFormatter={periodLabel}
        />
        <YAxis tick={axisStyle} width={64} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
        <Tooltip
          contentStyle={tooltipStyle}
          itemStyle={tipItem}
          labelStyle={tipLabel}
          cursor={{ fill: "#ffffff08" }}
          labelFormatter={periodLabel}
          formatter={(v: number, _n, p: any) => {
            const gp = p?.payload?.gainPct;
            return [`${czk(v)}${gp != null ? `  ·  výnos (TWR) ${pct(gp)}` : ""}`, "Zisk"];
          }}
        />
        <Bar dataKey="gain" radius={[3, 3, 0, 0]} isAnimationActive={false} minPointSize={3}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.gain >= 0 ? "#22c55e" : "#ef4444"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Portfolio vs. S&P 500, both rebased to 100. */
export function BenchmarkChart({ data }: { data: { date: string; portfolio: number; sp500: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1b2438" vertical={false} />
        <XAxis
          dataKey="date"
          tick={axisStyle}
          minTickGap={48}
          tickFormatter={(d) => new Date(d).toLocaleDateString("cs-CZ", { month: "short", year: "2-digit" })}
        />
        <YAxis tick={axisStyle} width={44} domain={["auto", "auto"]} tickFormatter={(v) => `${Math.round(v)}`} />
        <Tooltip
          contentStyle={tooltipStyle}
          itemStyle={tipItem}
          labelStyle={tipLabel}
          labelFormatter={(l) => shortDate(l as string)}
          formatter={(v: number, name) => [`${v.toFixed(1)}`, name]}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} formatter={legendText} />
        <Line type="monotone" dataKey="portfolio" stroke="#5b8cff" strokeWidth={2.2} dot={false} name="Tvé portfolio" />
        <Line type="monotone" dataKey="sp500" stroke="#f59e0b" strokeWidth={2} dot={false} name="S&P 500 (Total Return)" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function AllocationPie({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={1.5} stroke="#131a2a">
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} itemStyle={tipItem} labelStyle={tipLabel} formatter={(v: number) => czk(v)} />
        <Legend wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Gross dividends per month, stacked by the contributing stock. */
export function DividendStackedChart({
  data,
  tickers,
}: {
  data: Record<string, number | string>[];
  tickers: { ticker: string; instrument: string }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1b2438" vertical={false} />
        <XAxis dataKey="month" tick={axisStyle} minTickGap={20} tickFormatter={monthLabel} />
        <YAxis tick={axisStyle} width={56} tickFormatter={(v) => `${Math.round(v)}`} />
        <Tooltip
          contentStyle={tooltipStyle}
          itemStyle={tipItem}
          labelStyle={tipLabel}
          labelFormatter={monthLabel}
          formatter={(v: number, name) => [czk(v), name]}
          itemSorter={(item: any) => -item.value}
        />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} formatter={legendText} />
        {tickers.map((t, i) => (
          <Bar
            key={t.ticker}
            dataKey={t.ticker}
            name={t.instrument}
            stackId="div"
            fill={t.ticker === "__other" ? "#64748b" : PALETTE[i % PALETTE.length]}
            radius={i === tickers.length - 1 ? [3, 3, 0, 0] : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Monthly deposits only (from a given start month). */
export function DepositsChart({ data }: { data: { month: string; deposits: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1b2438" vertical={false} />
        <XAxis dataKey="month" tick={axisStyle} minTickGap={20} tickFormatter={monthLabel} />
        <YAxis tick={axisStyle} width={56} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
        <Tooltip contentStyle={tooltipStyle} itemStyle={tipItem} labelStyle={tipLabel} labelFormatter={monthLabel} formatter={(v: number) => [czk(v), "Vklady"]} />
        <Bar dataKey="deposits" fill="#5b8cff" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Projected dividend income per month (CZK). */
export { PALETTE };
