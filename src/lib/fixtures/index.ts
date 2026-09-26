import {
  EstimateSchema,
  ProjectSchema,
  type Estimate,
  type Project,
} from "@/lib/schemas";
import northgateEstimateJson from "./northgate.estimate.json";
import northgateProjectJson from "./northgate.project.json";

// Hand-written sample fixtures (TEAM.md 3.6) for building views before the live engine is wired.
// Parsed once so consumers get typed, validated objects. Treat as read-only; clone before editing.

export const northgateProject: Project =
  ProjectSchema.parse(northgateProjectJson);
export const northgateEstimate: Estimate = EstimateSchema.parse(
  northgateEstimateJson,
);
