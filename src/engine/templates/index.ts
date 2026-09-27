import type { ComponentType } from "@/lib/schemas";
import { withDemolition } from "../demolition";
import { withSiteReviews } from "../site-reviews";
import type { ComponentTemplate } from "../types";
import { buildingTemplate } from "./building";
import { customTemplate } from "./custom";
import { parkTemplate } from "./park";
import { parkingTemplate } from "./parking";
import { roadTemplate } from "./road";
import { structureTemplate } from "./structure";

export const templates: Record<ComponentType, ComponentTemplate> = {
  road: withSiteReviews(roadTemplate),
  park: withSiteReviews(withDemolition(parkTemplate)),
  building: withSiteReviews(withDemolition(buildingTemplate)),
  structure: withSiteReviews(structureTemplate),
  parking: withSiteReviews(withDemolition(parkingTemplate)),
  custom: customTemplate,
};
