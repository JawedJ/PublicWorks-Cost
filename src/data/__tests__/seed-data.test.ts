import { describe, expect, it } from "vitest";
import {
  buildingCosts,
  overrunReference,
  parkFeatures,
  refData,
  regionalFactors,
  structures,
  unitPrices,
} from "@/data";
import { EstimateClassSchema } from "@/lib/schemas";
import { DEFAULT_REGION } from "@/lib/store/projectSlice";

describe("unit-prices.json", () => {
  it("is sample data with a price year", () => {
    expect(unitPrices.meta.sample).toBe(true);
    expect(unitPrices.meta.priceYear).toBe(2025);
  });

  it("has 80–120 items with unique ids", () => {
    const ids = unitPrices.items.map((i) => i.id);
    expect(ids.length).toBeGreaterThanOrEqual(80);
    expect(ids.length).toBeLessThanOrEqual(120);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has English and French descriptions and positive typical prices", () => {
    for (const item of unitPrices.items) {
      expect(item.description.en, item.id).not.toBe("");
      expect(item.description.fr, item.id).not.toBe("");
      expect(item.price.typical, item.id).toBeGreaterThan(0);
    }
  });

  it("covers the items the road and park derivations need (SPEC 6.1, 6.2)", () => {
    const ids = new Set(unitPrices.items.map((i) => i.id));
    for (const id of [
      "excavation_common",
      "granular_a",
      "granular_b",
      "asphalt_hl3",
      "asphalt_hl8",
      "curb_gutter",
      "sidewalk_concrete",
      "watermain_200_pvc",
      "hydrant",
      "valve_200",
      "water_service",
      "storm_450",
      "catch_basin",
      "maintenance_hole_1200",
      "sanitary_250",
      "streetlight_pole",
      "boulevard_restoration",
      "traffic_control_staged",
      "grading_rough_fine",
      "topsoil_150",
      "sod",
      "trail_asphalt",
      "chain_link_fence",
      "site_furniture_allowance",
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
  });
});

describe("building-costs.json", () => {
  it("has every building subtype in SPEC 6.3", () => {
    expect(Object.keys(buildingCosts.subtypes).sort()).toEqual(
      [
        "community_centre",
        "library",
        "fire_station",
        "police_station",
        "municipal_office",
        "school",
        "hospital",
        "house",
        "townhouse_block",
        "low_rise_apartment",
        "mid_rise_apartment",
      ].sort(),
    );
  });

  it("gives school and hospital a wider uncertainty band", () => {
    expect(
      buildingCosts.subtypes.school!.uncertaintyMultiplier,
    ).toBeGreaterThan(1);
    expect(
      buildingCosts.subtypes.hospital!.uncertaintyMultiplier,
    ).toBeGreaterThan(1);
    expect(buildingCosts.subtypes.library!.uncertaintyMultiplier).toBe(1);
  });

  it("orders quality and sustainability factors sensibly", () => {
    const q = buildingCosts.qualityFactors;
    expect(q.basic).toBeLessThan(q.standard);
    expect(q.standard).toBeLessThan(q.high);
    const p = buildingCosts.sustainabilityPremiums;
    expect(p.code_minimum).toBe(1);
    expect(p.high_performance).toBeLessThan(p.net_zero_ready);
  });
});

describe("park-features.json", () => {
  it("prices every known feature kind in SPEC 6.2", () => {
    for (const kind of [
      "playground",
      "splash_pad",
      "sports_field",
      "trail",
      "parking",
      "washroom",
      "shade_structure",
      "seating_area",
      "tree_planting",
      "plaza",
    ]) {
      expect(parkFeatures.features[kind], kind).toBeDefined();
    }
  });

  it("has size tiers for playgrounds and splash pads", () => {
    for (const kind of ["playground", "splash_pad"]) {
      expect(Object.keys(parkFeatures.features[kind]!.tiers).sort()).toEqual([
        "large",
        "medium",
        "small",
      ]);
    }
  });
});

describe("structures.json", () => {
  it("covers every structure subtype with unique ids", () => {
    const subtypes = new Set(structures.items.map((i) => i.subtype));
    expect([...subtypes].sort()).toEqual([
      "culvert_replacement",
      "pumping_station",
      "small_bridge",
    ]);
    const ids = structures.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("all seed files", () => {
  it("are marked as 2025 sample data", () => {
    for (const file of Object.values(refData)) {
      expect(file.meta).toMatchObject({ sample: true, priceYear: 2025 });
    }
  });
});

describe("regional-factors.json", () => {
  const keys = regionalFactors.regions.map((r) => r.key);

  it("has unique keys including the store default and the demo regions", () => {
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of [
      DEFAULT_REGION,
      "waterloo_region",
      "toronto",
      "ottawa",
    ]) {
      expect(keys, key).toContain(key);
    }
  });

  it("has the Ontario average at 1.00 and higher factors for remote communities", () => {
    const byKey = new Map(regionalFactors.regions.map((r) => [r.key, r]));
    expect(byKey.get("ontario_average")!.factor).toBe(1);
    const remote = regionalFactors.regions.filter((r) => r.remote);
    expect(remote.length).toBeGreaterThan(0);
    for (const r of remote) expect(r.factor).toBeGreaterThan(1.5);
  });
});

describe("overrun-reference.json", () => {
  const normalCdf = (x: number) => {
    // Abramowitz-Stegun erf approximation; accurate to ~1e-7.
    const t = 1 / (1 + 0.3275911 * Math.abs(x / Math.SQRT2));
    const y =
      1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
        t +
        0.254829592) *
        t *
        Math.exp(-(x * x) / 2);
    return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  };

  it("has a generic entry for every component type and class", () => {
    for (const type of ["road", "park", "building", "structure", "custom"]) {
      for (const cls of EstimateClassSchema.options) {
        const hit = overrunReference.entries.find(
          (e) =>
            e.componentType === type && !e.subtype && e.estimateClass === cls,
        );
        expect(hit, `${type} ${cls}`).toBeDefined();
      }
    }
  });

  it("has mu consistent with the probability of overrun", () => {
    for (const e of overrunReference.entries) {
      expect(normalCdf(e.mu / e.sigma)).toBeCloseTo(e.probabilityOfOverrun, 3);
    }
  });

  it("gives Class D more overrun risk than Class A", () => {
    const pick = (cls: string) =>
      overrunReference.entries.find(
        (e) =>
          e.componentType === "building" &&
          !e.subtype &&
          e.estimateClass === cls,
      )!;
    expect(pick("D").probabilityOfOverrun).toBeGreaterThan(
      pick("A").probabilityOfOverrun,
    );
    expect(pick("D").sigma).toBeGreaterThan(pick("A").sigma);
  });
});
