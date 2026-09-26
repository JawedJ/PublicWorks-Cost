import { UnitPricesFileSchema, type UnitPricesFile } from "@/lib/schemas";
import unitPricesJson from "./unit-prices.json";

// Seed data (SPEC 8), parsed once so consumers get typed, validated objects.
// Sample data only: every file has `meta.sample: true`. Treat as read-only.
// P2.4 assembles these into the engine's `RefData`.

export const unitPrices: UnitPricesFile =
  UnitPricesFileSchema.parse(unitPricesJson);
