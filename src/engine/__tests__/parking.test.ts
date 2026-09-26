import { describe, expect, it } from "vitest";
import { refData } from "@/data";
import { northgateProject } from "@/lib/fixtures";
import { smartGeometry } from "@/lib/geo/generate";
import { measureProject } from "@/lib/geo/measure";
import { computeEstimate } from "..";
import { parkingTemplate } from "../templates/parking";
import {
  byId,
  checkCatalog,
  makeComponent,
  makeCtx,
  missingPrices,
} from "./helpers";

const lot = (areaM2: number, perimeterM: number, params = {}) => {
  const ctx = makeCtx(
    parkingTemplate,
    "surface_lot",
    { areaM2, perimeterM },
    params,
  );
  return { ctx, lines: byId(parkingTemplate.deriveQuantities(ctx)) };
};

describe("parking template", () => {
  it("has a sound catalog and every price resolves", () => {
    checkCatalog(parkingTemplate);
    const { ctx } = lot(3000, 230, { lighting: true, evChargers: 4 });
    expect(missingPrices(parkingTemplate.deriveQuantities(ctx))).toEqual([]);
  });

  it("prices an asphalt lot from its area and perimeter, extras off", () => {
    const { lines } = lot(1500, 160);
    expect(lines.surface!.quantity).toBe(1500);
    expect(lines.surface!.price).toEqual({
      kind: "unitPrice",
      id: "parking_lot_asphalt",
    });
    expect(lines.markings!.quantity).toBe(50 * 6); // 1500 / 30 stalls × 6 m
    expect(lines["catch-basins"]!.quantity).toBe(2);
    expect(lines.curbs!.quantity).toBe(160);
    expect(lines["light-poles"]).toBeUndefined();
    expect(lines["ev-chargers"]).toBeUndefined();
    expect(lines.ogs).toBeUndefined(); // under 2,000 m²
  });

  it("uses entered stalls, permeable pavers, lighting and chargers when set", () => {
    const { lines } = lot(3000, 230, {
      surface: "permeable",
      stalls: 80,
      lighting: true,
      evChargers: 4,
    });
    expect(lines.surface!.price).toEqual({
      kind: "unitPrice",
      id: "permeable_pavers",
    });
    expect(lines.markings!.quantity).toBe(80 * 6);
    expect(lines["catch-basins"]).toBeUndefined(); // permeable: no piped drainage
    expect(lines["light-poles"]!.quantity).toBe(5);
    expect(lines["ev-chargers"]!.quantity).toBe(4);
  });

  it("adds an oil-grit separator and a stormwater flag for big paved lots", () => {
    const { ctx, lines } = lot(6000, 320);
    expect(lines.ogs!.quantity).toBe(1);
    expect(parkingTemplate.flags(ctx).map((f) => f.code)).toEqual([
      "parking_stormwater",
    ]);
  });

  it("is priced as its own component in a project estimate", () => {
    const c = {
      ...makeComponent("parking", "surface_lot", { stalls: 60 }),
      id: "c-lot",
      name: "Library lot",
    };
    c.geometry = smartGeometry(c, [-80.527, 43.5]);
    const project = { ...structuredClone(northgateProject), components: [c] };
    const e = computeEstimate(project, measureProject(project), refData, {
      seed: 1,
      iterations: 300,
      now: new Date("2026-09-26"),
    });
    const lot = e.components.find((x) => x.componentId === "c-lot")!;
    expect(lot.directCost).toBeGreaterThan(150_000); // ~1,800 m² × $115 + extras
    expect(lot.directCost).toBeLessThan(600_000);
  });
});
