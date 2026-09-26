import { describe, expect, it } from "vitest";
import { resolveParams } from "../params";
import { roadTemplate, roadWidthM } from "../templates/road";
import { byId, checkCatalog, makeCtx, missingPrices } from "./helpers";

const derive = (
  subtype: string,
  lengthM: number,
  params: Parameters<typeof makeCtx>[3] = {},
) =>
  roadTemplate.deriveQuantities(
    makeCtx(roadTemplate, subtype, { lengthM }, params),
  );

describe("road template catalog", () => {
  it("is consistent", () => {
    expect(() => checkCatalog(roadTemplate)).not.toThrow();
  });

  it("references only known unit prices, for every subtype and option", () => {
    for (const { id } of roadTemplate.subtypes) {
      expect(missingPrices(derive(id, 500)), id).toEqual([]);
    }
    const heavy = derive("road_reconstruction", 500, {
      soilCondition: "poor",
      rockExpected: true,
      cycling: "cycle_track",
      utilityConflicts: true,
      watermainDiameterMm: 400,
      stormDiameterMm: 900,
      trafficStaging: "night_work",
    });
    expect(missingPrices(heavy)).toEqual([]);
  });
});

describe("road quantities (SPEC 6.1)", () => {
  it("computes width from lanes, parking, and painted bike lanes", () => {
    const p = resolveParams(roadTemplate, "road_reconstruction", {
      lanes: 2,
      parkingLanes: 1,
      cycling: "painted_lane",
    });
    expect(roadWidthM(p)).toBeCloseTo(2 * 3.5 + 2.4 + 3);
  });

  it("derives a 400 m local street reconstruction", () => {
    const q = byId(derive("road_reconstruction", 400));
    // Width 7 m → 2,800 m²
    expect(q.pavement_removal!.quantity).toBe(2800);
    expect(q.excavation!.quantity).toBe(1680); // × 0.6 m
    expect(q.granular_b!.quantity).toBe(840); // × 0.30 m
    expect(q.granular_a!.quantity).toBe(420); // × 0.15 m
    expect(q.asphalt_hl8!.quantity).toBe(336); // × 0.05 m × 2.4 t/m³
    expect(q.asphalt_hl3!.quantity).toBeCloseTo(268.8);
    expect(q.curb_gutter!.quantity).toBe(800);
    expect(q.sidewalk!.quantity).toBe(1440); // 400 × 1.8 × 2
    expect(q.watermain!.quantity).toBe(400);
    expect(q.watermain!.price).toEqual({
      kind: "unitPrice",
      id: "watermain_200_pvc",
    });
    expect(q.hydrants!.quantity).toBe(3); // ⌈400/150⌉
    expect(q.valves!.quantity).toBe(2); // ⌈400/250⌉
    expect(q.water_services!.quantity).toBe(32); // 4 × 8
    expect(q.catch_basins!.quantity).toBe(14); // ⌈400/60⌉ × 2
    expect(q.storm_mh!.quantity).toBe(4);
    expect(q.sanitary_mh!.quantity).toBe(4);
    expect(q.streetlights!.quantity).toBe(10);
    expect(q.boulevard!.quantity).toBe(2000); // 400 × 2.5 × 2
    expect(q.traffic_control!.quantity).toBe(4); // ⌈400/150 × 1.3⌉
    expect(q.trench_asphalt).toBeUndefined();
  });

  it("splits rock out of common excavation and adds poor-soil replacement", () => {
    const q = byId(
      derive("road_reconstruction", 400, {
        rockExpected: true,
        soilCondition: "poor",
      }),
    );
    expect(q.rock!.quantity).toBe(252); // 15% of 1,680
    expect(q.excavation!.quantity).toBe(1428);
    expect(q.unsuitable_soil!.quantity).toBe(504); // 30%
    expect(q.geotextile!.quantity).toBe(2800);
  });

  it("uses a thicker structure for arterials", () => {
    const local = byId(derive("road_reconstruction", 100));
    const arterial = byId(
      derive("road_reconstruction", 100, { roadClass: "arterial" }),
    );
    expect(arterial.granular_b!.quantity).toBeGreaterThan(
      local.granular_b!.quantity,
    );
    expect(arterial.asphalt_hl8!.quantity).toBeGreaterThan(
      local.asphalt_hl8!.quantity,
    );
  });

  it("resurfacing mills and paves with no pipes", () => {
    const q = byId(derive("road_resurfacing", 1000));
    expect(q.milling!.quantity).toBe(7000);
    expect(q.asphalt_hl3!.quantity).toBe(840); // 7,000 × 0.05 × 2.4
    expect(q.excavation).toBeUndefined();
    expect(q.watermain).toBeUndefined();
    expect(q.curb_gutter!.quantity).toBe(200); // 10% repair of 2,000 m
    expect(q.traffic_control!.quantity).toBe(2); // ⌈1000/800 × 1.3⌉
  });

  it("watermain replacement restores a trench strip instead of rebuilding the road", () => {
    const q = byId(
      derive("watermain_replacement", 300, {
        watermainDiameterMm: 300,
        watermainMaterial: "ductile_iron",
      }),
    );
    expect(q.watermain!.price).toEqual({
      kind: "unitPrice",
      id: "watermain_300_di",
    });
    expect(q.valves!.price).toEqual({ kind: "unitPrice", id: "valve_300" });
    expect(q.trench_pavement_removal!.quantity).toBe(750); // 300 × 2.5
    expect(q.storm_sewer).toBeUndefined();
    expect(q.excavation).toBeUndefined();
    expect(q.markings).toBeUndefined();
  });

  it("rounds pipe sizes up to the next standard size", () => {
    const q = byId(
      derive("road_reconstruction", 100, {
        watermainDiameterMm: 250,
        stormDiameterMm: 500,
      }),
    );
    expect(q.watermain!.price).toEqual({
      kind: "unitPrice",
      id: "watermain_300_pvc",
    });
    expect(q.storm_sewer!.price).toEqual({
      kind: "unitPrice",
      id: "storm_600",
    });
  });

  it("returns nothing without a drawn length", () => {
    expect(derive("road_reconstruction", 0)).toEqual([]);
  });

  it("falls back to defaults for invalid params and clamps numbers", () => {
    const p = resolveParams(roadTemplate, "road_reconstruction", {
      lanes: 99,
      roadClass: "motorway",
      curbs: "yes",
      notACatalogParam: 1,
    });
    expect(p.lanes).toBe(8);
    expect(p.roadClass).toBe("local");
    expect(p.curbs).toBe(true);
    expect(p).not.toHaveProperty("notACatalogParam");
  });

  it("explains quantities in both languages", () => {
    const q = byId(derive("road_reconstruction", 812.4, { laneWidthM: 3.25 }));
    expect(q.pavement_removal!.quantitySource).toEqual({
      en: "812 m × 6.5 m",
      fr: "812 m × 6,5 m",
    });
  });
});

