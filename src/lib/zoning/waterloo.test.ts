import { describe, expect, it } from "vitest";
import { componentCentre } from "@/lib/geo/edit";
import { northgateProject as p } from "@/lib/fixtures";
import { lookupZones } from "./lookup";
import { waterlooZoneAt, waterlooZonesIn } from "./waterloo";

describe("Waterloo zoning snapshot", () => {
  it("finds the zone at a point (uptown holding zone)", () => {
    const z = waterlooZoneAt(-80.5225, 43.4643);
    expect(z).toMatchObject({
      status: "ok",
      city: "Waterloo",
      bylaw: "2018-050",
    });
    expect(z.status === "ok" && z.code).toBe("(H)U1-16");
    expect(z.status === "ok" && z.siteSpecific).toMatch(/Holding/);
  });

  it("zones the Northgate buildings offline", async () => {
    const pts = p.components
      .filter((c) => c.type === "building")
      .map((c) => {
        const [lng, lat] = componentCentre(c)!;
        return { id: c.id, lng: lng!, lat: lat! };
      });
    const { zones } = await lookupZones({ points: pts });
    for (const pt of pts) expect(zones[pt.id]?.status).toBe("ok");
  });

  it("returns no zone outside the city, and polygons in a box", () => {
    expect(waterlooZoneAt(-80.49, 43.43)).toEqual({ status: "no_data" }); // Kitchener
    const inBox = waterlooZonesIn([-80.53, 43.46, -80.515, 43.47]);
    expect(inBox.length).toBeGreaterThan(5);
    expect(inBox[0]!.properties.code).toBeTruthy();
  });
});
