import { describe, expect, it } from "vitest";
import type { Measurements, PlacedFeature } from "@/lib/schemas";
import { parkTemplate } from "../templates/park";
import { byId, checkCatalog, makeCtx, missingPrices } from "./helpers";

const point = {
  type: "Feature" as const,
  properties: {},
  geometry: { type: "Point" as const, coordinates: [0, 0] as [number, number] },
};
const line = {
  type: "Feature" as const,
  properties: {},
  geometry: {
    type: "LineString" as const,
    coordinates: [
      [0, 0],
      [1, 1],
    ] as [number, number][],
  },
};
const polygon = {
  type: "Feature" as const,
  properties: {},
  geometry: {
    type: "Polygon" as const,
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
    ] as [number, number][][],
  },
};

const feat = (
  id: string,
  kind: string,
  geometry: PlacedFeature["geometry"],
  params: PlacedFeature["params"] = {},
): PlacedFeature => ({ id, kind, geometry, params });

function derive(
  features: PlacedFeature[],
  measurements: Partial<Measurements>,
  params: Parameters<typeof makeCtx>[3] = {},
  subtype = "neighbourhood_park",
) {
  const ctx = makeCtx(parkTemplate, subtype, measurements, params);
  ctx.component.geometry = { primary: polygon, features };
  return parkTemplate.deriveQuantities(ctx);
}

const northgateLike = () =>
  derive(
    [
      feat("pg", "playground", point, {
        sizeTier: "medium",
        accessibility: "enhanced",
      }),
      feat("sp", "splash_pad", point, { sizeTier: "small" }),
      feat("tr", "trail", line, { widthM: 2.5, surface: "asphalt" }),
    ],
    { areaM2: 12_000, perimeterM: 460, features: { tr: { lengthM: 380 } } },
    { fenceFraction: 0.3, treeCount: 40 },
  );

describe("park template catalog", () => {
  it("is consistent and references only known unit prices", () => {
    expect(() => checkCatalog(parkTemplate)).not.toThrow();
    expect(missingPrices(northgateLike())).toEqual([]);
    for (const { id } of parkTemplate.subtypes) {
      expect(
        missingPrices(
          derive(
            [],
            { areaM2: 5000, perimeterM: 300 },
            { irrigation: true },
            id,
          ),
        ),
      ).toEqual([]);
    }
  });
});

describe("park quantities (SPEC 6.2)", () => {
  it("prices features by tier and works the rest of the park as lawn", () => {
    const q = byId(northgateLike());
    const pg = q["feature:pg"]!;
    expect(pg.quantity).toBe(1);
    expect(pg.elementRef).toEqual({ featureId: "pg" });
    if (pg.price.kind !== "direct") throw new Error("expected a direct price");
    expect(pg.price.price.typical).toBeCloseTo(285_000 * 1.15);
    expect(pg.price.description.en).toBe(
      "Playground (Medium), enhanced accessibility (+15%)",
    );
    expect(pg.price.description.fr).toContain("Aire de jeux (Moyenne)");

    expect(q["feature:tr"]!.quantity).toBe(950); // 380 m × 2.5 m
    expect(q.grading!.quantity).toBe(12_000);
    expect(q.sod!.quantity).toBe(11_050); // 12,000 − 950 trail
    expect(q.topsoil!.quantity).toBe(11_050);
    expect(q.fencing!.quantity).toBe(138); // 460 × 30%
    expect(q.trees!.quantity).toBe(40);
    expect(q.furniture!.quantity).toBe(1.2); // ha
    expect(q.irrigation).toBeUndefined();
  });

  it("adds trail and field lighting when asked", () => {
    const q = byId(
      derive(
        [
          feat("tr", "trail", line, { lighting: true }),
          feat("sf", "sports_field", polygon, {
            surface: "artificial_turf",
            lighting: true,
          }),
        ],
        {
          areaM2: 20_000,
          perimeterM: 600,
          features: { tr: { lengthM: 200 }, sf: { areaM2: 7140 } },
        },
      ),
    );
    expect(q["feature:tr:lighting"]!.quantity).toBe(7); // ⌈200/30⌉
    expect(q["feature:sf"]!.quantity).toBe(7140);
    expect(q["feature:sf:lighting"]!.quantity).toBe(7140);
    expect(q.sod!.quantity).toBe(20_000 - 500 - 7140);
  });

  it("gives plazas mostly hard surface", () => {
    const q = byId(derive([], { areaM2: 2000, perimeterM: 180 }, {}, "plaza"));
    expect(q.hardscape!.quantity).toBe(1600);
    expect(q.sod!.quantity).toBe(400);
    expect(q.irrigation!.quantity).toBe(400);
  });

  it("prices matched kinds like a skate park by drawn area; unpriced custom features are auto-matched", () => {
    const q = byId(
      derive(
        [
          feat("sk", "skate_park", polygon),
          { ...feat("cu", "custom", polygon), customLabel: "Amphitheatre" },
        ],
        {
          areaM2: 5000,
          perimeterM: 300,
          features: { sk: { areaM2: 800 }, cu: { areaM2: 400 } },
        },
      ),
    );
    expect(q["feature:sk"]!.quantity).toBe(800);
    expect(q["feature:cu"]!.quantity).toBe(400);
  });

  it("uses seed instead of sod when asked", () => {
    const q = byId(
      derive([], { areaM2: 1000, perimeterM: 130 }, { seedInsteadOfSod: true }),
    );
    expect(q.seed!.quantity).toBe(1000);
    expect(q.sod).toBeUndefined();
  });

  it("returns nothing without a drawn area", () => {
    expect(derive([], {})).toEqual([]);
  });
});

describe("park flags", () => {
  const codes = (features: PlacedFeature[], m: Partial<Measurements>) => {
    const ctx = makeCtx(parkTemplate, "neighbourhood_park", m);
    ctx.component.geometry = { primary: polygon, features };
    return parkTemplate.flags(ctx).map((f) => f.code);
  };

  it("flags tiny parks, oversized features, and unpriced feature kinds", () => {
    expect(codes([], { areaM2: 300 })).toContain("park_very_small");
    expect(
      codes([feat("sf", "sports_field", polygon)], {
        areaM2: 1000,
        features: { sf: { areaM2: 1500 } },
      }),
    ).toContain("park_features_exceed_area");
    expect(codes([feat("x", "bandshell", point)], { areaM2: 5000 })).toContain(
      "park_feature_not_priced",
    );
    expect(codes([], { areaM2: 5000 })).toEqual([]);
  });
});
