import { waterlooZoneRules } from "@/data";
import type { Component, Position, ZoneRules } from "@/lib/schemas";
import { L } from "./text";
import type { TemplateFlag } from "./types";

// SPEC 8.3: zone limits from the by-law text (src/data/zoning/waterloo-rules.json)
// checked against each building: permitted use, height and storeys, setbacks to
// the drawn lot, lot coverage and landscaped open space. Advisory flags only;
// never changes the estimate.

/** Storey height when a section doesn't set one (same as the 3D view). */
const FLOOR_HEIGHT_M = 4;

/** By-law use terms that cover each building subtype (matched at the start of a listed use). */
const USE_TERMS: Record<string, string[]> = {
  library: ["CULTURAL FACILIT", "GOVERNMENT USE", "INSTITUTION"],
  museum_gallery: ["CULTURAL FACILIT", "INSTITUTION"],
  performing_arts: ["CULTURAL FACILIT", "AUDITORIUM"],
  community_centre: [
    "GOVERNMENT USE",
    "INSTITUTION",
    "MUNICIPAL RECREATION",
    "COMMUNITY CENTRE",
  ],
  ice_arena: [
    "MUNICIPAL RECREATION",
    "GOVERNMENT USE",
    "COMMERCIAL RECREATION",
  ],
  aquatic_centre: [
    "MUNICIPAL RECREATION",
    "GOVERNMENT USE",
    "COMMERCIAL RECREATION",
  ],
  fire_station: ["GOVERNMENT USE", "INSTITUTION"],
  police_station: ["GOVERNMENT USE", "INSTITUTION"],
  municipal_office: ["GOVERNMENT USE", "INSTITUTION"],
  maintenance_facility: ["GOVERNMENT USE", "‘LIGHT’ INDUSTRIAL", "WAREHOUSE"],
  school: ["PUBLIC SCHOOL", "PRIVATE SCHOOL"],
  secondary_school: ["PUBLIC SCHOOL", "PRIVATE SCHOOL"],
  hospital: ["INSTITUTION", "HOSPITAL"],
  medical_clinic: ["MEDICAL CLINIC"],
  house: ["DETACHED", "SINGLE DETACHED"],
  townhouse_block: ["TOWNHOUSE", "STACKED TOWNHOUSE", "FREEHOLD TOWNHOUSE"],
  low_rise_apartment: ["MULTI-UNIT RESIDENTIAL", "APARTMENT"],
  mid_rise_apartment: ["MULTI-UNIT RESIDENTIAL", "APARTMENT"],
};

const RULES: Record<
  string,
  { bylaw: string; zones: Record<string, ZoneRules> }
> = {
  "2018-050": {
    bylaw: waterlooZoneRules.meta.bylaw,
    zones: waterlooZoneRules.zones,
  },
};

/** "(H)C7-60" → { base: "C7", suffix: 60 }; "50-R5" → { base: "R5" }. */
export function parseZoneCode(
  code: string,
  zones: Record<string, ZoneRules>,
): { base: string; suffix?: number } | null {
  const tokens = code.replace(/\(H\)/gi, "").trim().split("-").filter(Boolean);
  // Two-token bases first (e.g. "RN-6"), then single tokens.
  for (let i = 0; i < tokens.length; i++) {
    const two = tokens.slice(i, i + 2).join("-");
    if (zones[two]) return { base: two };
    if (zones[tokens[i]!]) {
      const last = tokens.at(-1)!;
      const n = Number(last);
      return {
        base: tokens[i]!,
        ...(i < tokens.length - 1 && Number.isFinite(n) && { suffix: n }),
      };
    }
  }
  return null;
}

/** The use terms of the zone that permit this subtype, or [] if none do. */
export function permittedAs(subtype: string, rules: ZoneRules): string[] {
  const terms = USE_TERMS[subtype] ?? [];
  const uses = rules.uses.map((u) => u.toUpperCase());
  return rules.uses.filter((_, i) =>
    terms.some((term) => uses[i]!.startsWith(term)),
  );
}

// --- Plane geometry in metres (equirectangular; fine at lot scale) ---

type XY = [number, number];

function projector(lat: number) {
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  return (p: Position): XY => [p[0] * kx, p[1] * 111_320];
}

function ringArea(r: XY[]): number {
  let a = 0;
  for (let i = 0; i < r.length - 1; i++)
    a += r[i]![0] * r[i + 1]![1] - r[i + 1]![0] * r[i]![1];
  return Math.abs(a) / 2;
}

