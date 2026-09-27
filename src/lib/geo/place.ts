import type { GeocodeResult } from "./geocode";

// Where a project is, from its description: the municipality ("Waterloo") and,
// when given, a site within it ("near Laurel Creek", "north end", "King and
// University"). Used by the keyword fallback, and to turn a site hint into a map
// view: a geocoded street or landmark, or a part of town by compass direction.

/** Ontario places the fallback recognises by name (the AI handles anything else). */
const PLACES = [
  "Waterloo",
  "Kitchener",
  "Cambridge",
  "Guelph",
  "Toronto",
  "Ottawa",
  "London",
  "Hamilton",
  "Mississauga",
  "Brampton",
  "Markham",
  "Vaughan",
  "Oakville",
  "Burlington",
  "Oshawa",
  "Barrie",
  "Kingston",
  "Windsor",
  "Sudbury",
  "Greater Sudbury",
  "Thunder Bay",
  "Sault Ste. Marie",
  "North Bay",
  "Timmins",
  "Kenora",
  "Peterborough",
  "St. Catharines",
  "Niagara Falls",
  "Brantford",
  "Woodstock",
  "Stratford",
  "Orangeville",
  "Belleville",
  "Cornwall",
  "Milton",
  "Whitby",
  "Ajax",
  "Pickering",
  "Richmond Hill",
  "Newmarket",
];

const DIRECTION =
  /\b(north|south|east|west|north-?east|north-?west|south-?east|south-?west|downtown|uptown|central)\b/i;

/** The municipality named in a description, if it's a known Ontario place. */
export function findMunicipality(text: string): string | undefined {
  // Longest names first, so "Greater Sudbury" wins over "Sudbury".
  for (const p of [...PLACES].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`\\b${p.replace(/[.]/g, "\\.")}\\b`, "i");
    if (re.test(text)) return p;
  }
  return undefined;
}

/**
 * Where within the municipality, as written: "near Laurel Creek", "on King
 * Street", "at King and University", or a part of town ("north Waterloo").
 */
export function findSite(
  text: string,
  municipality?: string,
): string | undefined {
  const parts: string[] = [];
  const dir = text.match(
    new RegExp(
      `${DIRECTION.source}(?:\\s+end|\\s+side)?(?=\\s+(?:of\\s+)?${municipality ?? "\\w"})`,
      "i",
    ),
  );
  if (dir) parts.push(dir[0].toLowerCase());
  const near = text.match(
    /\b(?:near|beside|next to|along|by|at the corner of|on|at)\s+((?:the\s+)?[A-Z][\w'.-]*(?:\s+(?:and|&)?\s*[A-Z][\w'.-]*)*)/,
  );
  if (near && near[1] && near[1].replace(/^the\s+/i, "") !== municipality)
    parts.push(`${near[0].split(/\s+/)[0]!.toLowerCase()} ${near[1]}`);
  return parts.length ? parts.join(" ") : undefined;
}

/** A site hint as a search: "north Waterloo near Laurel Creek" → "Laurel Creek". */
export function siteQuery(site: string, municipality = ""): string {
  const city = municipality.trim()
    ? new RegExp(`\\b${municipality.trim().replace(/[.]/g, "\\.")}\\b`, "gi")
    : null;
  return (city ? site.replace(city, " ") : site)
    .replace(DIRECTION, "")
    .replace(
      /\b(end|side|part|area|of|near|beside|next to|along|by|at the corner of|on|at|the)\b/gi,
      " ",
    )
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s+/g, " ")
    .trim();
}

type View = { lng: number; lat: number; zoom: number };

/** Map zoom that frames a result: street level for a point, its extent otherwise. */
export function zoomFor(hit: GeocodeResult, min: number, max: number): number {
  const span = hit.bbox ? Math.max(hit.bbox[2] - hit.bbox[0], 1e-4) : 0;
  if (!span) return max;
  return Math.min(max, Math.max(min, Math.log2(360 / span) - 0.5));
}

/**
 * The part of town a direction points to, inside the municipality's extent:
 * "north" → halfway from the centre to the north edge.
 */
export function directionView(city: GeocodeResult, site: string): View | null {
  const m = site.match(DIRECTION);
  if (!m || !city.bbox) return null;
  const d = m[1]!.toLowerCase().replace("-", "");
  const [w, s, e, n] = city.bbox;
  let [lng, lat] = city.center;
  if (d.includes("north")) lat += (n - lat) * 0.5;
  if (d.includes("south")) lat -= (lat - s) * 0.5;
  if (d.includes("east")) lng += (e - lng) * 0.5;
  if (d.includes("west")) lng -= (lng - w) * 0.5;
  return { lng, lat, zoom: 14 };
}

/** Distance in km between two lng/lat points (flat approximation, fine at city scale). */
export function kmBetween(a: [number, number], b: [number, number]): number {
  const kx = 111.32 * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 111.32);
}
