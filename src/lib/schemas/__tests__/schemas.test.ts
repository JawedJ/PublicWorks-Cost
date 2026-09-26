import type * as GeoJSON from "geojson";
import { describe, expect, it } from "vitest";
import {
  ComponentSchema,
  CURRENT_SCHEMA_VERSION,
  LineItemSchema,
  PolygonFeatureSchema,
  ProjectSchema,
  type Component,
  type PolygonFeature,
  type Project,
} from "..";

const square = (lng: number, lat: number, d = 0.001): PolygonFeature => ({
  type: "Feature",
  properties: null,
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [lng, lat],
        [lng + d, lat],
        [lng + d, lat + d],
        [lng, lat + d],
        [lng, lat],
      ],
    ],
  },
});

const library: Component = {
  id: "c-library",
  name: "Branch library",
  type: "building",
  subtype: "library",
  status: "drawn",
  origin: "user",
  geometry: {
    primary: square(-80.49, 43.47, 0.002),
    sections: [
      { id: "s1", footprint: square(-80.49, 43.47), storeys: 1, roof: "flat" },
      {
        id: "s2",
        footprint: square(-80.4889, 43.47),
        storeys: 3,
        roof: "green",
      },
    ],
    features: [],
  },
  params: { quality: "standard" },
  paramMeta: { quality: { source: "user" } },
  overrides: { quantities: {}, unitPrices: {} },
  visible: true,
};

const baseProject = (): Project => ({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  name: "Test hub",
  description: "A library and a street",
  municipality: "Waterloo",
  region: "waterloo_region",
  location: { lng: -80.49, lat: 43.47, zoom: 15 },
  components: [
    library,
    {
      id: "c-street",
      name: "New street",
      type: "road",
      subtype: "road_reconstruction",
      status: "planned",
      origin: "user",
      params: {},
      paramMeta: {},
      overrides: { quantities: {}, unitPrices: {} },
      visible: true,
    },
  ],
  settings: {
    startDate: "2027-04-01",
    durationMonths: 12,
    escalationRate: 0.04,
    taxRate: 0.0176,
    contingencyMode: "recommended",
    locale: "en",
  },
  scenarios: [
    {
      id: "baseline",
      name: "Baseline",
      componentOverrides: {},
      addedComponents: [],
      removedComponentIds: [],
      shocks: {
        asphalt: 0,
        concrete: 0,
        steel: 0,
        pipe: 0,
        lumber: 0,
        labour: 0,
      },
    },
  ],
  activeScenarioId: "baseline",
  documents: [],
  createdAt: "2026-09-26T12:00:00Z",
  updatedAt: "2026-09-26T12:00:00Z",
});

describe("ProjectSchema", () => {
  it("accepts a valid multi-component project", () => {
    expect(ProjectSchema.parse(baseProject())).toEqual(baseProject());
  });

  it("rejects an unknown active scenario", () => {
    const p = { ...baseProject(), activeScenarioId: "nope" };
    expect(ProjectSchema.safeParse(p).success).toBe(false);
  });

  it("rejects duplicate component ids, including scenario-only components", () => {
    const p = baseProject();
    p.scenarios[0]!.addedComponents.push(library);
    expect(ProjectSchema.safeParse(p).success).toBe(false);
  });

  it("requires a manual contingency percentage in manual mode", () => {
    const p = baseProject();
    p.settings.contingencyMode = "manual";
    expect(ProjectSchema.safeParse(p).success).toBe(false);
    p.settings.manualContingencyPct = 15;
    expect(ProjectSchema.safeParse(p).success).toBe(true);
  });
});

describe("ComponentSchema", () => {
  it("requires geometry once drawn", () => {
    expect(
      ComponentSchema.safeParse({ ...library, geometry: undefined }).success,
    ).toBe(false);
  });

  it("requires sections on a drawn building", () => {
    const geometry = { ...library.geometry!, sections: [] };
    expect(ComponentSchema.safeParse({ ...library, geometry }).success).toBe(
      false,
    );
  });

  it("accepts a custom component with an own-rate price", () => {
    const skate: Component = {
      ...library,
      id: "c-skate",
      name: "Skate park",
      type: "custom",
      subtype: "custom",
      geometry: { primary: square(-80.5, 43.5), features: [] },
      customPricing: { mode: "own_rate", unit: "m2", rate: 450 },
    };
    expect(ComponentSchema.safeParse(skate).success).toBe(true);
  });

  it("requires a name on custom park features", () => {
    const park = {
      ...library,
      type: "park",
      subtype: "neighbourhood_park",
      geometry: {
        primary: square(-80.5, 43.5),
        features: [
          {
            id: "f1",
            kind: "custom",
            geometry: square(-80.5, 43.5, 0.0001),
            params: {},
          },
        ],
      },
    };
    expect(ComponentSchema.safeParse(park).success).toBe(false);
  });
});

describe("GeoJSON", () => {
  it("rejects unclosed polygon rings", () => {
    const f = square(0, 0);
    f.geometry.coordinates[0]!.pop();
    expect(PolygonFeatureSchema.safeParse(f).success).toBe(false);
  });

  it("produces types usable as @types/geojson features", () => {
    const f: GeoJSON.Feature<GeoJSON.Polygon> = square(0, 0);
    expect(f.geometry.type).toBe("Polygon");
  });
});

describe("LineItemSchema", () => {
  it("rejects a price band that is out of order", () => {
    const item = {
      id: "li-1",
      componentId: null,
      category: "mobilization",
      description: { en: "Mobilization", fr: "Mobilisation" },
      quantity: 1,
      unit: "lump",
      quantitySource: { en: "Project allowance", fr: "Allocation du projet" },
      unitPrice: { low: 10, typical: 5, high: 20 },
      unitPriceSource: { en: "Sample", fr: "Échantillon" },
      priceCategory: "general",
      total: 5,
      isQuantityOverridden: false,
      isPriceOverridden: false,
      lowConfidence: false,
    };
    expect(LineItemSchema.safeParse(item).success).toBe(false);
    expect(
      LineItemSchema.safeParse({
        ...item,
        unitPrice: { low: 5, typical: 5, high: 20 },
      }).success,
    ).toBe(true);
  });
});