describe("road flags", () => {
  const codes = (
    subtype: string,
    params: Parameters<typeof makeCtx>[3] = {},
    lengthM = 400,
  ) =>
    roadTemplate
      .flags(makeCtx(roadTemplate, subtype, { lengthM }, params))
      .map((f) => f.code);

  it("warns when soils are unknown and work involves digging", () => {
    expect(codes("road_reconstruction")).toContain("soil_unknown");
    expect(codes("road_resurfacing")).not.toContain("soil_unknown");
  });

  it("flags rock, poor soils, utility conflicts, and arterial closures", () => {
    const c = codes("road_reconstruction", {
      soilCondition: "poor",
      rockExpected: true,
      utilityConflicts: true,
      roadClass: "arterial",
      trafficStaging: "full_closure",
    });
    expect(c).toEqual(
      expect.arrayContaining([
        "poor_soils",
        "rock_expected",
        "utility_conflicts",
        "arterial_full_closure",
      ]),
    );
  });

  it("names the component on every flag", () => {
    const flags = roadTemplate.flags(
      makeCtx(roadTemplate, "road_reconstruction", { lengthM: 10 }),
    );
    expect(flags.length).toBeGreaterThan(0);
    for (const f of flags)
      expect(f.componentIds).toEqual(["c-road_reconstruction"]);
  });
});
