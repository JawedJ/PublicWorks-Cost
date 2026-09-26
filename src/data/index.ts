import {
  BuildingCostsFileSchema,
  ParkFeaturesFileSchema,
  StructuresFileSchema,
  UnitPricesFileSchema,
  type BuildingCostsFile,
  type ParkFeaturesFile,
  type StructuresFile,
  type UnitPricesFile,
} from "@/lib/schemas";
import buildingCostsJson from "./building-costs.json";
import parkFeaturesJson from "./park-features.json";
import structuresJson from "./structures.json";
import unitPricesJson from "./unit-prices.json";

// Seed data (SPEC 8), parsed once so consumers get typed, validated objects.
// Sample data only: every file has `meta.sample: true`. Treat as read-only.
// P2.4 assembles these into the engine's `RefData`.

export const unitPrices: UnitPricesFile =
  UnitPricesFileSchema.parse(unitPricesJson);
export const buildingCosts: BuildingCostsFile =
  BuildingCostsFileSchema.parse(buildingCostsJson);
export const parkFeatures: ParkFeaturesFile =
  ParkFeaturesFileSchema.parse(parkFeaturesJson);
export const structures: StructuresFile =
  StructuresFileSchema.parse(structuresJson);
