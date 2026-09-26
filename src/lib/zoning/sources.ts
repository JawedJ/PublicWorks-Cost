import type { ZoneResult } from "@/lib/schemas";

// SPEC 8.3 (MVP): cities with a public zoning map service (ArcGIS REST point
// query). Adding a city = one entry. Waterloo is served from a committed snapshot
// instead (./waterloo.ts, `pnpm data:zoning`). Kitchener publishes no zoning
// service, so it comes back "no_data" ("zoning not checked").

type Attrs = Record<string, unknown>;

export type ZoningSource = {
  city: string;
  bylaw: string;
  /** [west, south, east, north] in degrees: only points inside are queried. */
  bbox: [number, number, number, number];
  /** ArcGIS layer URL (…/MapServer/N or …/FeatureServer/N). */
  url: string;
  outFields: string[];
  read: (
    a: Attrs,
  ) => Omit<
    Extract<ZoneResult, { status: "ok" }>,
    "status" | "city" | "bylaw"
  > | null;
};

const str = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

export const ZONING_SOURCES: ZoningSource[] = [
  {
    city: "Ottawa",
    bylaw: "2008-250",
    bbox: [-76.36, 44.96, -75.24, 45.54],
    url: "https://maps.ottawa.ca/arcgis/rest/services/Zoning/MapServer/3",
    outFields: ["ZONE_CODE", "ZNAME_EN", "URL"],
    read: (a) => {
      const code = str(a.ZONE_CODE);
      if (!code) return null;
      const link = str(a.URL);
      return {
        code,
        name: str(a.ZNAME_EN),
        ...(link?.startsWith("https://") && { link }),
      };
    },
  },
  {
    city: "Cambridge",
    bylaw: "150-85",
    bbox: [-80.42, 43.29, -80.24, 43.45],
    url: "https://services5.arcgis.com/LTaPSxJTf948f8sm/arcgis/rest/services/HybridZoningBylaw/FeatureServer/0",
    outFields: ["ZONING_CODE", "ZONING_TYPE", "SITE_SPECIFIC1"],
    read: (a) => {
      const code = str(a.ZONING_CODE);
      if (!code) return null;
      const type = str(a.ZONING_TYPE);
      const special = str(a.SITE_SPECIFIC1);
      return {
        code,
        name: type && type[0] + type.slice(1).toLowerCase(),
        ...(special && {
          siteSpecific: `Site-specific provision ${special} applies`,
        }),
      };
    },
  },
];

export function sourceFor(lng: number, lat: number): ZoningSource | undefined {
  return ZONING_SOURCES.find(
    ({ bbox: [w, s, e, n] }) => lng >= w && lng <= e && lat >= s && lat <= n,
  );
}
