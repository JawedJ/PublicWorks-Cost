import type { ComponentType } from "@/lib/schemas";
import type { ComponentTemplate } from "../types";
import { buildingTemplate } from "./building";
import { customTemplate } from "./custom";
import { parkTemplate } from "./park";
import { roadTemplate } from "./road";
import { structureTemplate } from "./structure";

export const templates: Record<ComponentType, ComponentTemplate> = {
  road: roadTemplate,
  park: parkTemplate,
  building: buildingTemplate,
  structure: structureTemplate,
  custom: customTemplate,
};