function segDist(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const k = len
    ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len))
    : 0;
  return Math.hypot(p[0] - (a[0] + k * dx), p[1] - (a[1] + k * dy));
}

function inside(p: XY, r: XY[]): boolean {
  let hit = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i]!;
    const [xj, yj] = r[j]!;
    if (
      yi > p[1] !== yj > p[1] &&
      p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi
    )
      hit = !hit;
  }
  return hit;
}

type Design = {
  heightM: number;
  storeys: number;
  footprintM2: number;
  /** Drawn lot (the building's site polygon), when it's bigger than the footprint. */
  lotM2?: number;
  /** Closest wall to a lot line; negative when a wall is outside the lot. */
  closestM?: number;
};

export function designOf(c: Component): Design | null {
  const g = c.geometry;
  const sections = g?.sections ?? [];
  if (!g || !sections.length) return null;
  const site = g.primary.geometry;
  const lat =
    site.type === "Polygon"
      ? site.coordinates[0]![0]![1]
      : sections[0]!.footprint.geometry.coordinates[0]![0]![1];
  const xy = projector(lat);
  const rings = sections.map((s) =>
    s.footprint.geometry.coordinates[0]!.map(xy),
  );
  const footprintM2 = rings.reduce((a, r) => a + ringArea(r), 0);
  const heightM = Math.max(
    ...sections.map((s) => s.storeys * (s.floorHeightM ?? FLOOR_HEIGHT_M)),
  );
  const storeys = Math.max(...sections.map((s) => s.storeys));
  const d: Design = { heightM, storeys, footprintM2 };
  if (site.type === "Polygon") {
    const lot = site.coordinates[0]!.map(xy);
    const lotM2 = ringArea(lot);
    if (lotM2 > footprintM2 * 1.05) {
      d.lotM2 = lotM2;
      let closest = Infinity;
      for (const r of rings)
        for (const p of r) {
          let dist = Infinity;
          for (let i = 0; i < lot.length - 1; i++)
            dist = Math.min(dist, segDist(p, lot[i]!, lot[i + 1]!));
          closest = Math.min(closest, inside(p, lot) ? dist : -dist);
        }
      d.closestM = closest;
    }
  }
  return d;
}

const m1 = (n: number) => Math.round(n * 10) / 10;

