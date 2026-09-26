import { constructionDurations } from "@/data";
import type { ComponentType, DurationFit } from "@/lib/schemas";

// Construction time from cost, fitted on real federal construction contracts
// (CanadaBuys start/end dates vs value; scripts/fetch-durations.ts):
// months = k × value^b, the classic time–cost form. Buildings and civil work
// have their own fit. Used for escalation to the midpoint and winter work.

const FIT_FOR: Record<ComponentType, keyof typeof constructionDurations.fits> =
  {
    building: "building",
    road: "civil",
    park: "civil",
    parking: "civil",
    structure: "civil",
    custom: "all",
  };

/** At least a month; the data has nothing under half a month. */
const MIN_MONTHS = 1;

export function durationFit(type: ComponentType): DurationFit {
  return constructionDurations.fits[FIT_FOR[type]];
}

/** Typical construction months for a component of this type and contract value (CAD). */
export function typicalMonths(type: ComponentType, valueCad: number): number {
  if (valueCad <= 0) return MIN_MONTHS;
  const f = durationFit(type);
  return Math.max(MIN_MONTHS, f.k * valueCad ** f.b);
}

export const durationSourceNote = () => {
  const s = constructionDurations.source;
  const n = constructionDurations.fits.all.n;
  return `Typical time for its cost, fitted on ${n} federal construction contracts (CanadaBuys start and end dates, ${s.files.length} fiscal years)`;
};
