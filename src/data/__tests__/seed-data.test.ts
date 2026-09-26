import { describe, expect, it } from "vitest";
import { unitPrices } from "@/data";

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