/** Limit flags for one building in a zone with transcribed regulations. */
export function zoneLimitFlags(
  c: Component,
  zone: { code: string; bylaw: string; city: string },
): { flags: TemplateFlag[]; summary?: string } {
  const book = RULES[zone.bylaw];
  if (!book) return { flags: [] };
  const parsed = parseZoneCode(zone.code, book.zones);
  if (!parsed) return { flags: [] };
  const rules = book.zones[parsed.base]!;
  const cite = `${zone.city} By-law ${zone.bylaw}, s. ${rules.section} (p. ${rules.page})`;
  const flags: TemplateFlag[] = [];
  const notes: string[] = [];
  const advisory =
    " Advisory: may need a minor variance or rezoning; verify with the municipality.";

  // Use
  const allowed = permittedAs(c.subtype, rules);
  if (rules.uses.length && USE_TERMS[c.subtype]) {
    if (allowed.length)
      notes.push(
        `Permitted as ${allowed.slice(0, 2).join(" / ").toLowerCase()}.`,
      );
    else
      flags.push({
        code: "zoning_use",
        severity: "warning",
        title: L(
          "Use not listed in this zone",
          "Usage non prévu dans cette zone",
        ),
        explanation: L(
          `${rules.name} (${zone.code}) doesn't list a use that covers this building (${cite}).${advisory}`,
          `${rules.name} (${zone.code}) ne prévoit pas cet usage (${cite}).`,
        ),
        componentIds: [c.id],
      });
  }

  const d = designOf(c);
  // Height
  const limitM =
    rules.heightFromSuffix && parsed.suffix !== undefined
      ? parsed.suffix
      : rules.maxHeight?.metres;
  const limitStoreys =
    rules.heightFromSuffix && parsed.suffix !== undefined
      ? rules.storeysForSuffix?.[String(parsed.suffix)]
      : rules.maxHeight?.storeys;
  if (d && limitM !== undefined) {
    const over =
      d.heightM > limitM + 0.01 ||
      (limitStoreys !== undefined && d.storeys > limitStoreys);
    const limit = `${limitM} m${limitStoreys ? ` / ${limitStoreys} storeys` : ""}`;
    notes.push(
      `Height limit ${limit}; design ${m1(d.heightM)} m / ${d.storeys} storeys.`,
    );
    if (over)
      flags.push({
        code: "zoning_height",
        severity: "warning",
        title: L(
          "Taller than the zone allows",
          "Plus haut que la zone le permet",
        ),
        explanation: L(
          `${c.name} is ${m1(d.heightM)} m and ${d.storeys} storeys; zone ${zone.code} allows ${limit} (${cite}).${advisory}`,
          `${c.name} fait ${m1(d.heightM)} m et ${d.storeys} étages; la zone ${zone.code} permet ${limit} (${cite}).`,
        ),
        componentIds: [c.id],
      });
  }

  // Setbacks, coverage and landscaped open space need a drawn lot.
  const sb = rules.setbacksM;
  const required = [sb.street, sb.side, sb.rear].filter(
    (v): v is number => v !== undefined,
  );
  if (d?.lotM2 !== undefined && d.closestM !== undefined && required.length) {
    const min = Math.min(...required);
    const parts = [
      sb.street !== undefined && `street ${sb.street} m`,
      sb.side !== undefined && `side ${sb.side} m`,
      sb.rear !== undefined && `rear ${sb.rear} m`,
    ].filter(Boolean);
    notes.push(
      `Setbacks ${parts.join(", ")}; closest wall ${m1(d.closestM)} m from the lot line.`,
    );
    if (d.closestM < min)
      flags.push({
        code: "zoning_setback",
        severity: "warning",
        title: L("Too close to the lot line", "Trop près de la limite du lot"),
        explanation: L(
          `${c.name}'s closest wall is ${m1(Math.max(d.closestM, 0))} m from the drawn lot line${d.closestM < 0 ? " (part of it is outside the lot)" : ""}; zone ${zone.code} requires at least ${parts.join(", ")} (${cite}).${advisory}`,
          `Le mur le plus proche de ${c.name} est à ${m1(Math.max(d.closestM, 0))} m de la limite du lot; la zone ${zone.code} exige ${parts.join(", ")} (${cite}).`,
        ),
        componentIds: [c.id],
      });
  }
  if (d?.lotM2 !== undefined) {
    const coverage = (d.footprintM2 / d.lotM2) * 100;
    if (rules.maxCoveragePct !== undefined) {
      notes.push(
        `Coverage limit ${rules.maxCoveragePct}%; design ${Math.round(coverage)}%.`,
      );
      if (coverage > rules.maxCoveragePct)
        flags.push({
          code: "zoning_coverage",
          severity: "warning",
          title: L("Covers too much of the lot", "Emprise au sol trop grande"),
          explanation: L(
            `${c.name} covers ${Math.round(coverage)}% of its lot; zone ${zone.code} allows ${rules.maxCoveragePct}% (${cite}).${advisory}`,
            `${c.name} couvre ${Math.round(coverage)} % du lot; la zone ${zone.code} permet ${rules.maxCoveragePct} % (${cite}).`,
          ),
          componentIds: [c.id],
        });
    }
    if (rules.minLandscapedPct !== undefined) {
      // At most: parking and paving on the lot aren't drawn separately here.
      const open = 100 - coverage;
      notes.push(`Landscaped open space at least ${rules.minLandscapedPct}%.`);
      if (open < rules.minLandscapedPct)
        flags.push({
          code: "zoning_landscape",
          severity: "warning",
          title: L(
            "Not enough landscaped open space",
            "Espace paysager insuffisant",
          ),
          explanation: L(
            `At most ${Math.round(open)}% of ${c.name}'s lot is left open; zone ${zone.code} needs ${rules.minLandscapedPct}% landscaped open space (${cite}).${advisory}`,
            `Au plus ${Math.round(open)} % du lot de ${c.name} reste libre; la zone ${zone.code} exige ${rules.minLandscapedPct} % d'espace paysager (${cite}).`,
          ),
          componentIds: [c.id],
        });
    }
  }
  if (!d?.lotM2)
    notes.push("Draw the building's lot to check setbacks and coverage.");

  return {
    flags,
    summary: `${rules.name}, ${cite}. ${notes.join(" ")}`,
  };
}
