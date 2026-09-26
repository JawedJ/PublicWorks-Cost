import type { ComponentType, LocalizedText, RefData } from "@/lib/schemas";
import { t, L } from "./text";

// StatCan BCPI escalation (SPEC 7.1), from the committed public data file.
// Kept out of RefData so the engine reads it through one import.
import { statcanBcpi } from "@/data";

const RESIDENTIAL = new Set([
  "house",
  "townhouse_block",
  "low_rise_apartment",
  "mid_rise_apartment",
]);

function series(geo: string, type: string) {
  return (
    statcanBcpi.series.find(
      (s) => s.geo === geo && s.type === type && s.division === "composite",
    ) ??
    statcanBcpi.series.find(
      (s) =>
        s.geo === "composite" && s.type === type && s.division === "composite",
    )
  );
}

/** Price year → latest quarter. Buildings use their own series; other types use non-residential as a labelled proxy. */
export function bcpiEscalation(
  _ref: RefData,
  cma: string,
  type: ComponentType,
  subtype: string,
  priceYear: number,
): { factor: number; label?: LocalizedText; isProxy: boolean } {
  const bcpiType =
    type === "building"
      ? RESIDENTIAL.has(subtype)
        ? "residential"
        : "institutional"
      : "non_residential";
  const s = series(cma, bcpiType);
  const yearPoints =
    s?.points.filter(([q]) => q.startsWith(String(priceYear))) ?? [];
  const latest = s?.points.at(-1);
  if (!s || !latest || yearPoints.length === 0)
    return { factor: 1, isProxy: false };
  const base = yearPoints.reduce((a, [, v]) => a + v, 0) / yearPoints.length;
  const factor = latest[1] / base;
  const geoName =
    statcanBcpi.geographies.find((g) => g.key === s.geo)?.name ??
    L(s.geo, s.geo);
  const pct = Math.round((factor - 1) * 1000) / 10;
  return {
    factor,
    isProxy: type !== "building",
    label: t(
      L("StatCan BCPI, ", "IPCB de StatCan, "),
      geoName,
      ", ",
      bcpiType.replace("_", "-"),
      ": ",
      pct >= 0 ? "+" : "",
      pct,
      L(
        `% since ${priceYear} (to ${latest[0]})`,
        ` % depuis ${priceYear} (jusqu'à ${latest[0]})`,
      ),
    ),
  };
}

/** Trailing 8-quarter annualized change of the non-residential series, or null. */
export function trailingAnnualRate(_ref: RefData, cma: string): number | null {
  const pts = series(cma, "non_residential")?.points;
  if (!pts || pts.length < 9) return null;
  const last = pts.at(-1)![1];
  const prev = pts.at(-9)![1];
  return Math.sqrt(last / prev) - 1;
}
