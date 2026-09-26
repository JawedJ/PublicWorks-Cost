import type { ComponentType } from "@/lib/schemas";
import { withDemolition } from "../demolition";
import type { ComponentTemplate } from "../types";
import { buildingTemplate } from "./building";
import { customTemplate } from "./custom";
import { parkTemplate } from "./park";
import { parkingTemplate } from "./parking";
import { roadTemplate } from "./road";
import { structureTemplate } from "./structure";

export const templates: Record<ComponentType, ComponentTemplate> = {
  road: roadTemplate,
  park: withDemolition(parkTemplate),
  building: withDemolition(buildingTemplate),
  structure: structureTemplate,
  parking: withDemolition(parkingTemplate),
  custom: customTemplate,
};
