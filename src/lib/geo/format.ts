import type { UnitSystem } from "@/lib/store/designSlice";

// Formats measurements for display: metric first (m, km, m², ha), or imperial
// (ft, mi, ft², acres). `locale` is an Intl locale such as "en-CA" or "fr-CA".

const FT_PER_M = 3.28084;
const FT2_PER_M2 = 10.7639;
const M2_PER_ACRE = 4046.86;

function num(locale: string, n: number, digits = 0) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(n);
}

export function formatLength(
  m: number,
  units: UnitSystem,
  locale: string,
): string {
  if (units === "imperial") {
    const ft = m * FT_PER_M;
    return ft >= 5280
      ? `${num(locale, ft / 5280, 2)} mi`
      : `${num(locale, ft)} ft`;
  }
  return m >= 1000 ? `${num(locale, m / 1000, 2)} km` : `${num(locale, m)} m`;
}

export function formatArea(
  m2: number,
  units: UnitSystem,
  locale: string,
): string {
  if (units === "imperial") {
    return m2 >= M2_PER_ACRE
      ? `${num(locale, m2 / M2_PER_ACRE, 2)} acres`
      : `${num(locale, m2 * FT2_PER_M2)} ft²`;
  }
  return m2 >= 10_000
    ? `${num(locale, m2 / 10_000, 2)} ha`
    : `${num(locale, m2)} m²`;
}
