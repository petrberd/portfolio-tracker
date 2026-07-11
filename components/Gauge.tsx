"use client";

/** Point on a semicircle gauge's arc at angle `g` (0 = left end, 180 = right end). */
export function gaugePoint(cx: number, cy: number, r: number, g: number) {
  const theta = ((180 - g) * Math.PI) / 180;
  return { x: cx + r * Math.cos(theta), y: cy - r * Math.sin(theta) };
}

/**
 * Generic semicircular gauge: N equal-width colored zones (left to right) plus a
 * needle positioned by `value` linearly mapped from [min, max] onto the arc.
 */
export function SemiGauge({
  zones,
  value,
  min,
  max,
  showTopTick = false,
}: {
  zones: string[]; // colors, left to right, equal width
  value: number;
  min: number;
  max: number;
  showTopTick?: boolean;
}) {
  const cx = 110,
    cy = 100,
    r = 84;
  const gapDeg = 3;
  const bandWidth = 180 / zones.length;
  const clamped = Math.max(min, Math.min(max, value));
  const needleG = ((clamped - min) / (max - min)) * 180;
  const needleTip = gaugePoint(cx, cy, r - 18, needleG);
  const topTick = gaugePoint(cx, cy, r + 10, 90);

  return (
    <svg viewBox="0 0 220 120" className="w-full max-w-[240px] mx-auto">
      {zones.map((color, i) => {
        const g0 = i * bandWidth;
        const g1 = (i + 1) * bandWidth;
        const p0 = gaugePoint(cx, cy, r, g0 + gapDeg / 2);
        const p1 = gaugePoint(cx, cy, r, g1 - gapDeg / 2);
        return (
          <path
            key={i}
            d={`M ${p0.x} ${p0.y} A ${r} ${r} 0 0 1 ${p1.x} ${p1.y}`}
            stroke={color}
            strokeWidth={14}
            strokeLinecap="round"
            fill="none"
          />
        );
      })}
      {showTopTick && <line x1={cx} y1={cy - r + 4} x2={topTick.x} y2={topTick.y} stroke="#8b98b8" strokeWidth={2} />}
      <line x1={cx} y1={cy} x2={needleTip.x} y2={needleTip.y} stroke="#e5e7eb" strokeWidth={3} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={6} fill="#e5e7eb" />
    </svg>
  );
}
