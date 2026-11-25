// Numeric helpers. Postgres numeric columns arrive as strings; arithmetic is done
// in JS numbers and rounded at each step to the column's scale before storing.

export function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function roundTo(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON * Math.sign(n)) * f) / f;
}

export const round2 = (n: number) => roundTo(n, 2);
export const round3 = (n: number) => roundTo(n, 3);
export const round4 = (n: number) => roundTo(n, 4);

/** Format for numeric(14,2) columns. */
export const money = (n: number) => round2(n).toFixed(2);
/** Format for numeric(14,3) columns. */
export const qtyStr = (n: number) => round3(n).toFixed(3);
/** Format for numeric(14,4) columns. */
export const costStr = (n: number) => round4(n).toFixed(4);

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function isWhole(n: number) {
  return Math.abs(n - Math.round(n)) < 1e-9;
}
