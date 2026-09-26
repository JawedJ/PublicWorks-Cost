// Seeded randomness for the Monte Carlo. The engine never uses Math.random.

/** mulberry32: small, fast, good enough for simulation. Returns floats in [0, 1). */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller. */
export function normal(rng: () => number): number {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Standard normal CDF (Abramowitz–Stegun). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x / Math.SQRT2));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Inverse CDF of a triangular distribution over (low, mode, high). */
export function triangular(
  u: number,
  low: number,
  mode: number,
  high: number,
): number {
  if (high <= low) return mode;
  const c = (mode - low) / (high - low);
  return u < c
    ? low + Math.sqrt(u * (high - low) * (mode - low))
    : high - Math.sqrt((1 - u) * (high - low) * (high - mode));
}

/** Value at percentile q (0–1) of an ascending-sorted array. */
export function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round(q * (sorted.length - 1))),
  );
  return sorted[i]!;
}
