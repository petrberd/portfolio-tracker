export const czk = (n: number, digits = 0) =>
  new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n ?? 0);

export const pct = (n: number, digits = 1) =>
  `${n >= 0 ? "+" : ""}${(n ?? 0).toFixed(digits)} %`;

export const num = (n: number, digits = 2) =>
  new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: digits }).format(n ?? 0);

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "short", year: "numeric" });

export const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-");
  return `${m}/${y.slice(2)}`;
};
